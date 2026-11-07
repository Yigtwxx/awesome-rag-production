/**
 * Sitemap INDEX at the URL already registered in Google Search Console and
 * Bing. It points at the landing page's own sitemap and the one mkdocs
 * generates for the list under /docs/.
 */
import type { APIRoute } from 'astro';
import { href } from '../lib/site';

export const GET: APIRoute = ({ site }) => {
  const abs = (path: string): string => new URL(href(path), site).href;
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    `  <sitemap><loc>${abs('sitemap-landing.xml')}</loc></sitemap>`,
    `  <sitemap><loc>${abs('docs/sitemap.xml')}</loc></sitemap>`,
    '</sitemapindex>',
    '',
  ].join('\n');
  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
