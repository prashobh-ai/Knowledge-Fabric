# Knowledge Fabric Architecture

## System Design Principles

The Knowledge Fabric follows three architectural principles that distinguish it from generic chatbot solutions: every answer is grounded, every entity is auditable, and every component is portable.

Grounding means that no claim is produced without an attached citation. The chatbot cannot speak about a topic that is not present in the indexed corpus, and it cannot paraphrase beyond what the source material supports.

Auditability means that every entity in the knowledge graph carries provenance. Clicking a node in the graph reveals the chunks where that entity was observed and the documents those chunks came from.

Portability means that the entire platform runs from a static deployment. There is no backend service to operate, no database to maintain, and no external API key required for the core retrieval experience.

## Build-Time Pipeline

### Document Parsing

The parsing layer extracts structural information from source documents. For Markdown, headings are identified directly from H1 through H4 tags. For DOCX files, the parser reads the style name on each paragraph and uses the Heading 1 through Heading 4 styles to build a section hierarchy. For PDFs, the parser applies a heuristic that treats short lines without terminal punctuation as candidate headings.

The result of parsing is a flat list of paragraphs, each annotated with its page number, section path, and ordinal index within the document. This annotation is what enables the citation breadcrumb that the chatbot exposes to users.

### Chunking Strategy

The chunker groups consecutive paragraphs into chunks of approximately seven hundred characters. Chunk boundaries respect section boundaries: when a heading changes, the current chunk is closed and a new one begins. This guarantees that no chunk straddles two unrelated topics, which is essential for citation precision.

Each chunk carries the section path of the first paragraph it contains, the page number, the ordinal indices of the paragraphs that compose it, and the first sentence as a preview excerpt for the citation card UI.

### Entity Extraction

Phase one uses regex-based entity extraction. Two patterns drive recognition: a proper noun pattern that matches sequences of capitalized words, and an acronym pattern that matches sequences of two to six uppercase letters. The extractor filters out singletons, stopword-only matches, and common articles.

The output is a list of entities with canonical names, surface forms, mention counts, and back-references to the chunks where each entity appeared.

### Relationship Mining

Relationships are derived from co-occurrence within a chunk. When two entities appear in the same chunk, an edge is created between them. Edge weight equals the number of chunks in which the pair co-occurs. Relationships with weight below two are filtered out as noise.

Each relationship carries an evidence list pointing to the chunks that support it. This evidence trail is what powers the reasoning trace feature.

## Runtime Architecture

### Static Index Loading

When the page loads, the browser fetches a single JSON file containing all documents, chunks, entities, relationships, and a precomputed BM25 index. The index is typically between fifty kilobytes and two megabytes for a small to mid-sized corpus, well within acceptable load times even on mobile networks.

After loading, all retrieval and graph rendering happens in the browser. There is no network call after the initial fetch.

### Client-Side BM25 Search

The browser implements BM25 ranking using the precomputed inverted index. For each query, the tokenizer splits the input into terms, looks up each term's posting list, and accumulates scores using the BM25 formula with k1 equal to one point five and b equal to zero point seven five. Results are sorted by score and returned with their full chunk metadata for citation rendering.

### Reasoning Trace

For every chat answer, the system computes a reasoning trace. The trace identifies which entities appear in the retrieved chunks, which relationships connect them, and renders this subgraph in the knowledge graph panel. The user sees not just what the answer says, but which concepts the system traversed to arrive at it.
