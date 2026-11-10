# How-to impressions investigation — 2026-10-30

## Post-rule verification — 2026-10-30

After the user deployed a Cloudflare Single Redirect, browser navigation confirmed www HTTPS destinations for home, How-to, About and Product; the sitemap opened as XML with 14 HTTPS www entries including How-to. Supplemental direct GET checks covered all four HTTP/HTTPS × apex/www variants for those four paths, with `?seo_check=1`: all 12 alternative URLs returned exactly one **308**, preserving path/query, then **200**; all four canonical URLs returned **200** without redirects. Sitemap and robots returned **200** without redirects. This supersedes the earlier HTTP 200 and apex 307 observations below for these tested paths. Search Console sitemap submission/processing and Google's current canonical selection were not accessed or verified. The agent made no external configuration change.

User reported a Search Console notification about fewer impressions for `http://www.luvlae.com/how-to-use-berberine-patches`. The notification alone does not establish the cause, affected dates, or magnitude.

## Public verification

Direct unauthenticated GETs on 2026-10-30, with redirects followed and response headers inspected:

- HTTP www URL returns **200**, without redirecting to HTTPS. Its HTML canonical points to the HTTPS www URL. A browser reaches HTTPS, but that does not prove a server redirect; direct HTTP serves the page.
- HTTPS www URL returns **200**, with self-canonical `https://www.luvlae.com/how-to-use-berberine-patches`. No meta robots noindex or X-Robots-Tag was present.
- HTTPS apex URL returns **307** to HTTPS www, then 200. The redirect has `x-vercel-id`; infrastructure ownership remains unknown. The application's permanent host redirect does not establish the observed edge behavior.
- Production `robots.txt` permits crawling and references the HTTPS www sitemap. Sitemap returns 200, contains 14 URLs, and includes the HTTPS www how-to URL.
- The published Title is `How to Use | Luvlae`; H1 is `Your daily patch routine in four simple steps`. Application/removal instructions are in the server HTML, with crawlable navigation and related-page links. Exact placement and wear duration are deferred to the package.
- The previous canonical-host mismatch is resolved in this public page, robots and sitemap snapshot. This does not establish when Google recrawled or changed its selected canonical.

## Interpretation and next evidence

- No observed 404/5xx, robots block or noindex explains the warning. Actual Google indexing, crawling and selected canonical remain unknown.
- HTTP duplicates and the temporary apex redirect should be consolidated with permanent redirects to HTTPS www, preserving path/query. This is an observed technical cleanup, **not a proven cause of lost impressions**. Verify edge/domain configuration before implementing; no infrastructure changes were made in this investigation.
- Search Console reports performance primarily against Google's selected canonical. Compare all URL variants and URL Inspection before interpreting a warning naming HTTP as loss for the HTTPS page. Source: [Google on canonical URL reporting](https://developers.google.com/search/blog/2019/02/consolidating-your-website-traffic-on).
- Inspect page-filtered performance for equal complete periods (initially 28 days versus preceding 28), then queries, country/device and site-wide changes. Compare query-level positions and impressions; assess demand only with relevant query data. Source: [Google traffic-drop investigation](https://developers.google.com/search/docs/monitor-debug/debugging-search-traffic-drops).
- More descriptive metadata/H1 and verified placement/wear-time guidance are content opportunities, not diagnosed causes. Current product-label conflicts remain unresolved; do not invent directions to improve SEO. See [product context](products/luvlae-berberine-patches.md).

## Access and scope

The current browser account's Domain-property page explicitly reports no access to `luvlae.com`. The user subsequently instructed that Search Console must not be accessed through MCP and that missing data should be requested directly. Use user-supplied exports for this investigation. No URL Inspection result, manual-actions report, field CWV or Google-selected canonical was obtained. No application code, indexing setting, deployment or external configuration was changed.

## User-supplied CSV evidence — 2026-10-30

Sources: the user's `luvlae.com-Performance-on-Search-2026-10-30` and `luvlae.com-Coverage-2026-10-30` CSV exports. Source files remain unchanged. Performance headers compare **2026-10-19–25 against 2026-10-12–18**, not two 28-day periods. Filters identify web search and the HTTP www how-to URL; the CSV does not encode the page-filter match operator.

- `Страницы.csv`: one HTTP www how-to row, impressions **64 → 13** (−51; −79.6875%), clicks **0 → 0**, CTR **0% → 0%**, average position **7.45 → 11.23** (worse by 3.78). This establishes deterioration for the row/periods, not the cause or lost clicks.
- `Запросы.csv`, `Страны.csv` and `Устройства.csv` each total **16 → 4 impressions**, inconsistent with the page row's **64 → 13**. Do not reconcile them by inventing missing traffic, or use them to explain the page total. Query anonymization alone cannot be assumed to explain discrepancies across device/country totals. Export scope/aggregation remains unverified.
- The two named queries with impressions in both periods have slightly better positions: `how to apply berberine patches` 9.17 → 8; `berberine patches how to use` 10 → 9.5. This does not contradict or explain the page-level average because the datasets do not reconcile and query coverage is limited.
- Coverage `Диаграмма.csv` ends on **2026-10-23**, despite the export filename date. Indexed/non-indexed counts: **7/10 on Oct 9**, **16/8 on Oct 17–19**, **10/15 on Oct 20–23**. The changed inventory and missing URL histories prevent identification of which six indexed URLs disappeared or why. Chart impressions are site-level and must not be substituted for how-to performance.
- `Критические проблемы.csv` reports **11 alternative canonical URLs** (validation status `Ошибка`), **1 discovered/not indexed**, **2 redirect errors**, **1 page with redirect**. These sum to the chart's latest 15 non-indexed URLs. Validation labels do not identify affected addresses, Google-selected canonicals, redirect chains, or root causes. A redirected URL or correctly canonicalized duplicate may be intentionally excluded.
- `Вид в поиске.csv` and `Незначительные проблемы.csv` contain headers only; do not infer absent rich-result eligibility or universal site health from that.

The measured performance periods predate the canonical code fix documented on Oct 27. The Oct 30 public canonical snapshot does not establish canonical state during Oct 12–25. No causal link to that later fix is established.

## User-supplied drilldown CSV evidence — 2026-10-30

The four `luvlae.com-Coverage-Drilldown-2026-10-30` export folders are mapped by their own `Метаданные.csv`, not the folder suffix. Each contains a category chart and URL table; none is an individual URL Inspection result.

- Unsuffixed folder: redirect errors on `https://luvlae.com/products/berberine-patches` (last crawl Oct 8) and `https://luvlae.com/about` (Oct 7). Neither is the how-to URL. Category count fell from 7 to 2 on Oct 17 and stayed 2 through Oct 23. These records do not establish current redirect failures or a cause of how-to's decline.
- `(1)`: page with redirect is `http://luvlae.com/`, last crawl Oct 18. Not the how-to URL.
- `(2)`: discovered/not indexed URL is `https://luvlae.com/about-product`. Its exported last-crawl value is `1970-01-01`; treat this as an unavailable/placeholder date, not a genuine crawl of the site in 1970. The intended www variant's indexing status remains unknown.
- `(3)`: alternative canonical category lists **both** `http://www.luvlae.com/how-to-use-berberine-patches` and `https://www.luvlae.com/how-to-use-berberine-patches`, last crawled Oct 23. Other entries are HTTPS www home/FAQ/Ingredients/Safety/Science and HTTP www home/Ingredients/Safety/Science: 6 HTTPS www and 5 HTTP www URLs in total. Thus this export does not merely document expected HTTP exclusions; the intended HTTPS how-to URL is also excluded as an alternative in this historical snapshot. The selected canonical itself is not exported, so do not assume the apex URL or declare all copies of the content absent from Google.
- Alternative canonical count rose from 4 to 11 on Oct 20, coinciding with the site-wide indexed-count decrease from 16 to 10. This supports canonical reassignment as a priority hypothesis, not a proven one-to-one mapping or causal attribution for impressions. The table includes later crawl dates than the chart endpoint; preserve the chart and row timestamps separately.

The strongest current lead is historical canonical selection affecting the intended HTTPS how-to URL. It is consistent with the pre-Oct-27 hostname mismatch documented in the earlier audit, but the exact Google-selected target and current post-fix indexing remain unknown. The Oct 30 public self-canonical could resolve old conflicting signals after recrawling; the supplied exports cannot verify that happened.

Next user data: **URL Inspection for the HTTPS www how-to URL**, including indexing status, last crawl, user-declared canonical and Google-selected canonical. Then inspect the selected target if it differs, and HTTP if useful. A category URL export cannot replace these fields. A consistent performance comparison across how-to URL variants remains useful after identifying the canonical. Do not request credentials or broaden account access.

Relevant source: [page content](../apps/web/src/_pages/information/model/pages.ts), [route](../apps/web/app/(default)/how-to-use-berberine-patches/page.tsx), [metadata](../apps/web/src/_pages/information/model/getInformationMetadata.ts), [redirect config](../apps/web/next.config.ts).
