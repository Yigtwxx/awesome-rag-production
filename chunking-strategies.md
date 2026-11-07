# Chunking Strategies for RAG

How you split documents into chunks is one of the most underrated decisions in a
RAG pipeline. The wrong chunking strategy silently degrades retrieval quality
regardless of how good your embedding model or vector database is — you can't
retrieve what you never indexed coherently. This guide walks through the main
chunking strategies, when each fits, and how to evaluate the choice on your own
corpus.

> Deep-dive companion to the
> [Chunking & Document Processing section](README.md#chunking--document-processing)
> in the main list. For the *failure modes* this page helps you avoid, see
> [rag-pitfalls.md — Data Ingestion & Chunking](rag-pitfalls.md#data-ingestion--chunking).

---

## Why chunking matters

A chunk is the atomic unit of retrieval: it is what gets embedded, indexed, and
ultimately handed to the LLM. Two competing pressures shape the right size:

- **Too large** → the embedding averages several topics, so similarity matching
  becomes coarse and precision drops.
- **Too small** → individual chunks lose the surrounding context the LLM needs to
  answer, even when retrieval finds the right fragment.

Chunking interacts with everything downstream: chunk size affects retrieval
recall, the "lost in the middle" effect in long prompts, and your token cost per
query. Get it wrong and no reranker or prompt tweak fully recovers.

---

## Strategy catalog

| Strategy | When to use | Trade-off |
| :--- | :--- | :--- |
| **Fixed-size (token count)** | Baseline; simple, uniform corpora | Splits mid-sentence/table; fast and dependency-free |
| **Recursive character split** | General text, mixed formats | Respects paragraph → sentence → word boundaries; sane default |
| **Semantic chunking** | Heterogeneous corpora, varying density | Higher quality; needs an embedding model at index time (slower, costlier) |
| **Document-type aware** | PDFs, code, tables, HTML | Best recall on structured docs; requires per-type parsers |
| **Hierarchical / small-to-big** | Multi-hop retrieval | Retrieve small chunks, return parent context to the LLM |
| **Late chunking** | Long documents where chunk context matters | Embeds the full document first, then pools per-chunk — preserves global context |

### Fixed-size chunking

Split on a fixed token count (e.g. every 512 tokens), optionally with overlap.
It is fast, deterministic, and has no dependencies — a legitimate baseline. The
cost is that it cuts blindly through sentences, tables, and code blocks,
fragmenting exactly the structured content where precision matters most.

### Recursive character splitting

The de facto default. It tries a priority list of separators (`\n\n` → `\n` →
` `) to break at the most natural boundary that still fits the target window.
Robust, fast, no embedding model required — start here unless you have a specific
reason not to.

### Semantic chunking

Instead of a fixed length, it embeds adjacent sentences and cuts where cosine
distance spikes — i.e. at genuine topic shifts. This produces more coherent
chunks for narrative and technical content, at the cost of running an embedding
model during indexing (slower and more expensive at scale).

### Document-type aware chunking

Different document types want different splitters: keep tables intact, split code
on function boundaries, respect HTML structure. This needs upstream parsing
(e.g. [Unstructured](https://github.com/Unstructured-IO/unstructured),
[Marker](https://github.com/datalab-to/marker)) but delivers the best recall on
heterogeneous, structured corpora.

### Hierarchical (small-to-big)

Index small, precise chunks for matching, but return their larger parent section
to the LLM. You get the retrieval precision of small chunks with the answer
context of large ones — strong for multi-hop and long-document QA. The cost is a
more complex index that stores chunk→parent relationships.

### Late chunking

A newer approach: embed the entire document (or a long window) with a long-context
model first, then pool token embeddings into per-chunk vectors. Each chunk's
embedding therefore "knows" its global context, mitigating the context-loss
problem of naive splitting. Supported by libraries like
[chonkie](https://github.com/feyninc/chonkie).

---

## Chunk size & overlap

There is no universal best size. **256–512 tokens is a common starting point**,
not a guarantee — treat it as the value you tune away from, measured against your
own corpus.

- **Smaller chunks (128–256)** favor precision and pointed factual lookups.
- **Larger chunks (512–1024)** favor context-heavy, narrative, or reasoning
  answers.
- **Overlap (~10–20%)** preserves context across boundaries so a sentence split
  between two chunks isn't orphaned. Overlap increases index size and cost, so
  tune it rather than maxing it.

Different document types deserve different sizes: short chat logs and FAQs want
smaller chunks; dense technical docs tolerate larger ones. Using one size
everywhere is a documented anti-pattern — see
[rag-pitfalls.md](rag-pitfalls.md#data-ingestion--chunking).

---

## Preserve metadata

Chunking is also where you attach the metadata that makes retrieval filterable
and answers citable: source, title, section heading, timestamp, author, and a
stable chunk ID. Without it you can retrieve the right text but can't cite it,
filter by recency, or filter by tenant/ACL — and good filtering is what makes a
[vector database](vector-database-comparison.md) useful in production. Embedding
the section heading or a short document summary *into* each chunk's text
("contextual" chunking) often improves retrieval on fragmented documents.

---

## Tooling

| Tool | Strategies | Best for |
| :--- | :--- | :--- |
| [chonkie](https://github.com/feyninc/chonkie) | Token, sentence, recursive, semantic, late | Fast, low-dependency batch indexing |
| [LangChain RecursiveCharacterTextSplitter](https://python.langchain.com/docs/how_to/recursive_text_splitter/) | Recursive | General-purpose default |
| [LlamaIndex SemanticSplitterNodeParser](https://docs.llamaindex.ai/en/stable/module_guides/loading/node_parsers/modules/) | Semantic | Coherent chunks for narrative/technical docs |
| [semchunk](https://github.com/isaacus-dev/semchunk) | Statistical semantic | Low-cost semantic splitting, no embedder at chunk time |
| [Unstructured](https://github.com/Unstructured-IO/unstructured) | Document-type aware parsing | PDF/DOCX/HTML/image pre-processing upstream of any splitter |

See the [main Chunking section](README.md#chunking--document-processing) for the
full annotated entries.

---

## Evaluate, don't guess

Chunking quality is measurable — pick the strategy empirically rather than by
intuition. Build a small golden set (question → expected source chunk) and track:

- **Context Recall** — did the right chunk get retrieved at all? (A chunking
  problem if not.)
- **Context Precision** — how much retrieved text is actually relevant? (Falls
  when chunks are too large.)

Use [Ragas](https://github.com/vibrantlabsai/ragas) or
[DeepEval](https://github.com/confident-ai/deepeval) to sweep chunk size,
overlap, and strategy against these metrics. Re-run the sweep whenever you change
embedding models — the optimal chunk size shifts with the model's context window
and training. Datasets for this live in [datasets.md](datasets.md).

---

## Choosing: a quick decision path

1. **Start** with recursive splitting at 256–512 tokens, ~15% overlap.
2. **Structured docs** (PDFs, tables, code, HTML)? Add document-type aware parsing
   (Unstructured/Marker) before splitting.
3. **Heterogeneous density / mixed topics**? Move to semantic chunking.
4. **Multi-hop or long-document QA**? Add hierarchical small-to-big retrieval.
5. **Retrieval still weak on long docs**? Try late chunking.
6. **Always** measure each change with Ragas/DeepEval before keeping it.

---

## Further reading

- [Chunking & Document Processing — main list](README.md#chunking--document-processing)
- [RAG Pitfalls — Data Ingestion & Chunking](rag-pitfalls.md#data-ingestion--chunking)
- [Embedding Model Selection](embedding-model-selection.md) — chunk size and model
  context window are linked decisions
- [Vector Database Comparison](vector-database-comparison.md) — where your chunks
  get indexed
- [Datasets](datasets.md) — build a golden set to evaluate chunking

([back to main resource](README.md))
