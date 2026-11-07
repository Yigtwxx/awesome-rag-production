# How to Choose an Embedding Model for RAG

Choosing the right embedding model is one of the highest-leverage decisions in a
RAG pipeline — the wrong choice silently degrades retrieval before the LLM ever
sees the context, and no reranker or prompt fully recovers a bad first-stage
recall. This guide covers the criteria that matter, how to read the benchmarks
without being misled, and when to stop picking and start fine-tuning.

> Deep-dive companion to the
> [Embedding Models section](README.md#embedding-models) in the main list.
> Benchmark scores with citations live in
> [benchmarks.md §2](benchmarks.md#2-embeddings--retrieval).

---

## The selection criteria

Rank these against *your* corpus and constraints — not against a leaderboard
average.

| Criterion | Why it matters |
| :--- | :--- |
| **Retrieval quality** | nDCG@10 on BEIR (the MTEB *Retrieval* category) predicts first-stage recall — the metric that actually matters for RAG. |
| **Context window** | Must fit your chunk size; long-doc retrieval needs 8k+ token windows. |
| **Dimensionality** | Drives vector-DB RAM and storage cost; Matryoshka models let you truncate dimensions with graceful quality loss. |
| **Multilingual** | Non-English or mixed-language corpora need genuinely multilingual models. |
| **Hosting** | API (no GPU ops, vendor lock-in, per-token cost) vs. self-host (GPU required, full data sovereignty). |
| **License** | Apache-2.0 / MIT models can be self-hosted freely; check terms before committing. |
| **Cost** | Per-token API cost at indexing scale, or GPU cost at production throughput. |

---

## Model comparison

| Model | Strengths | Context | Hosting | Best for | Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| [OpenAI text-embedding-3-large](https://platform.openai.com/docs/guides/embeddings) | High retrieval nDCG@10 | 8,191 | API | General English retrieval | [\[3P\]](benchmarks.md#2-embeddings--retrieval) |
| [Cohere embed-v4](https://docs.cohere.com/docs/cohere-embed) | Multimodal, multilingual, int8 support | 128,000 | API + self-host | Multilingual + cost-efficient | [\[3P\]](benchmarks.md#2-embeddings--retrieval) |
| [Voyage voyage-3](https://docs.voyageai.com/docs/embeddings) | Top MTEB retrieval scores | 32,000 | API | Long-context retrieval | [\[3P\]](benchmarks.md#2-embeddings--retrieval) |
| [BAAI BGE-M3](https://huggingface.co/BAAI/bge-m3) | Multilingual, multi-granularity | 8,192 | Self-host | Open-weight multilingual | [\[3P\]](benchmarks.md#2-embeddings--retrieval) |
| [Nomic nomic-embed-text-v1.5](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5) | Long context, Apache 2.0 | 8,192 | Self-host / API | Open, long-context | — |
| [Alibaba gte-multilingual-base](https://huggingface.co/Alibaba-NLP/gte-multilingual-base) | 70+ languages, compact | 8,192 | Self-host | Multilingual, cost-sensitive | — |
| [Jina jina-embeddings-v3](https://huggingface.co/jinaai/jina-embeddings-v3) | Task-adaptive LoRA adapters | 8,192 | Self-host / API | Task-specific tuning | — |

See [benchmarks.md §2](benchmarks.md#2-embeddings--retrieval) for the nDCG@10
numbers and snapshot dates behind these rows.

---

## Read MTEB carefully

The [MTEB Leaderboard](https://huggingface.co/spaces/mteb/leaderboard) is the
canonical benchmark, but it is easy to misread:

- **Use the Retrieval category, not the overall average.** The overall MTEB score
  blends in classification, clustering, and STS tasks that don't predict RAG
  retrieval quality. Sort by **Retrieval nDCG@10 on BEIR**.
- **Beware contamination.** Several leaderboard models have been found to train on
  MTEB evaluation data, inflating scores. Treat rankings as *directional*. See
  [benchmarks.md §8 — Methodology Disputes](benchmarks.md#8-methodology-disputes).
- **Scores change weekly** as new models are submitted — verify the live board
  before deciding, and record the snapshot date.
- **The leaderboard is not your corpus.** Generic rankings rarely predict
  performance on specialized domains (legal, medical, code, finance). The only
  benchmark that counts is a held-out split of your own data.

---

## Two rules that prevent silent failures

1. **Use the same model for indexing and querying.** Embedding the corpus with one
   model and queries with another is a silent recall killer — the vectors live in
   different spaces. See
   [rag-pitfalls.md](rag-pitfalls.md#embedding-model-selection).
2. **Version-lock the model.** Don't auto-upgrade. A dimension or tokenizer change
   forces a full re-index; treat it as a planned migration with a rollback path
   (see [Data & Index Versioning](README.md#data--index-versioning)).

---

## Dimensionality vs. cost

Embedding dimensionality directly drives your vector-database memory and storage
bill — and HNSW keeps graph links in RAM, so it compounds at scale. Two levers:

- **Matryoshka (MRL) models** (e.g. OpenAI v3, nomic-embed) let you truncate
  vectors to fewer dimensions with graceful, tunable quality loss — a cheap way to
  shrink the index. Measure the recall hit on your data before committing.
- **Quantization** (int8, binary) at the database layer cuts memory further; some
  models (Cohere embed-v4) support int8 natively.

The right cut point is empirical — sweep dimensions against recall on your golden
set. See [vector-database-comparison.md](vector-database-comparison.md#cost-the-part-nobody-publishes-cleanly)
for how this flows into index cost.

---

## When to fine-tune instead

Generic MTEB leaders break down on specialized corpora. Fine-tune a base model on
your own labeled query→passage pairs when:

- Off-the-shelf leaders underperform on your internal evaluation set.
- Your corpus uses terminology poorly represented in common pretraining data.
- You have (or can synthesize via LLM) labeled retrieval pairs.

Fine-tuning consistently beats off-the-shelf for in-domain retrieval without the
cost of training from scratch. Tooling: [sentence-transformers](https://github.com/huggingface/sentence-transformers),
[FlagEmbedding](https://github.com/FlagOpen/FlagEmbedding),
[SetFit](https://github.com/huggingface/setfit) (few-shot). See the full
[Embedding Fine-tuning section](README.md#embedding-fine-tuning).

---

## Selection checklist

- ✅ Ranked candidates by **MTEB Retrieval nDCG@10**, not overall average.
- ✅ Context window **fits your chunk size**.
- ✅ Validated the top 2–3 on a **held-out split of your own corpus**.
- ✅ Confirmed **multilingual** capability if your data needs it.
- ✅ Priced **dimensionality × vector count** against your DB memory budget.
- ✅ Chose **hosting** (API vs self-host) to match ops capacity and data
  sovereignty.
- ✅ Locked the model **version** and planned a re-index/rollback path.
- ✅ Considered **fine-tuning** if generic models underperform in-domain.

---

## Further reading

- [Embedding Models — main list](README.md#embedding-models)
- [Embedding Fine-tuning](README.md#embedding-fine-tuning)
- [Benchmarks & Evidence §2 — MTEB retrieval scores](benchmarks.md#2-embeddings--retrieval)
- [Chunking Strategies](chunking-strategies.md) — chunk size and context window are
  linked decisions
- [Vector Database Comparison](vector-database-comparison.md) — dimensionality
  drives your index cost

([back to main resource](README.md))
