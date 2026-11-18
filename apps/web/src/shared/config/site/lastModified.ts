/**
 * Last real content change per indexable path (ISO date), used for sitemap `lastmod`.
 * Update an entry only when the page's visible content or metadata meaningfully changes;
 * never derive it from the request or build time.
 */
export const pageLastModified: Record<string, string> = {
  '/': '2026-11-18',
  '/videos/berberine-patches': '2026-11-18',
  '/products/berberine-patches': '2026-11-12',
  '/about-product': '2026-10-18',
  '/about': '2026-11-10',
  '/ingredients': '2026-11-12',
  '/how-to-use-berberine-patches': '2026-11-12',
  '/berberine-patch-safety': '2026-11-12',
  '/science/berberine-patches': '2026-11-12',
  '/faq': '2026-11-12',
  '/contact': '2026-11-12',
  '/shipping': '2026-10-27',
  '/returns': '2026-10-27',
  '/terms': '2026-10-27',
  '/privacy': '2026-10-27',
};
