# RAG in Production: Operations & Case Studies

Theory is great, but production is where the rubber meets the road. This section
curates deep-dive engineering blogs, whitepapers, and talks from companies
running Retrieval-Augmented Generation at scale.

> **Criteria:** We only include resources that discuss *architecture, latency,
> evaluation, or scaling challenges*. No marketing fluff.

---

## High-Scale Consumer Apps

### [Perplexity.ai](https://www.perplexity.ai/)

- [Perplexity's Online LLM Inference](https://www.perplexity.ai/blog/perplexity-70b-improving-on-llama-2-70b)
  - Serving 70B models with low latency for real-time search — key techniques: speculative decoding, aggressive caching, and search index optimization.

### [Notion AI](https://www.notion.com/)

- [Notion AI](https://www.notion.com/product/ai)
  - How Notion integrated RAG into a collaborative workspace for millions of non-technical users — agents, search, and knowledge management in one product surface.

---

## Enterprise & B2B

### [Stripe](https://stripe.com/)

- [Stripe Radar & ML Infrastructure](https://stripe.com/blog/engineering)
  - Using embeddings for fraud detection (retrieval-based classification).
  - Real-time feature extraction and low-latency vector lookups at payment scale.

### [Airbnb](https://www.airbnb.com/)

- [Building Airbnb's AI Search](https://medium.com/airbnb-engineering/improving-deep-learning-for-search-at-airbnb-5415757912)
  - The evolution of search ranking with embeddings — hard negative mining and custom listing embeddings for domain-specific recall.

---

## Lessons from the Trenches (Engineering Blogs)

- [DoorDash — Personalized Store Feed with Vector Retrieval](https://doordash.engineering/2023/08/01/improving-store-feed-ranking-with-vector-retrieval/)
  - Replacing heuristic rules with semantic retrieval for better store recommendations.
- [LinkedIn — Approximate Nearest Neighbor Search at Scale](https://engineering.linkedin.com/blog/2020/scaling-approximate-nearest-neighbor-search-with-galene)
  - Custom ANN implementation (Galene) enabling personalized recommendations at LinkedIn scale.
- [Pinterest — PinSage: Graph Convolutional Networks for Web-Scale Recommender Systems](https://medium.com/pinterest-engineering/pinsage-a-new-graph-convolutional-network-for-web-scale-recommender-systems-887955e85fa3)
  - Combining graph structures with embeddings — a production precursor to GraphRAG-style retrieval.

---

## Must-Watch Talks

<!-- no-alphabetical -->

- [Jerry Liu (LlamaIndex) - Building Production-Ready RAG Applications](https://www.youtube.com/watch?v=TRjq7t2Ms5I)
  - *Venue:* AI Engineer Summit, 2023
  - *Why watch:* Canonical tour of why "basic RAG" fails and the specific levers — chunking, metadata filtering, small-to-big retrieval, multi-document agents — that move it toward production.

- [Jason Liu - Systematically Improving RAG Applications](https://www.youtube.com/watch?v=e668bTot45w)
  - *Venue:* AI Engineer World's Fair, 2024
  - *Why watch:* A data-driven flywheel for RAG: synthetic eval generation, leading vs. lagging metrics, segmentation, and query routing. The clearest answer to "what do I actually measure?"

- [Douwe Kiela (Contextual AI) - Retrieval Augmented Language Models](https://www.youtube.com/watch?v=mE7IDf2SmJg)
  - *Venue:* Stanford CS25 V3, 2023
  - *Why watch:* Academic grounding from one of the original RAG paper authors — parametric vs. non-parametric memory, joint training, and why hybrid retrieval exists.

- [Yan, Bischof, Frye, Husain, Liu, Shankar - What We Learned from a Year of Building with LLMs](https://www.youtube.com/watch?v=c0gcsprsFig)
  - *Venue:* AI Engineer World's Fair, 2024 (closing keynote)
  - *Why watch:* Six practitioners compress a year of production lessons into one session — evals, cost, ops, and org design. Pairs with the O'Reilly written series.

- [Harrison Chase (LangChain) - 3 Ingredients for Building Reliable Enterprise Agents](https://www.youtube.com/watch?v=kTnfJszFxCg)
  - *Venue:* AI Engineer, 2024
  - *Why watch:* Covers the prototype-to-production gap for agentic RAG specifically — state management, human-in-the-loop, and failure modes at scale.

---

([back to main resource](README.md#contents))
