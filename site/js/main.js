// ============================================================================
// Knowledge Fabric · Command Center — main entry
// ============================================================================

import { BM25 } from './search.js';
import { buildAnswer } from './answer.js';
import { KnowledgeGraph } from './graph.js';
import { initInsights } from './insights.js';
import { initLineage, renderLineage } from './lineage.js';
import { initExplain, openExplain } from './explain.js';

const INDEX_URL = 'data/index.json';

// ============================================================================
// Global state
// ============================================================================
const state = {
  index: null,
  bm25: null,
  graph: null,
  chunks: [],
  chunksById: new Map(),
  entitiesById: new Map(),
  lastQuery: null,
  lastResult: null,
};

// ============================================================================
// Boot
// ============================================================================
async function boot() {
  try {
    const res = await fetch(INDEX_URL);
    if (!res.ok) throw new Error(`Failed to load index: ${res.status}`);
    state.index = await res.json();
  } catch (err) {
    showFatalError(err.message);
    return;
  }

  state.chunks = state.index.chunks;
  state.chunksById = new Map(state.chunks.map(c => [c.id, c]));
  state.entitiesById = new Map(state.index.entities.map(e => [e.id, e]));
  state.bm25 = new BM25(state.index.bm25);

  renderCommandTiles();
  setupGalaxy();
  setupCopilot();
  setupSuggestions();

  initLineage({ onChunkClick: id => showChunkDetail(state.chunksById.get(id)) });
  initExplain(state.index);
  initInsights(state.index, { onEntityClick: showEntityDetail });
}

function showFatalError(message) {
  document.getElementById('messages').innerHTML = `
    <div class="copilot-empty">
      <p style="color:var(--danger);font-weight:500">Couldn't load the knowledge index.</p>
      <p style="margin-top:6px;color:var(--text-mute);font-size:12px">${escapeHtml(message)}</p>
      <p style="margin-top:8px;color:var(--text-mute);font-size:11px">Build the index first: <code>python -m pipeline.build_index</code></p>
    </div>`;
}

// ============================================================================
// Command Center tiles
// ============================================================================
function renderCommandTiles() {
  const s = state.index.stats;
  setTile('documents', s.document_count);
  setTile('entities', s.entity_count);
  setTile('relationships', s.relationship_count);
  setTile('chunks', s.chunk_count);
  setTile('domains', estimateDomains());
}

function setTile(key, value) {
  const el = document.getElementById(`tile-${key}`);
  if (!el) return;
  animateNumber(el, value);
}

function animateNumber(el, target) {
  const duration = 700;
  const start = performance.now();
  function step(t) {
    const p = Math.min(1, (t - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = formatNumber(Math.round(target * eased));
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function formatNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 10_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

// Heuristic: domains = clusters of high-mention entities + top-level document themes
function estimateDomains() {
  const docTopSections = new Set();
  for (const c of state.chunks) {
    if (c.section_path?.length) docTopSections.add(c.section_path[0]);
  }
  return Math.max(state.index.documents.length, docTopSections.size);
}

// ============================================================================
// Knowledge Galaxy (graph)
// ============================================================================
function setupGalaxy() {
  const container = document.getElementById('galaxy');
  state.graph = new KnowledgeGraph(container, state.index);
  state.graph.render();
  state.graph.onEntityClick = showEntityDetail;

  document.getElementById('galaxy-detail-close').addEventListener('click', () => {
    document.getElementById('galaxy-detail').hidden = true;
  });

  document.getElementById('galaxy-status').textContent =
    `${state.index.stats.entity_count} entities · ${state.index.stats.relationship_count} relationships · ask a question to traverse`;
}

// ============================================================================
// AI Copilot — chat
// ============================================================================
function setupCopilot() {
  const form = document.getElementById('composer-form');
  const input = document.getElementById('composer-input');
  const submit = document.getElementById('composer-submit');

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    input.value = '';
    submit.disabled = true;
    await ask(q);
    submit.disabled = false;
    input.focus();
  });
}

function setupSuggestions() {
  document.querySelectorAll('#suggestions .chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('composer-input').value = btn.textContent.trim();
      document.getElementById('composer-form').dispatchEvent(new Event('submit'));
    });
  });
}

// ============================================================================
// Ask flow — orchestrates all four panes
// ============================================================================
async function ask(question) {
  clearCopilotEmpty();
  appendUserMessage(question);

  await new Promise(r => setTimeout(r, 80));

  const ranked = state.bm25.search(question, 6);
  const { answerHtml, citations } = buildAnswer(question, ranked, state.chunks);

  const trace = state.graph.highlightTrace(citations.map(c => c.chunk.id));

  state.lastQuery = question;
  state.lastResult = { ranked, citations, answerHtml, trace };

  appendAssistantMessage(question, answerHtml, citations, ranked, trace);
  renderLineage(question, answerHtml, citations);
  updateCopilotMetrics(citations, trace, ranked);
  updateGalaxyStatus(trace);
}

function updateCopilotMetrics(citations, trace, ranked) {
  const metricsEl = document.getElementById('copilot-metrics');
  metricsEl.hidden = false;
  const topConf = citations[0]?.confidence ? Math.round(citations[0].confidence * 100) : 0;
  document.getElementById('m-conf').textContent = `${topConf}%`;
  document.getElementById('m-sources').textContent = citations.length;
  document.getElementById('m-rels').textContent = trace.edgeCount;
  document.getElementById('m-paths').textContent = Math.max(1, trace.edgeCount);
}

function updateGalaxyStatus(trace) {
  const el = document.getElementById('galaxy-status');
  if (trace.activeEntities.length === 0) {
    el.textContent = 'No entities activated — try a more specific question.';
    return;
  }
  el.textContent = `${trace.activeEntities.length} activated · ${trace.neighborCount} neighbors · ${trace.edgeCount} relationships traversed`;
}

// ============================================================================
// Message rendering
// ============================================================================
function clearCopilotEmpty() {
  const empty = document.querySelector('.copilot-empty');
  if (empty) empty.remove();
}

function appendUserMessage(text) {
  const tpl = document.getElementById('tpl-user-msg').content.cloneNode(true);
  tpl.querySelector('.msg-bubble').textContent = text;
  document.getElementById('messages').appendChild(tpl);
  scrollMessages();
}

function appendAssistantMessage(question, answerHtml, citations, ranked, trace) {
  const tpl = document.getElementById('tpl-assistant-msg').content.cloneNode(true);
  const root = tpl.querySelector('.msg-assistant');
  root.querySelector('.answer-text').innerHTML = answerHtml;

  // Confidence bar
  const topConf = citations[0]?.confidence ?? 0;
  const pct = Math.round(topConf * 100);
  root.querySelector('.ac-fill').style.width = `${pct}%`;
  root.querySelector('.ac-value').textContent = `${pct}%`;

  // Explain Answer button — opens overlay with reasoning pipeline
  root.querySelector('.action-explain').addEventListener('click', () => {
    openExplain({
      question,
      ranked,
      citations,
      traceEntities: trace.activeEntities,
      traceEdges: trace.edgeCount,
      answerHtml,
    });
  });

  // Inline [#N] citation refs → chunk detail in galaxy detail card
  root.querySelectorAll('.cite-ref').forEach(ref => {
    ref.addEventListener('click', () => {
      const n = parseInt(ref.dataset.cite, 10);
      const cite = citations.find(c => c.num === n);
      if (cite) showChunkDetail(cite.chunk);
    });
  });

  document.getElementById('messages').appendChild(tpl);
  scrollMessages();

  // Also expose the global "Explain Answer" button in the lineage pane header
  const explainBtn = document.getElementById('explain-btn');
  explainBtn.hidden = false;
  explainBtn.onclick = () => openExplain({
    question, ranked, citations,
    traceEntities: trace.activeEntities,
    traceEdges: trace.edgeCount,
    answerHtml,
  });
}

function scrollMessages() {
  const el = document.getElementById('messages');
  el.scrollTop = el.scrollHeight;
}

// ============================================================================
// Galaxy detail card — entity and chunk views
// ============================================================================
function showChunkDetail(chunk) {
  if (!chunk) return;
  const sectionPath = chunk.section_path?.length ? chunk.section_path.join(' › ') : '—';
  const entities = (chunk.entities || []).map(id => state.entitiesById.get(id)).filter(Boolean);

  const html = `
    <div class="entity-card-eyebrow">Retrieved Knowledge Unit</div>
    <div class="entity-card-title">${escapeHtml(stripExt(chunk.document_name))}</div>
    <div class="entity-card-meta">
      <div class="kv"><span class="k">Page</span><span class="v">${chunk.page}</span></div>
      <div class="kv"><span class="k">Paragraphs</span><span class="v">¶${chunk.paragraph_indices.join(', ¶')}</span></div>
      <div class="kv" style="flex:1;min-width:140px"><span class="k">Section Path</span><span class="v" style="font-size:11.5px;font-family:var(--font-sans);font-style:italic;color:var(--text-dim)">${escapeHtml(sectionPath)}</span></div>
    </div>
    <div class="entity-card-section">
      <h4>Full passage</h4>
      <div class="evidence" style="cursor:default">
        <div class="evidence-text" style="-webkit-line-clamp:unset;color:var(--text)">${escapeHtml(chunk.text)}</div>
      </div>
    </div>
    ${entities.length ? `
    <div class="entity-card-section">
      <h4>Entities in this passage</h4>
      <div class="entity-card-pills">
        ${entities.map(e => `<button class="pill pill-accent" data-eid="${e.id}">${escapeHtml(e.name)}</button>`).join('')}
      </div>
    </div>` : ''}`;

  openGalaxyDetail(html);
  bindDetailLinks();
}

function showEntityDetail(entityId) {
  const e = state.entitiesById.get(entityId);
  if (!e) return;
  state.graph.focusEntity(entityId);

  const chunks = e.chunk_ids
    .map(id => state.chunksById.get(id))
    .filter(Boolean)
    .slice(0, 4);

  const docs = new Set(chunks.map(c => c.document_name));

  const related = [];
  for (const r of state.index.relationships) {
    if (r.source === entityId) related.push({ id: r.target, weight: r.weight });
    else if (r.target === entityId) related.push({ id: r.source, weight: r.weight });
  }
  related.sort((a, b) => b.weight - a.weight);
  const relatedTop = related.slice(0, 8).map(r => state.entitiesById.get(r.id)).filter(Boolean);

  // Premium entity card: Purpose (most-cited excerpt) · Dependencies (related entities)
  // · Appears In (documents) · Evidence (chunks)
  const purposeChunk = chunks[0];
  const purpose = purposeChunk?.paragraph_excerpt || purposeChunk?.text?.slice(0, 200) || '';

  const html = `
    <div class="entity-card-eyebrow">Entity · ${escapeHtml(e.kind)}</div>
    <div class="entity-card-title">${escapeHtml(e.name)}</div>
    <div class="entity-card-meta">
      <div class="kv"><span class="k">Mentions</span><span class="v">${e.mention_count}</span></div>
      <div class="kv"><span class="k">Documents</span><span class="v">${docs.size}</span></div>
      <div class="kv"><span class="k">Knowledge Units</span><span class="v">${e.chunk_ids.length}</span></div>
      <div class="kv"><span class="k">Connections</span><span class="v">${related.length}</span></div>
    </div>

    ${purpose ? `
    <div class="entity-card-section">
      <h4>Purpose</h4>
      <p style="font-size:12.5px;color:var(--text-dim);line-height:1.55">${escapeHtml(purpose)}</p>
    </div>` : ''}

    ${relatedTop.length ? `
    <div class="entity-card-section">
      <h4>Dependencies & related concepts</h4>
      <div class="entity-card-pills">
        ${relatedTop.map(r => `<button class="pill" data-eid="${r.id}">${escapeHtml(r.name)}</button>`).join('')}
      </div>
    </div>` : ''}

    ${docs.size ? `
    <div class="entity-card-section">
      <h4>Appears in</h4>
      <div class="entity-card-pills">
        ${[...docs].map(d => `<span class="pill pill-accent" style="cursor:default">${escapeHtml(stripExt(d))}</span>`).join('')}
      </div>
    </div>` : ''}

    <div class="entity-card-section">
      <h4>Evidence</h4>
      ${chunks.map(c => {
        const section = c.section_path?.length ? c.section_path.join(' › ') : '';
        return `
          <div class="evidence" data-cid="${c.id}">
            <div class="evidence-meta">
              <span class="doc">${escapeHtml(stripExt(c.document_name))}</span>
              <span class="sep">·</span>
              <span>page ${c.page}</span>
              ${section ? `<span class="sep">·</span><span style="font-style:italic">${escapeHtml(section)}</span>` : ''}
            </div>
            <div class="evidence-text">${escapeHtml(c.text)}</div>
          </div>`;
      }).join('')}
    </div>`;

  openGalaxyDetail(html);
  bindDetailLinks();
}

function bindDetailLinks() {
  document.querySelectorAll('#galaxy-detail [data-eid]').forEach(el => {
    el.addEventListener('click', () => showEntityDetail(parseInt(el.dataset.eid, 10)));
  });
  document.querySelectorAll('#galaxy-detail [data-cid]').forEach(el => {
    el.addEventListener('click', () => showChunkDetail(state.chunksById.get(parseInt(el.dataset.cid, 10))));
  });
}

function openGalaxyDetail(html) {
  document.getElementById('galaxy-detail-body').innerHTML = html;
  document.getElementById('galaxy-detail').hidden = false;
}

// ============================================================================
// Util
// ============================================================================
function stripExt(name) {
  return name.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ============================================================================
// Bootstrap (wait for vis-network)
// ============================================================================
window.addEventListener('DOMContentLoaded', () => {
  if (typeof vis === 'undefined') {
    const check = setInterval(() => {
      if (typeof vis !== 'undefined') {
        clearInterval(check);
        boot();
      }
    }, 50);
  } else {
    boot();
  }
});
