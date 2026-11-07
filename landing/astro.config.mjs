// @ts-check
import { defineConfig } from 'astro/config';

const BASE = '/awesome-rag-production/';

// Before the landing page existed, mkdocs served these pages at the site root.
// They now live under /docs/; meta-refresh stubs keep old links and search
// results working.
const MOVED_DOC_PAGES = [
  'FAQ',
  'ROADMAP',
  'CHANGELOG',
  'CONTRIBUTING',
  'SECURITY',
  'CODE_OF_CONDUCT',
  'benchmarks',
  'rag-pitfalls',
  'datasets',
  'vector-database-comparison',
  'chunking-strategies',
  'embedding-model-selection',
  'showcase',
  'books',
  'blogs',
];

export default defineConfig({
  site: 'https://yigtwxx.github.io',
  base: BASE,
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  redirects: Object.fromEntries(
    MOVED_DOC_PAGES.map((page) => [`/${page}`, `${BASE}docs/${page}/`]),
  ),
});
