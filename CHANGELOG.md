# Changelog

Notable changes to this list, grouped by month (newest first). The format is
adapted from [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); as a
curated list, this repository does not use semantic versions. Planned work is
tracked in [ROADMAP.md](ROADMAP.md).

## 2026-11

### Added

- A landing site now sits at the site root, with Overview, Explore, Stacks,
  and Evidence pages generated from this list. The mkdocs list moved to
  `/docs/`, and old root URLs redirect to it.
- New entries: XERJ and HelixDB (Vector Databases).

### Removed

- Cognita, Verba, and LLM Guard: all three upstream repositories are archived
  on GitHub, and the Removal & Deprecation Policy reserves hard removal for
  archived repos. `rag-pitfalls.md` now points to NeMo Guardrails and Presidio
  where it named LLM Guard.
- Verbatim Citation Gate: the repository moved from an organization to a
  personal account and has 6 stars. It was merged in #73 while the PR checks
  were bypassed, and it falls below the list's adoption bar.

### Changed

- Updated links for eight repositories that moved or were renamed upstream:
  Ragas, sentence-transformers, DVC, semchunk, Marker, NeMo Guardrails,
  Presidio, and psql_bm25s (now **Evoke**, which adds sparse semantic retrieval
  to the same PostgreSQL index, so its description was rewritten).
- Dependabot opens grouped monthly PRs for GitHub Actions instead of weekly
  ones. The actions are SHA-pinned, so the weekly bumps were mostly noise.
- OpenAI prompt-caching figures now follow the current docs instead of the
  2024 launch figure (a 50% discount): reads cost 0.1× the input rate on most
  models (0.05× on GPT-6.1 Sol and Terra), and writes cost 1.25× for the
  30-minute lifetime or 2.5× for 12 hours.

### Fixed

- The Discord case study is gone from README, `showcase.md`, and
  `benchmarks.md`. The cited post covers message storage (Cassandra to
  ScyllaDB), not ANN or vector search, so nothing in it supported the "vector
  search at trillion-message scale" framing.
- The Qdrant recall and latency rows moved to § Gaps. The vendor's own raw
  results (2024-06-15, not re-run since) show a p99 of 14.3 ms and 3.5 ms at
  0.99 precision, not the ~1 ms and ~2 ms the rows stated.

## 2026-10

### Removed

- mdgate/converters (Data Ingestion & Parsing): at 3 stars and with no public
  production user, it fell below the adoption bar applied to later submissions.

## 2026-09

### Added

- New entries: Bifrost (LLM Gateways & Routing), Infino (Vector Databases).

## 2026-08

### Added

- Safety net for the CI bypass: a new `main-validation` workflow replays the
  entry checks and Python tooling against whatever lands on `main`. Fork PRs
  from first-time contributors sit behind "Approve and run workflows", so
  merging one without approving its checks meant the PR suite never ran at
  all — the checks were absent, not failing. Failures now open a
  `main-validation` tracking issue that closes itself once `main` is green.
- Broken links have an owner again: the weekly link checker renders its
  findings through `scripts/link_report.py` into a long-lived `broken-links`
  issue, fingerprinted so an unchanged set refreshes the body instead of
  commenting every Monday. Previously the results went only to a job summary.
- Shared `.github/scripts/tracking-issue.sh` helper backing all three
  tracking issues. It selects the lowest-numbered bot-authored issue with a
  matching title, so a stray issue can no longer silently take over a feed.
- `.github/DISCOVERY_TRIAGE.md` — durable accept/reject record for discovery
  candidates, seeding the `OUT_OF_SCOPE_REPOS` denylist.
- New entries: KServe, SkyPilot, Triton Inference Server (Deployment &
  Serving), OpenDataLoader PDF (Data Ingestion), PageIndex (Retrieval).
- Retrieval & Reranking § Context Compression — a new subsection for the step
  between retrieval and the prompt. A reranker drops whole documents; a
  compressor shortens the ones that survive. Lists headroom and LLMLingua,
  with trade-off notes that lead with lossiness, because a compressor that
  silently drops a cited identifier fails in a way token counts do not show.
- New entries: promptfoo (Evaluation & Benchmarking), LightRAG (Retrieval &
  Reranking § GraphRAG), headroom and LLMLingua (Context Compression).
- Root `.gitattributes` pinning `*.sh` / `*.yml` to LF, so a CRLF checkout on
  Windows cannot break a script on the Linux runners.

### Fixed

- **The benchmark freshness check never matched anything.** Its regex required
  a full `YYYY-MM-DD`, but every date in `benchmarks.md` is written `2024` or
  `2022-12`, so it scanned 36 table rows, matched zero, and reported "all
  benchmark rows are current" every week. It now reads each table's Date
  column (located from the header, so an arXiv id in a Source cell is never
  mistaken for a date) and accepts partial dates, resolving them to the end of
  the period. A `(paper)` marker exempts fixed publication dates.
- Weekly discovery could lose an entire run: if every GitHub API request
  failed, `check_listed_tool_freshness` raised `NameError` on an unbound
  `response`, which propagated out and skipped the report-posting step
  entirely. Fixed with a sentinel, plus `if: always()` on the posting step.
- `check_benchmark_freshness` did not create `.github/` before writing, so its
  report was silently lost whenever it ran before the discovery step.
- Dead and misdirected links: `chonkie` (moved to `feyninc/chonkie`),
  LlamaIndex `KnowledgeGraphIndex` (superseded by `PropertyGraphIndex`),
  Pinecone SLA (99.9% → 99.95%, new URL), the Transformers book, and the
  Anthropic prompt-caching docs (moved to `platform.claude.com`).
- Cohere embed-v4 was listed with a 512-token context window — that is the v3
  figure; v4 is a 128K-token multimodal model. Corrected in both the README
  table and `embedding-model-selection.md`.
- OpenAI Assistants API sunsets 2026-08-26; the entry now points at the
  Responses API migration guide.
- Stale-upstream notes for Pachyderm, ARES, RAGatouille, Byaldi, and GPTCache;
  Prometheus and G-Eval now point at their maintained successors.
- **The out-of-scope denylist could be defeated by a rename.** It matched on
  `owner/name`, so a rejected project only had to move org to reappear:
  graphify was rejected as `safishamsi/graphify`, moved to
  `Graphify-Labs/graphify`, and came back as the top discovery candidate three
  weeks running while its GitHub id never changed. The denylist is now
  `slug -> id` — the slug stays as the readable record of why a repo is there,
  the id is what matches. A missing id still matches by slug, warns at run
  time, and fails a ratchet test.
- Discovery filtering moved out of `run_discovery` into a testable
  `filter_candidates`, and the run log now reports already-listed and
  out-of-scope counts separately. The single combined total was what let a
  denylist entry stop matching without moving a visible number.
- The Weaviate Cloud SLA row cited a URL that still returned HTTP 200 while
  serving a 289-byte JavaScript redirect stub, so no status code ever signalled
  the move. Following it to the live document showed the figure was wrong too:
  the SLA is tiered per quarter (99.5% Flex, 99.9% Premium shared, 99.95%
  Premium dedicated), not a flat 99.9%. The Qdrant Cloud row turned out to have
  the same shape — a flat 99.9% cited to a marketing page, where the real SLA
  commits 99.5% Standard / 99.9% Premium / up to 99.95% Premium Multi-AZ.
- **Three benchmark numbers were not supported by the sources they cited.**
  The Milvus recall row (`~0.995` on SIFT-128) pointed at a page publishing QPS
  and response time only, for Milvus 2.2, and crediting a harness it does not
  use. Both prompt-caching latency figures — Anthropic "up to −85%", OpenAI
  "up to −80%" — appear nowhere in the provider documentation quoted for them;
  both providers describe latency qualitatively and commit to numbers only on
  price. All three moved to § Gaps. The caching *cost* rows are documented and
  stay.
- Provider documentation moved without the entries following:
  `docs.anthropic.com` now redirects to `platform.claude.com`, and
  `platform.openai.com/docs` to `developers.openai.com`. Both resolved through
  redirects, so no link checker would have flagged either.
- **Vanna was archived upstream in February 2026 and still listed as active**,
  first under Structured & SQL RAG. Soft-deprecated per the Removal &
  Deprecation Policy: the entry stays, states that it is archived, and points at
  WrenAI. The weekly audit could not have caught it — reading `pushed_at` alone,
  a project that archives right after a release reads as merely 200 days quiet.
  `check_listed_tool_freshness` now reports archived repos in their own section,
  ahead of the push-age table and never folded into it.
- Maintenance notes for the four stale entries that had none (tokencost, R2R,
  OmniParse, nano-graphrag), and corrections to three that had gone wrong:
  Prometheus pointed readers from a dead repo to `prometheus-eval`, which is
  itself dormant; GPTCache's "slowed considerably" understated 13 months of
  silence; Byaldi's comparison row still claimed "Early Production" for a repo
  untouched since 2025-01.
- `check_listed_tool_freshness` wrote its report without creating `.github/`
  first, unlike both sibling audits. CI checkouts always have the directory, so
  it never bit in production, but the report was discardable by accident.

### Changed

- `<!-- verified: YYYY-MM-DD -->` is now **required** on entries a PR adds, and
  CI enforces it. Existing marker-less entries are grandfathered, and the
  weekly audit no longer reports them — that count never moved and drowned out
  the findings that needed action.
- `.github/PROPOSED_UPDATES.md` is no longer tracked. It was both committed and
  gitignored, so it stayed frozen at a 2026-05-11 snapshot and made the roadmap
  chase a discovery outage that was not happening.
- Three weeks of discovery reports triaged in one pass (16 unique candidates):
  2 accepted, 1 deferred pending a scope decision that is now resolved, 12
  rejected and seeded into the denylist. Verdicts recorded in
  `.github/DISCOVERY_TRIAGE.md`.
- Two maintenance backlogs that had been scrolling past inside the weekly feed
  were split into their own issues and then cleared: nine stale benchmark
  citations re-read against their sources, and eleven listed tools given a
  deprecate-or-keep decision each. Dates that were merely imprecise were
  sharpened to the source's own publication date rather than refreshed to today.

## 2026-07

### Added

- PR validation suite: every pull request now runs ~15 automated checks
  (OpenClaw-inspired). A new `pr-validation` workflow fans out
  `scripts/pr_entry_validator.py` across six blocking entry checks (format,
  alphabetical order, duplicates, verified markers, style bans, evidence
  tags), validates the PR body against the template policy, link-checks the
  changed files (advisory), and runs `pytest`/`ruff` when Python tooling
  changes. A `pr-labeler` workflow adds `area/*` and `size/*` labels.
- Shared entry-grammar module (`scripts/entry_patterns.py`) reused by the
  discovery engine and the PR validator, plus unit tests for every check.
- Shared `lychee.toml` so the weekly link checker and the per-PR link check
  use one configuration; `pyproject.toml` with `ruff` and `pytest` settings.
- CONTRIBUTING: new "CI Checks on Pull Requests" section documenting each
  check, its gate, and the `<!-- no-alphabetical -->` /
  `<!-- allow-duplicate -->` escape hatches (now marking intentionally
  curated sections and cross-listings).

### Fixed

- Evidence hygiene: reworded two unsourced numeric claims (ARES, PrivateGPT)
  and tagged the managed-SLA figure in `vector-database-comparison.md` as
  vendor-stated, per the Evidence Tier policy.

## 2026-06

### Added

- New tools: Omnigraph (Vector Databases), psql_bm25s (Retrieval & Reranking), KB Arena (Evaluation & Benchmarking), and Future AGI (Observability & Tracing).
- PaddleOCR added to Data Ingestion & Parsing (Apache-2.0 OCR / document-parsing toolkit).
- RAG Made Simple added to the RAG section of the recommended books list ([books.md](books.md)).
- FAQ ([FAQ.md](FAQ.md)) answering the most common scope, evidence, and contribution questions.
- This changelog ([CHANGELOG.md](CHANGELOG.md)) and a public roadmap ([ROADMAP.md](ROADMAP.md)).
- Internal repository audit (REPO-ANALIZ.md) with a re-scored 2026-06-12 review.
- Per-entry "last verified" convention (CONTRIBUTING § 5): an optional `verified: YYYY-MM-DD` marker for the last human review, audited weekly by `discovery_engine.py`, with the engine's first unit tests.
- Live documentation site (MkDocs Material) at
  <https://yigtwxx.github.io/awesome-rag-production/>, auto-deployed from `main` via
  the `docs` workflow, with build-time markdown staging (`docs-site/stage_docs.sh`), a
  per-page SEO meta-description hook, and a GitHub social preview card.
- Discovery engine (`scripts/discovery_engine.py`): a weekly freshness audit that flags
  listed tools with no push in 180+ days, benchmark citations older than 365 days, and
  stale per-entry verified dates, wired into the `discovery` workflow.
- New decision guide: `vector-database-comparison.md`, covering scale, filtering, hybrid search, and cost trade-offs.
- README: production inclusion criteria and quick-start decision guides.

### Removed

- A short-lived `stale-link-audit` workflow (added 2026-06-01, removed 2026-06-09); weekly link checking remains covered by the `link-check` workflow.

## 2026-05

### Added

- `benchmarks.md` with the `[3P]` / `[V]` / `[A]` evidence-tag system, a Methodology Disputes section, and an explicit Gaps section.
- Evidence Tier policy in CONTRIBUTING.md — numeric claims now require a source URL, date, tag, and methodology link.
- Removal & Deprecation Policy in CONTRIBUTING.md.
- README sections: Embedding Fine-tuning, Data & Index Versioning, FinOps & Cost Management, Agent Memory & Stateful Context, Structured & SQL RAG, and Tutorials & Hands-on Code.
- Discovery engine freshness audit: flags listed tools with no push in 180+ days and benchmark citations older than 365 days.
- Multimodal RAG and Caching & Performance sections.
- Domain benchmark suites (legal, medical, financial) in datasets.md.
- New tools: DSPy, Crawl4AI, Docling, Vespa, TruLens, Opik.
- CI status badges (Markdown Lint, Link Check, Weekly Discovery) plus welcome and stale automation workflows.
- Dependabot configuration for GitHub Actions and pip dependencies.

### Fixed

- Two weekly workflow failures; bumped `actions/setup-python` from 5.3.0 to 6.2.0.

## 2026-04

### Added

- Weekly automated discovery workflow (trending RAG repositories via the GitHub API).
- Must-watch production talks in showcase.md.
- Dedicated RAG section in the recommended books list.

### Changed

- Repository-wide style standardization: removed decorative emojis, simplified markdown styling, and added the pull request template.
- Migrated linting to `markdownlint-cli2` with a shared configuration.

### Fixed

- Repaired redirected and broken URLs; hardened the link-checker configuration with retries and exclusions.

## 2026-02

### Added

- Agentset added to Frameworks.

## 2026-01

### Added

- `rag-pitfalls.md` — anti-patterns and a production checklist.
- Agentic RAG section, Real-World Case Studies, LLM-as-Judge evaluation, and the Framework Comparison table.

### Changed

- SEO-optimized README introduction; awesome-list standardization (alphabetized books, structure fixes).
- Link-check workflow improvements: retry logic and exclusions for bot-protected domains.

### Fixed

- Removed or replaced a large batch of broken resource links.

## 2025-12

### Added

- Initial release: curated README across the core categories, CONTRIBUTING.md, SECURITY.md, and the first version of the discovery engine with its weekly workflow.
- books.md, blogs.md, and the Contributor Covenant Code of Conduct.
- datasets.md and showcase.md.
- Markdown lint workflow and issue / discussion templates.
