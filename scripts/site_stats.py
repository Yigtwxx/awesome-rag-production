"""Build the landing page's data file from the repository's markdown.

Reads README.md and the deep-dive guides and writes the JSON catalog that the
Astro landing page renders (``landing/src/data/catalog.json``). Every number on
the landing page comes from here, so the site cannot drift from the list.

Structural problems fail loudly (exit code 1): if an expected section or table
disappears, the PR build turns red instead of shipping a silently wrong page.
The git-derived fields (growth history, last-updated date) are the deliberate
exception: on a shallow clone or without git they are emitted empty and the page
hides the elements that depend on them.

Stdlib-only, like the other scripts that share ``entry_patterns``.

Usage:
    python scripts/site_stats.py --out landing/src/data/catalog.json
"""

from __future__ import annotations

import argparse
import datetime
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path
from typing import TypedDict
from urllib.parse import urlparse

from entry_patterns import CATALOG_LINK_RE, VERIFIED_RE

REPO_ROOT = Path(__file__).resolve().parent.parent

H2_RE = re.compile(r"^## +(?P<title>.+?)\s*$")
H3_RE = re.compile(r"^### +(?P<title>.+?)\s*$")
FENCE_RE = re.compile(r"^\s*(```|~~~)")
# Legacy README revisions prefix headings with emoji ("## 🗄️ Vector Databases").
LEADING_SYMBOLS_RE = re.compile(r"^[^\w\[]+")

# README `##` sections that hold links but are not tool categories.
NON_TOOL_SECTION_PREFIXES = (
    "contents",
    "recommended resources",
    "real-world case studies",
    "tutorials",
)

ANTI_PATTERN_RE = re.compile(r"^### +❌ +Anti-pattern: +(?P<title>.+?)\s*$")
ARCH_HEADING_RE = re.compile(
    r"^(?P<tier>\d+)\.\s+(?P<name>.+?)\s*\((?P<tagline>[^)]+)\)\s*$"
)
ARCH_GOAL_RE = re.compile(r"^\*\*Goal:\*\*\s+(?P<goal>.+?)\s*$")
ARCH_STACK_ITEM_RE = re.compile(r"^- \*\*(?P<role>[^*]+?):\*\*\s+(?P<rest>.+?)\s*$")
BOLD_RE = re.compile(r"\*\*([^*]+)\*\*")
EVIDENCE_TAGS = ("3P", "V", "A")

# Table columns that hold a tool's one-line description, in order of preference.
DESCRIPTION_COLUMNS = ("Key Strength", "Strengths", "Approach", "Focus", "Best For")
MD_LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
# Inline evidence citations, e.g. `(\[3P\] [benchmarks.md](benchmarks.md#x))`.
EVIDENCE_MARK_RE = re.compile(
    r"\(?\s*\\?\[(?:3P|V|A)\\?\](?:\([^)]*\))?\s*(?:\[[^\]]*\]\([^)]*\))?\s*\)?"
)
SENTENCE_RE = re.compile(r"(.+?[.!?])(?:\s|$)")
DESCRIPTION_LIMIT = 170


class StatsError(RuntimeError):
    """An expected markdown structure is missing; the catalog would be wrong."""


class Tool(TypedDict):
    name: str
    url: str
    description: str
    # "YYYY-MM" the tool first appeared in the README (git history); None
    # when history is unavailable (shallow clone, --no-history).
    added: str | None


class Category(TypedDict):
    name: str
    anchor: str
    count: int
    tools: list[Tool]


class GrowthPoint(TypedDict):
    month: str
    tools: int


class PitfallItem(TypedDict):
    title: str
    anchor: str


class PitfallGroup(TypedDict):
    section: str
    count: int
    items: list[PitfallItem]


class Claim(TypedDict):
    subject: str
    detail: str
    tag: str
    source: str


class ScaleTier(TypedDict):
    range: str
    choices: list[str]
    notes: str


class StackItem(TypedDict):
    role: str
    tools: list[str]


class Architecture(TypedDict):
    tier: int
    name: str
    tagline: str
    goal: str
    stack: list[StackItem]


class Totals(TypedDict):
    tools: int
    categories: int
    verified: int
    evidenceClaims: int
    antiPatterns: int
    datasets: int


class Catalog(TypedDict):
    generatedAt: str
    lastUpdated: str | None
    lastVerified: str | None
    totals: Totals
    categories: list[Category]
    growth: list[GrowthPoint]
    evidence: dict[str, int]
    claims: list[Claim]
    pitfalls: list[PitfallGroup]
    scaleLadder: list[ScaleTier]
    architectures: list[Architecture]


# --- markdown helpers ---------------------------------------------------------


def slugify(title: str) -> str:
    """Return the heading anchor mkdocs generates (python-markdown's default)."""
    value = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode()
    value = re.sub(r"[^\w\s-]", "", value).strip().lower()
    return re.sub(r"[-\s]+", "-", value)


def clean_heading(title: str) -> str:
    """Strip legacy emoji prefixes so old and new headings compare equal."""
    return LEADING_SYMBOLS_RE.sub("", title).strip()


def split_sections(text: str, heading: re.Pattern[str]) -> list[tuple[str, list[str]]]:
    """Split markdown into (heading title, body lines), ignoring fenced code."""
    sections: list[tuple[str, list[str]]] = []
    in_fence = False
    for line in text.splitlines():
        if FENCE_RE.match(line):
            in_fence = not in_fence
        match = None if in_fence else heading.match(line)
        if match:
            sections.append((clean_heading(match.group("title")), []))
        elif sections:
            sections[-1][1].append(line)
    return sections


def find_section(text: str, title: str) -> list[str]:
    """Return the body lines of the `##` section called ``title``."""
    for name, lines in split_sections(text, H2_RE):
        if name.lower() == title.lower():
            return lines
    raise StatsError(f"section '## {title}' not found")


def table_cells(line: str) -> list[str]:
    """Split one markdown table row into stripped cell strings."""
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def parse_tables(lines: list[str]) -> list[list[list[str]]]:
    """Return every pipe table (header row first, separator dropped).

    Rows inside blockquotes (`> | ...`) are skipped on purpose: they hold
    legends, not data.
    """
    tables: list[list[list[str]]] = []
    current: list[list[str]] = []
    for line in [*lines, ""]:
        if line.startswith("|"):
            cells = table_cells(line)
            if not all(re.fullmatch(r":?-+:?", c) for c in cells if c):
                current.append(cells)
        elif current:
            tables.append(current)
            current = []
    return tables


def normalize_url(url: str) -> str:
    return url.rstrip("/").lower()


def clean_text(text: str, limit: int = DESCRIPTION_LIMIT) -> str:
    """Markdown fragment -> plain first sentence, without evidence citations."""
    text = EVIDENCE_MARK_RE.sub(" ", text)
    text = MD_LINK_RE.sub(r"\1", text)
    text = re.sub(r"[*_`\\]", "", text)
    text = re.sub(r"\(\s*\)", "", text)
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r" ([.,;:!?])", r"\1", text).strip(" -–—")
    match = SENTENCE_RE.match(text)
    sentence = match.group(1) if match else text
    if len(sentence) > limit:
        cut = sentence[: limit - 1].rsplit(" ", 1)[0].rstrip(",;:")
        sentence = f"{cut}…"
    return sentence


def list_description(lines: list[str], anchor_index: int) -> str:
    """Text of the first indented sub-bullet under a `- [Name](URL)` anchor."""
    parts: list[str] = []
    for line in lines[anchor_index + 1 :]:
        stripped = line.strip()
        if not stripped or not line[0].isspace():
            break
        if stripped.startswith("<!--"):
            continue
        if stripped.startswith("- "):
            if parts:
                break
            parts.append(stripped[2:])
        elif parts:
            parts.append(stripped)
    return clean_text(" ".join(parts))


def table_description(header: list[str], cells: list[str]) -> str:
    for column in DESCRIPTION_COLUMNS:
        if column in header:
            index = header.index(column)
            if index < len(cells):
                return clean_text(cells[index])
    return ""


# --- extractors ---------------------------------------------------------------


def parse_categories(readme: str) -> list[Category]:
    """Tool categories in README order, each with its de-duplicated entries.

    Cross-reference entries ("- [X](url) — see Y for the full entry") borrow
    the description of the canonical entry for the same URL.
    """
    categories: list[Category] = []
    canonical: dict[str, str] = {}
    for name, lines in split_sections(readme, H2_RE):
        if name.lower().startswith(NON_TOOL_SECTION_PREFIXES):
            continue
        seen: set[str] = set()
        tools: list[Tool] = []
        header: list[str] = []
        previous_was_table = False
        for index, line in enumerate(lines):
            is_table = line.startswith("|")
            if is_table and not previous_was_table:
                header = table_cells(line)
            previous_was_table = is_table
            match = CATALOG_LINK_RE.match(line)
            if not match:
                continue
            url = match.group("url")
            key = normalize_url(url)
            if is_table:
                description = table_description(header, table_cells(line))
            else:
                inline = line[match.end() :].strip()
                description = (
                    clean_text(inline) if inline else list_description(lines, index)
                )
            if description.lower().startswith("see "):
                description = ""  # cross-reference: filled from canonical below
            if description:
                canonical.setdefault(key, description)
            if key in seen:
                # Same tool in a comparison table and a list: keep the richer text.
                existing = next(t for t in tools if normalize_url(t["url"]) == key)
                if len(description) > len(existing["description"]):
                    existing["description"] = description
                continue
            seen.add(key)
            tools.append(
                {
                    "name": match.group("name"),
                    "url": url,
                    "description": description,
                    "added": None,
                }
            )
        if tools:
            categories.append(
                {
                    "name": name,
                    "anchor": slugify(name),
                    "count": len(tools),
                    "tools": tools,
                }
            )
    if not categories:
        raise StatsError("README.md: no tool categories with entries found")
    for category in categories:
        for tool in category["tools"]:
            if not tool["description"]:
                tool["description"] = canonical.get(normalize_url(tool["url"]), "")
    return categories


def count_unique_tools(categories: list[Category]) -> int:
    """Tools listed in several categories (e.g. LiteLLM) count once."""
    return len(
        {normalize_url(tool["url"]) for cat in categories for tool in cat["tools"]}
    )


def parse_verified(readme: str) -> tuple[int, str | None]:
    dates = VERIFIED_RE.findall(readme)
    return len(dates), (max(dates) if dates else None)


def parse_claims(benchmarks: str) -> list[Claim]:
    """Every tagged claim row in benchmarks.md, with its source's domain."""
    claims: list[Claim] = []
    for table in parse_tables(benchmarks.splitlines()):
        header, rows = table[0], table[1:]
        if "Tag" not in header:
            continue
        tag_column = header.index("Tag")
        source_column = header.index("Source") if "Source" in header else -1
        for row in rows:
            if tag_column >= len(row):
                continue
            tag = row[tag_column].replace("\\", "").strip("[] ")
            if tag not in EVIDENCE_TAGS:
                continue
            source = ""
            if 0 <= source_column < len(row):
                link = MD_LINK_RE.search(row[source_column])
                if link:
                    source = urlparse(link.group(2)).netloc.removeprefix("www.")
            claims.append(
                {
                    "subject": clean_text(row[0]),
                    "detail": clean_text(row[1]) if len(row) > 1 else "",
                    "tag": tag,
                    "source": source,
                }
            )
    if not claims:
        raise StatsError("benchmarks.md: no tagged claim rows found")
    return claims


def parse_evidence(benchmarks: str) -> dict[str, int]:
    """Count the evidence tag of every claim row in benchmarks.md tables."""
    counts = dict.fromkeys(EVIDENCE_TAGS, 0)
    for claim in parse_claims(benchmarks):
        counts[claim["tag"]] += 1
    return counts


def parse_pitfalls(pitfalls: str) -> list[PitfallGroup]:
    groups: list[PitfallGroup] = []
    for name, lines in split_sections(pitfalls, H2_RE):
        items: list[PitfallItem] = [
            {"title": m.group("title"), "anchor": slugify(line.removeprefix("### "))}
            for line in lines
            if (m := ANTI_PATTERN_RE.match(line))
        ]
        if items:
            groups.append({"section": name, "count": len(items), "items": items})
    if not groups:
        raise StatsError("rag-pitfalls.md: no '### ❌ Anti-pattern:' headings found")
    return groups


def parse_scale_ladder(comparison: str) -> list[ScaleTier]:
    for table in parse_tables(comparison.splitlines()):
        header, rows = table[0], table[1:]
        if header and header[0].lower() == "vector count" and len(header) >= 3:
            return [
                {
                    "range": row[0],
                    "choices": [c.strip() for c in row[1].split(",") if c.strip()],
                    "notes": row[2],
                }
                for row in rows
                if len(row) >= 3
            ]
    raise StatsError("vector-database-comparison.md: 'Vector count' table not found")


def parse_architectures(readme: str) -> list[Architecture]:
    body = "\n".join(find_section(readme, "Reference Architectures"))
    tiers: list[Architecture] = []
    for title, lines in split_sections(body, H3_RE):
        heading = ARCH_HEADING_RE.match(title)
        if not heading:
            continue
        goal = next(
            (m.group("goal") for line in lines if (m := ARCH_GOAL_RE.match(line))),
            "",
        )
        stack: list[StackItem] = [
            {"role": m.group("role"), "tools": BOLD_RE.findall(m.group("rest"))}
            for line in lines
            if (m := ARCH_STACK_ITEM_RE.match(line))
        ]
        tiers.append(
            {
                "tier": int(heading.group("tier")),
                "name": heading.group("name"),
                "tagline": heading.group("tagline"),
                "goal": goal,
                "stack": stack,
            }
        )
    if not tiers or not all(tier["stack"] for tier in tiers):
        raise StatsError("README.md: reference architecture tiers/stacks not found")
    return tiers


def count_links(markdown: str) -> int:
    return len(
        {
            normalize_url(m.group("url"))
            for line in markdown.splitlines()
            if (m := CATALOG_LINK_RE.match(line))
        }
    )


# --- git-derived fields (graceful) ---------------------------------------------


def _git(root: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(root), *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
    )
    return result.stdout


def _months_between(start: str, end: str) -> list[str]:
    year, month = map(int, start.split("-"))
    end_year, end_month = map(int, end.split("-"))
    months: list[str] = []
    while (year, month) <= (end_year, end_month):
        months.append(f"{year:04d}-{month:02d}")
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return months


def growth_history(
    root: Path, current: int, today: datetime.date
) -> tuple[list[GrowthPoint], dict[str, str]]:
    """Monthly tool counts (gap-filled) and each tool's first month.

    Counts come from the last README revision of each month; months without a
    README change carry the previous value forward. The final point is the
    working-tree count so the series always ends at the number in the hero.
    The second value maps a normalized tool URL to the first month it appears.
    """
    try:
        if _git(root, "rev-parse", "--is-shallow-repository").strip() == "true":
            print("site_stats: shallow clone, growth history skipped", file=sys.stderr)
            return [], {}
        log = _git(root, "log", "--format=%H %cs", "--", "README.md").split("\n")
        last_sha_per_month: dict[str, str] = {}
        for line in filter(None, log):  # newest first: keep first hit per month
            sha, date = line.split()
            last_sha_per_month.setdefault(date[:7], sha)
        counts: dict[str, int] = {}
        first_seen: dict[str, str] = {}
        for month in sorted(last_sha_per_month):
            text = _git(root, "show", f"{last_sha_per_month[month]}:README.md")
            try:
                revision = parse_categories(text)
            except StatsError:
                continue  # pre-catalog revision; nothing to plot
            counts[month] = count_unique_tools(revision)
            for category in revision:
                for tool in category["tools"]:
                    first_seen.setdefault(normalize_url(tool["url"]), month)
    except (OSError, subprocess.CalledProcessError) as exc:
        print(f"site_stats: git unavailable, growth skipped ({exc})", file=sys.stderr)
        return [], {}

    this_month = today.strftime("%Y-%m")
    counts[this_month] = current
    series: list[GrowthPoint] = []
    previous = 0
    for month in _months_between(min(counts), this_month):
        previous = counts.get(month, previous)
        series.append({"month": month, "tools": previous})
    return series, first_seen


def last_updated(root: Path) -> str | None:
    try:
        return (
            _git(root, "log", "-1", "--format=%cs", "--", "README.md").strip() or None
        )
    except (OSError, subprocess.CalledProcessError):
        return None


# --- assembly -----------------------------------------------------------------


def build_catalog(
    root: Path, *, history: bool = True, today: datetime.date | None = None
) -> Catalog:
    today = today or datetime.date.today()

    def read(name: str) -> str:
        path = root / name
        if not path.is_file():
            raise StatsError(f"{name} not found under {root}")
        return path.read_text(encoding="utf-8")

    readme = read("README.md")
    categories = parse_categories(readme)
    tools = count_unique_tools(categories)
    growth, first_seen = growth_history(root, tools, today) if history else ([], {})
    if growth:
        this_month = today.strftime("%Y-%m")
        for category in categories:
            for tool in category["tools"]:
                key = normalize_url(tool["url"])
                tool["added"] = first_seen.get(key, this_month)
    verified_count, verified_latest = parse_verified(readme)
    benchmarks = read("benchmarks.md")
    evidence = parse_evidence(benchmarks)
    pitfalls = parse_pitfalls(read("rag-pitfalls.md"))

    return {
        "generatedAt": today.isoformat(),
        "lastUpdated": last_updated(root) if history else None,
        "lastVerified": verified_latest,
        "totals": {
            "tools": tools,
            "categories": len(categories),
            "verified": verified_count,
            "evidenceClaims": sum(evidence.values()),
            "antiPatterns": sum(group["count"] for group in pitfalls),
            "datasets": count_links(read("datasets.md")),
        },
        "categories": categories,
        "growth": growth,
        "evidence": evidence,
        "claims": parse_claims(benchmarks),
        "pitfalls": pitfalls,
        "scaleLadder": parse_scale_ladder(read("vector-database-comparison.md")),
        "architectures": parse_architectures(readme),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, required=True, help="output JSON path")
    parser.add_argument("--root", type=Path, default=REPO_ROOT, help="repo root")
    parser.add_argument(
        "--no-history", action="store_true", help="skip git-derived fields"
    )
    args = parser.parse_args(argv)

    try:
        catalog = build_catalog(args.root, history=not args.no_history)
    except StatsError as exc:
        print(f"site_stats: error: {exc}", file=sys.stderr)
        return 1

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    totals = catalog["totals"]
    print(
        f"site_stats: wrote {args.out} - {totals['tools']} tools in "
        f"{totals['categories']} categories, {len(catalog['growth'])} growth points"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
