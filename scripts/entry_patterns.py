"""Shared regexes describing the catalog entry grammar.

Single source of truth for the per-entry conventions documented in
CONTRIBUTING.md (§ Formatting, § Last Verified Date). Consumed by
discovery_engine.py (weekly cron), pr_entry_validator.py (PR CI gate) and
site_stats.py (landing-page data build). Stdlib-only so the PR validator needs
no pip install.
"""

import re

# Matches github.com/{owner}/{repo} links; trailing delimiters end the repo group.
REPO_URL_RE = re.compile(r"github\.com/([\w.\-]+)/([\w.\-]+?)(?:[/?#\s\)\]\"']|$)")

# A catalog entry is a top-level link bullet `- [Name](URL)` followed by an
# indented description sub-bullet; an optional `<!-- verified: YYYY-MM-DD -->`
# line in between records the last human review.
ENTRY_ANCHOR_RE = re.compile(r"^- \[(?P<name>[^\]]+)\]\((?P<url>[^)]+)\)\s*$")
ENTRY_DESC_RE = re.compile(r"^\s+- \S")
VERIFIED_RE = re.compile(r"<!--\s*verified:\s*(\d{4}-\d{2}-\d{2})\s*-->")

# Counting grammar for statistics (site_stats.py): any catalog line that *starts*
# with an external link, either a top-level bullet or a table row's first cell.
# Deliberately looser than ENTRY_ANCHOR_RE so it also matches table-only sections
# (Vector Databases, Embedding Models) and the legacy `- [Name](URL) - desc`
# inline format found in older README revisions (used for the growth history).
CATALOG_LINK_RE = re.compile(
    r"^(?:[-*] |\|\s*)\[(?P<name>[^\]]+)\]\((?P<url>https?://[^)\s]+)\)"
)
