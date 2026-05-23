# Phase One Roadmap

## Four-Week Plan

The first phase of the Knowledge Fabric is scoped to four weeks and is designed to produce a demonstrable artifact that can be shared with potential clients to validate interest before committing to a heavier build.

### Week One

The focus of week one is the document ingestion pipeline. The team implements parsers for Markdown, plain text, PDF, and DOCX, with structural heading detection in each format. The output of week one is a build script that reads a directory of source documents and emits a structured representation that downstream stages can consume.

### Week Two

Week two builds the retrieval layer and the chat interface. The BM25 index is precomputed from the chunked corpus and serialized to a single JSON file. The browser implements ranking entirely client-side. The chat UI is implemented with citation cards that render the document, page, section, and paragraph breadcrumb.

### Week Three

Week three adds the knowledge graph. Entities are extracted using regex patterns, relationships are mined from co-occurrence within chunks, and the graph is rendered using a force-directed layout library in the browser. The reasoning trace feature ties chat answers back to the graph by highlighting the relevant subgraph for every query.

### Week Four

Week four is polish and deployment. The visual design is refined to be presentable to enterprise clients, the project is wired up to GitHub Pages with a GitHub Actions workflow that rebuilds the index on every push, and documentation is written to explain how to fork the repository and add new source documents.

## Non-Goals for Phase One

Phase one explicitly does not include several capabilities that are commonly assumed for retrieval-augmented chat systems.

There is no vector embedding model. BM25 is sufficient for the demonstration corpus and avoids the operational complexity of hosting an embedding service.

There is no large language model in the answer path. The chatbot returns extractive answers composed from the highest-ranked chunks, with the chunk excerpts presented verbatim. This is a deliberate choice: phase one is about establishing trust through citations, and an LLM-generated summary would introduce a layer of fabrication that the citations cannot fully constrain.

There is no backend service. The application is a static site. All ranking, graph rendering, and reasoning trace computation runs in the browser.

There is no authentication, role-based access, or per-document permissioning. Every document in the indexed corpus is visible to every user of the site. Phase two will introduce these capabilities for deployments that handle sensitive material.

## Success Criteria

The phase one milestone is met when a potential client can be sent a URL, click through to the live site, ask a series of questions about the indexed material, and walk away with a clear understanding of three things. First, the chatbot returns accurate answers grounded in the source corpus. Second, every claim in those answers is verifiable against a specific document location through the citation breadcrumb. Third, the knowledge graph makes the reasoning behind each answer inspectable.

If a client demo can be completed in fifteen minutes and the prospective customer can ask any reasonable question about the indexed material and receive a satisfactory citation-grounded response, phase one has succeeded.

## What Phase Two Will Add

Phase two introduces a hosted backend for larger corpora that exceed the practical size of an in-browser index. Vector embeddings are added as a complement to BM25 for semantic retrieval. A small language model is introduced for answer synthesis, with careful attention to the boundary between LLM-generated text and citation-grounded claims. Authentication, role-based access, and connector integrations with Confluence and Jira are added to enable production deployments.

Phase two is scoped at eight to twelve weeks and is initiated only after phase one has validated demand with at least two prospective clients.
