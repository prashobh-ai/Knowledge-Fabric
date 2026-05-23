# Citations and Trust Model

## Why Citations Matter

In enterprise settings, the value of an AI assistant is bounded by how much its users trust its output. A chatbot that gives confident but unverifiable answers creates more work for its users than it saves, because every response must be independently validated before it can be acted on.

Citations invert this dynamic. When every claim is anchored to a specific paragraph in a specific document, the user can scan the citation card to verify the answer in seconds rather than minutes. Over time, trust accumulates: users learn which sources are reliable, which authors tend to be thorough, and which sections of the corpus are well-maintained.

## The Citation Breadcrumb

### Document Name

Every citation displays the source file name prominently. The user can immediately recognize whether the cited material comes from an architecture document, a runbook, a meeting note, or a policy file. File names are not abbreviated or truncated unless they exceed sixty characters.

### Page Number

For PDF and DOCX sources, the page number is preserved through the parsing pipeline. Users who want to verify an answer in the original document can navigate directly to the cited page. For Markdown and plain text sources, the page number defaults to one because these formats lack pagination.

### Section Path

The section path is the most distinctive element of the breadcrumb. When the user sees a citation that reads Architecture greater than Runtime greater than Client-Side BM25 Search, the citation is doing more than identifying a location. It is signaling the conceptual context in which the cited passage was written, which helps the user evaluate whether the citation is on-point.

Section paths are derived during parsing. For Markdown documents, they come from the heading hierarchy. For DOCX files, they come from style names. For PDFs and plain text, they are heuristically inferred from formatting cues.

### Paragraph Excerpt

The citation card displays the first sentence of the most relevant paragraph from the retrieved chunk. This preview lets the user judge relevance without expanding the full chunk text. Power users often grade the quality of an answer purely from the excerpt previews, never opening the full chunks.

## Confidence Scoring

Each citation carries a confidence score derived from the BM25 ranking. The score is normalized to the range zero to one by dividing the raw BM25 score by the maximum score in the result set. A score above zero point seven indicates strong textual alignment with the query, scores between zero point three and zero point seven indicate moderate alignment, and scores below zero point three are typically not surfaced to the user.

The confidence score is a useful signal but it is not a guarantee of correctness. Users are encouraged to read the citation excerpt and follow through to the source when the stakes of the decision warrant it.

## The Reasoning Trace

Beyond individual citations, the Knowledge Fabric exposes a reasoning trace for every answer. The trace consists of three elements: the set of chunks retrieved, the entities extracted from those chunks, and the relationships connecting those entities in the knowledge graph.

The trace is rendered in the knowledge graph panel as a highlighted subgraph. Nodes in the subgraph represent entities that appeared in the retrieved chunks. Edges in the subgraph represent relationships that are supported by those chunks. Hovering on any node reveals the chunks where the entity was observed.

This visualization makes the reasoning process inspectable. Users can see at a glance which concepts the system traversed to construct an answer, and whether the traversal makes intuitive sense for the question they asked.
