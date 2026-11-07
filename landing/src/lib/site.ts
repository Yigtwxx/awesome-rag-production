/** Site-wide constants and URL helpers (everything is served under BASE_URL). */

export const REPO = 'Yigtwxx/awesome-rag-production';
export const REPO_URL = `https://github.com/${REPO}`;
export const SITE_NAME = 'Awesome RAG Production';
export const SITE_DESCRIPTION =
  'A curated, evidence-cited list of production-tested tools, reference ' +
  'architectures, and benchmarks for building retrieval-augmented generation ' +
  '(RAG) systems that hold up in production.';

const BASE = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

/** Path under the site base, e.g. href("docs/") -> "/awesome-rag-production/docs/". */
export function href(path = ''): string {
  return `${BASE}${path.replace(/^\//, '')}`;
}

/** Link into the mkdocs list, optionally to a heading anchor. */
export function docsHref(page = '', anchor?: string): string {
  const target = href(`docs/${page}`);
  return anchor ? `${target}#${anchor}` : target;
}
