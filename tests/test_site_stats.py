"""Unit tests for ``site_stats`` — the landing-page catalog builder.

Parsers are exercised on small inline markdown fixtures; one integration test
runs the real repository files (history disabled, so no git dependency) to
catch structural README changes that would silently break the landing page.
"""

import datetime
import json
from pathlib import Path

import pytest
import site_stats as s

REPO_ROOT = Path(__file__).resolve().parent.parent
TODAY = datetime.date(2026, 11, 7)

README = """\
# Title

## Contents

- [Vector Databases](#vector-databases)

## Frameworks & Orchestration

- [LangGraph](https://github.com/langchain-ai/langgraph)
  <!-- verified: 2026-08-21 -->
  - Stateful agents.
- [Haystack](https://github.com/deepset-ai/haystack)
  - Pipelines.

## Vector Databases

| Tool | Best For |
| :--- | :--- |
| [Qdrant](https://github.com/qdrant/qdrant) | Filtering |
| [Milvus](https://github.com/milvus-io/milvus) | Scale |

## LLM Gateways & Routing

- [LiteLLM](https://github.com/BerriAI/litellm)
  <!-- verified: 2026-06-25 -->
  - Gateway.
- [LangGraph](https://github.com/langchain-ai/langgraph/) — see Frameworks.

## Reference Architectures

### 1. The Local / Dev Stack (Zero to One)

**Goal:** Rapid prototyping.

- **LLM:** **Ollama** (LLaMA 3)
- **Vector DB:** **Chroma** (Embedded)

### 2. The Mid-Scale / Production Stack (Speed to Market)

**Goal:** High precision.

- **Vector DB:** **Qdrant** or **Weaviate** (Managed)

## Real-World Case Studies

- [LinkedIn](https://www.linkedin.com/blog/engineering/rag)

```mermaid
## Not A Section
```
"""


@pytest.mark.parametrize(
    ("title", "expected"),
    [
        ("Frameworks & Orchestration", "frameworks-orchestration"),
        ("Data & Index Versioning", "data-index-versioning"),
        ("Structured & SQL RAG", "structured-sql-rag"),
        ("Agent Memory & Stateful Context", "agent-memory-stateful-context"),
    ],
)
def test_slugify_heading_matches_mkdocs_anchor(title: str, expected: str) -> None:
    result = s.slugify(title)
    assert result == expected, f"Expected {expected}, got {result}"


def test_clean_heading_legacy_emoji_prefix_is_stripped() -> None:
    assert s.clean_heading("🗄️ Vector Databases") == "Vector Databases"


def test_parse_categories_lists_and_tables_skip_non_tool_sections() -> None:
    categories = s.parse_categories(README)
    names = [c["name"] for c in categories]
    assert names == [
        "Frameworks & Orchestration",
        "Vector Databases",
        "LLM Gateways & Routing",
    ]
    vector_dbs = categories[1]
    assert vector_dbs["anchor"] == "vector-databases"
    assert [t["name"] for t in vector_dbs["tools"]] == ["Qdrant", "Milvus"]


def test_unique_tools_dedupes_cross_listed_entries() -> None:
    categories = s.parse_categories(README)
    # LangGraph appears in two sections (trailing slash differs) -> counted once.
    assert sum(c["count"] for c in categories) == 6
    assert s.count_unique_tools(categories) == 5


@pytest.mark.parametrize(
    ("url", "name", "expected"),
    [
        ("https://github.com/acme/tool/", "Tool", "2025-01"),  # URL is earliest
        ("https://github.com/new-owner/tool", "TOOL", "2025-03"),  # moved, name only
        ("https://github.com/moved/tool", "Tool", "2025-03"),  # new URL seen later
        ("https://github.com/acme/renamed", "Renamed", "2026-11"),  # unseen
    ],
)
def test_first_listed_returns_earliest_month_across_url_and_name(
    url: str, name: str, expected: str
) -> None:
    first_seen = {
        "https://github.com/acme/tool": "2025-01",
        "name:tool": "2025-03",
        "https://github.com/moved/tool": "2026-11",
    }
    tool: s.Tool = {"name": name, "url": url, "description": "", "added": None}
    result = s.first_listed(tool, first_seen, "2026-11")
    assert result == expected, f"Expected {expected}, got {result}"


def test_fenced_headings_do_not_start_sections() -> None:
    titles = [t for t, _ in s.split_sections(README, s.H2_RE)]
    assert "Not A Section" not in titles


def test_parse_categories_raises_without_entries() -> None:
    with pytest.raises(s.StatsError):
        s.parse_categories("# Empty\n\n## Contents\n\n- [A](#a)\n")


def test_parse_verified_counts_and_latest() -> None:
    assert s.parse_verified(README) == (2, "2026-08-21")
    assert s.parse_verified("no markers") == (0, None)


def test_parse_evidence_counts_tag_column_and_ignores_blockquote_legend() -> None:
    benchmarks = """\
> | Tag | Meaning |
> | --- | --- |
> | \\[3P\\] | Third party |

| System | Value | Tag | Source |
| :--- | :--- | :--- | :--- |
| Qdrant | 0.99 | \\[V\\] | x |
| All | 0.95 | \\[3P\\] | y |
| Discord | — | \\[A\\] | z |

| Provider | Published SLA | Tag |
| :--- | :--- | :--- |
| Pinecone | 99.95% | \\[V\\] |
"""
    assert s.parse_evidence(benchmarks) == {"3P": 1, "V": 2, "A": 1}


def test_parse_evidence_raises_when_no_tags() -> None:
    with pytest.raises(s.StatsError):
        s.parse_evidence("| A | B |\n| - | - |\n| 1 | 2 |\n")


@pytest.mark.parametrize(
    ("markdown", "expected"),
    [
        ("A **fast** [lib](https://x.dev) for RAG. More text.", "A fast lib for RAG."),
        (
            r"Rerankers win by 4 points (\[3P\] [benchmarks.md](benchmarks.md#3)).",
            "Rerankers win by 4 points.",
        ),
        ("No sentence end here", "No sentence end here"),
    ],
)
def test_clean_text_markdown_becomes_plain_first_sentence(
    markdown: str, expected: str
) -> None:
    result = s.clean_text(markdown)
    assert result == expected, f"Expected {expected!r}, got {result!r}"


def test_clean_text_long_text_is_truncated_with_ellipsis() -> None:
    result = s.clean_text("word " * 80, limit=40)
    assert len(result) <= 40 and result.endswith("…"), result


def test_parse_categories_descriptions_from_lists_tables_and_crossrefs() -> None:
    by_name = {
        t["name"]: t["description"]
        for c in s.parse_categories(README)
        for t in c["tools"]
    }
    assert by_name["LangGraph"] == "Stateful agents.", by_name
    assert by_name["Qdrant"] == "Filtering", by_name
    assert by_name["LiteLLM"] == "Gateway.", by_name


def test_parse_claims_reads_subject_tag_and_source_domain() -> None:
    benchmarks = r"""
| System | Dataset | Tag | Source |
| :--- | :--- | :--- | :--- |
| Qdrant | gist-960 | \[V\] | [qdrant docs](https://www.qdrant.tech/benchmarks/) |
| Note row | no tag | — | — |
"""
    assert s.parse_claims(benchmarks) == [
        {"subject": "Qdrant", "detail": "gist-960", "tag": "V", "source": "qdrant.tech"}
    ]


def test_parse_pitfalls_groups_by_section() -> None:
    pitfalls = """\
## Retrieval Strategy

### ❌ Anti-pattern: Pure Vector Search Only
### ❌ Anti-pattern: Top-K Too Small

## Quick Reference: Production Checklist

- [ ] item
"""
    assert s.parse_pitfalls(pitfalls) == [
        {
            "section": "Retrieval Strategy",
            "count": 2,
            "items": [
                {
                    "title": "Pure Vector Search Only",
                    "anchor": "anti-pattern-pure-vector-search-only",
                },
                {
                    "title": "Top-K Too Small",
                    "anchor": "anti-pattern-top-k-too-small",
                },
            ],
        }
    ]


def test_parse_scale_ladder() -> None:
    comparison = """\
| Vector count | Reasonable choices | Notes |
| :--- | :--- | :--- |
| < 1M | pgvector, Chroma, LanceDB | Any engine works. |
| 500M–billions | Milvus, Vespa | Sharding required. |
"""
    ladder = s.parse_scale_ladder(comparison)
    assert ladder[0] == {
        "range": "< 1M",
        "choices": ["pgvector", "Chroma", "LanceDB"],
        "notes": "Any engine works.",
    }
    assert ladder[1]["choices"] == ["Milvus", "Vespa"]


def test_parse_scale_ladder_raises_when_missing() -> None:
    with pytest.raises(s.StatsError):
        s.parse_scale_ladder("| Engine | Notes |\n| - | - |\n| a | b |\n")


def test_parse_architectures() -> None:
    tiers = s.parse_architectures(README)
    assert [t["tier"] for t in tiers] == [1, 2]
    assert tiers[0]["name"] == "The Local / Dev Stack"
    assert tiers[0]["tagline"] == "Zero to One"
    assert tiers[0]["goal"] == "Rapid prototyping."
    assert tiers[1]["stack"] == [{"role": "Vector DB", "tools": ["Qdrant", "Weaviate"]}]


def test_months_between_spans_year_boundary() -> None:
    assert s._months_between("2025-11", "2026-02") == [
        "2025-11",
        "2025-12",
        "2026-01",
        "2026-02",
    ]


def test_build_catalog_on_real_repository() -> None:
    catalog = s.build_catalog(REPO_ROOT, history=False, today=TODAY)
    totals = catalog["totals"]
    assert catalog["generatedAt"] == "2026-11-07"
    assert totals["tools"] > 100
    assert totals["categories"] == len(catalog["categories"]) > 10
    assert totals["evidenceClaims"] == sum(catalog["evidence"].values()) > 0
    assert totals["antiPatterns"] > 0
    assert len(catalog["architectures"]) == 3
    assert catalog["scaleLadder"]
    assert catalog["growth"] == []  # history disabled
    added = {t["added"] for c in catalog["categories"] for t in c["tools"]}
    assert added == {None}, f"Expected no first-seen months, got {added}"
    json.dumps(catalog)  # must be JSON-serializable


def test_main_writes_json(tmp_path: Path) -> None:
    out = tmp_path / "nested" / "catalog.json"
    assert s.main(["--out", str(out), "--no-history"]) == 0
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["totals"]["tools"] > 0


def test_main_returns_1_on_missing_files(tmp_path: Path) -> None:
    out = tmp_path / "catalog.json"
    assert s.main(["--out", str(out), "--root", str(tmp_path), "--no-history"]) == 1
    assert not out.exists()
