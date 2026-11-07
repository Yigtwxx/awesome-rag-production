/**
 * Typed access to the generated catalog (scripts/site_stats.py output).
 * The interfaces mirror the TypedDicts in site_stats.py; keep them in sync.
 */
import raw from '../data/catalog.json';

export type EvidenceTag = '3P' | 'V' | 'A';

export interface Tool {
  name: string;
  url: string;
  description: string;
  /** "YYYY-MM" the tool first appeared in the README; null without git history. */
  added: string | null;
}

export interface Category {
  name: string;
  anchor: string;
  count: number;
  tools: Tool[];
}

export interface GrowthPoint {
  month: string;
  tools: number;
}

export interface PitfallItem {
  title: string;
  /** Heading anchor inside the mkdocs rag-pitfalls page. */
  anchor: string;
}

export interface PitfallGroup {
  section: string;
  count: number;
  items: PitfallItem[];
}

export interface Claim {
  subject: string;
  detail: string;
  tag: string;
  /** Domain of the cited source, '' when the row has no link. */
  source: string;
}

export interface ScaleTier {
  range: string;
  choices: string[];
  notes: string;
}

export interface StackItem {
  role: string;
  tools: string[];
}

export interface Architecture {
  tier: number;
  name: string;
  tagline: string;
  goal: string;
  stack: StackItem[];
}

export interface Catalog {
  generatedAt: string;
  lastUpdated: string | null;
  lastVerified: string | null;
  totals: {
    tools: number;
    categories: number;
    verified: number;
    evidenceClaims: number;
    antiPatterns: number;
    datasets: number;
  };
  categories: Category[];
  growth: GrowthPoint[];
  evidence: Record<EvidenceTag, number>;
  claims: Claim[];
  pitfalls: PitfallGroup[];
  scaleLadder: ScaleTier[];
  architectures: Architecture[];
}

export const catalog: Catalog = raw satisfies Catalog;

const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "2026-11-07" -> "Nov 7, 2026" (UTC, so the build machine's zone is irrelevant). */
export function formatDate(iso: string): string {
  return dateFormat.format(new Date(`${iso}T00:00:00Z`));
}
