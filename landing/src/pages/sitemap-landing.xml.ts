import type { APIRoute } from 'astro';
import { catalog } from '../lib/catalog';
import { PAGES } from '../lib/pages';
import { href } from '../lib/site';

/** The landing site's own pages (the tabs); /docs/ has its own sitemap. */
export const GET: APIRoute = ({ site }) => {
  const lastmod = catalog.lastUpdated ?? catalog.generatedAt;
  const urls = PAGES.map(
    (page) =>
      `  <url><loc>${new URL(href(page.path), site).href}</loc><lastmod>${lastmod}</lastmod></url>`,
  );
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
