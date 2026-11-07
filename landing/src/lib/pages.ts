/** The site's tabs, in order. Paths are relative to the site base. */
export type PageId = 'overview' | 'explore' | 'stacks' | 'evidence';

export interface PageInfo {
  id: PageId;
  label: string;
  path: string;
  /** Headline pair used by the pager and chapter cards. */
  title: string;
  accent: string;
  blurb: string;
}

export const PAGES: readonly PageInfo[] = [
  {
    id: 'overview',
    label: 'Overview',
    path: '',
    title: 'Overview',
    accent: 'the whole list at a glance.',
    blurb: 'The pipeline, the numbers and how the list has grown.',
  },
  {
    id: 'explore',
    label: 'Explore',
    path: 'explore/',
    title: 'Explore',
    accent: 'ask the list, browse every tool.',
    blurb: 'Run a retriever over the catalog and see all tools on one wall.',
  },
  {
    id: 'stacks',
    label: 'Stacks',
    path: 'stacks/',
    title: 'Stacks',
    accent: 'from laptop to the 1%.',
    blurb: 'Three reference architectures and a vector database picker.',
  },
  {
    id: 'evidence',
    label: 'Evidence',
    path: 'evidence/',
    title: 'Evidence',
    accent: 'receipts and known failures.',
    blurb: 'Where every benchmark number comes from, and the pitfalls guide.',
  },
];

export function pageIndex(id: PageId): number {
  return PAGES.findIndex((p) => p.id === id);
}

export function nextPage(id: PageId): PageInfo {
  return PAGES[(pageIndex(id) + 1) % PAGES.length]!;
}
