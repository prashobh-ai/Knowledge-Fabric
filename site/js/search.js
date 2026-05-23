// =============================================================================
// BM25 client — queries the precomputed index in-memory.
// =============================================================================

const TOKEN_RE = /[A-Za-z0-9]+/g;

export function tokenize(text) {
  const out = [];
  const matches = text.toLowerCase().matchAll(TOKEN_RE);
  for (const m of matches) {
    if (m[0].length > 1) out.push(m[0]);
  }
  return out;
}

// =============================================================================
// Ranker
// =============================================================================
export class BM25 {
  constructor(bm25Index) {
    this.termId = bm25Index.term_id;
    this.idf = bm25Index.idf;
    this.docLen = bm25Index.doc_len;
    this.avgdl = bm25Index.avgdl;
    this.postings = bm25Index.postings;
    this.k1 = bm25Index.k1;
    this.b = bm25Index.b;
    this.N = bm25Index.doc_len.length;
  }

  search(query, topK = 6) {
    const terms = tokenize(query);
    if (terms.length === 0 || this.N === 0) return [];

    const scores = new Float32Array(this.N);
    const seen = new Set();

    for (const term of terms) {
      const tid = this.termId[term];
      if (tid === undefined) continue;
      const idf = this.idf[tid];
      const posting = this.postings[tid] || [];
      for (const [chunkIdx, tf] of posting) {
        const dl = this.docLen[chunkIdx];
        const norm = 1 - this.b + this.b * (dl / this.avgdl);
        const score = idf * (tf * (this.k1 + 1)) / (tf + this.k1 * norm);
        scores[chunkIdx] += score;
        seen.add(chunkIdx);
      }
    }

    const ranked = [];
    for (const idx of seen) {
      if (scores[idx] > 0) ranked.push({ chunkIdx: idx, score: scores[idx] });
    }
    ranked.sort((a, b) => b.score - a.score);
    return ranked.slice(0, topK);
  }
}

// =============================================================================
// Document-cohesion clustering — prevents Frankenstein answers across unrelated
// docs by collapsing the candidate pool to chunks from the dominant document(s).
// =============================================================================
//
// Why this exists: BM25 ranks chunks independently. Across a small focused
// corpus that's fine. Across a 50-doc heterogeneous corpus, the top-K chunks
// can come from unrelated documents, and stitching them produces incoherent
// answers. This step picks the document(s) where the query has the strongest
// aggregate signal, then returns only chunks from those.
//
// confidence = distinctness of the top chunk vs the rest of the candidate
// pool. Low confidence means the query terms matched broadly but weakly — no
// document is clearly authoritative — and the caller should signal that.
// =============================================================================
export function cohereByDocument(rawRanked, chunks, opts = {}) {
  const maxChunks = opts.maxChunks ?? 6;
  const dominanceThreshold = opts.dominanceThreshold ?? 1.5;
  // Confidence floor calibrated against small (4-doc) and medium (50-doc)
  // corpora. Smaller corpora produce tighter score distributions because
  // there's less noise — so a 1.3x gap between the top chunk and the tail
  // is meaningful. Truly weak queries land below 1.2.
  const minConfidentRatio = opts.minConfidentRatio ?? 1.3;

  if (rawRanked.length === 0) {
    return { ranked: [], confidence: 0, docIds: [], dominantDoc: null, isConfident: false };
  }

  // Aggregate BM25 scores per source document
  const docScores = new Map();
  for (const r of rawRanked) {
    const docId = chunks[r.chunkIdx].document_id;
    docScores.set(docId, (docScores.get(docId) || 0) + r.score);
  }

  // Rank documents by aggregate score
  const sortedDocs = [...docScores.entries()].sort((a, b) => b[1] - a[1]);
  const topDocAgg = sortedDocs[0][1];
  const secondDocAgg = sortedDocs[1]?.[1] || 0;
  const dominates = secondDocAgg === 0 || topDocAgg / secondDocAgg >= dominanceThreshold;

  // Keep top 1 doc when one clearly dominates, otherwise top 2 for context blending
  const keepDocIds = new Set(
    dominates ? [sortedDocs[0][0]] : [sortedDocs[0][0], sortedDocs[1][0]]
  );

  const filtered = rawRanked
    .filter(r => keepDocIds.has(chunks[r.chunkIdx].document_id))
    .slice(0, maxChunks);

  // Confidence quality: gap between top chunk score and the tail of the pool.
  // High distinctness = the query strongly matched one specific area.
  const topScore = filtered[0]?.score || 0;
  const tailIdx = Math.min(rawRanked.length - 1, 9);
  const tailScore = rawRanked[tailIdx]?.score || 0.0001;
  const distinctness = topScore / tailScore;
  const confidence = Math.min(1, distinctness / 4);
  const isConfident = distinctness >= minConfidentRatio;

  return {
    ranked: filtered,
    confidence,
    distinctness,
    isConfident,
    docIds: [...keepDocIds],
    dominantDoc: chunks[filtered[0]?.chunkIdx]?.document_name || null,
    totalDocsConsidered: sortedDocs.length,
  };
}
