# SEO requirements for Luvlae.com

## Direct-sales SEO implementation — 2026-10-27

- The user confirmed the production retail price as USD 19.99 and authorized canonical, Offer and ecommerce analytics changes. This resolves the audit's uncertainty about intended retail pricing; no catalog write was made in this change.
- Public SEO URLs now use `src/shared/config/site` (`https://www.luvlae.com`): metadataBase, OG resolution, sitemap, robots and all existing JSON-LD. `next.config.ts` declares a host-specific permanent 308 for apex with path/query preserved. The previously observed upstream apex 307 is outside this app rule: after deployment, verify the actual edge/domain redirect and align it if it runs before the app. No deployment/domain-setting write was made here.
- Product `Offer` uses the same request-time `getProductOffer` result as the visible purchase UI: cents convert to USD, stock-minus-reservations determines availability, and missing/disabled/invalid offers omit Offer. There is no hardcoded USD 19.99 fallback, browser localStorage source or build-time price snapshot. Admin price/stock edits reach HTML/JSON-LD on the next server request without rebuilding. The existing product route stays `force-dynamic` and private/no-store.
- GA4 now records `view_item`, actual `add_to_cart`/`remove_from_cart` quantity changes, `view_cart`, `begin_checkout`, and `purchase`. Checkout uses the server's immutable live attempt quote; purchase uses the authenticated order snapshot and requires a successful associated live settlement plus both production markers. Mock/test payments cannot authorize purchase events. Browser receipts and stable transaction_id suppress repeated checkout/purchase events. Collection remains browser-based: no receipt page visit, blocked analytics or lost delivery can result in missing events; order records remain the financial source of truth.
- Analytics is gated to the production build, configured GA ID and canonical production origin. Code-owned page views and ecommerce events sanitize order URLs, referrers and query strings, use a field allowlist, and omit customer/contact/token/provider data. Admin page views are suppressed. `send_page_view:false` avoids Google's automatic initial page view; in GA4 stream settings disable Enhanced Measurement history-based page views to avoid duplicate/raw-URL events from Google's independent automatic collection. GA4 property settings and live event ingestion were not inspected or changed.
- Regression coverage: `tests/storefront-seo.test.ts`, `tests/ecommerce-analytics.test.ts` and existing cart tests. The audit below is the pre-change snapshot; review the implementation above for current source behavior.
- Verification: 24 focused cart/SEO/analytics tests passed; ESLint and regenerated Next route types/TypeScript passed; stage vinext/Cloudflare build completed. Existing local Next HTTP responses confirmed a 308 retaining path/query, 14 www sitemap URLs, www canonical/OG, and DB-derived Offer. Extended checkout/commerce checks passed 37/38: the pre-existing `checkout-session.test.ts:157` expects automatic tax disabled, while unchanged HEAD enables it. Tax behavior was not modified to resolve that separate discrepancy. No live GA delivery, Rich Results Test or production deployment was performed.

## Current audit — 2026-10-27

See [the direct-sales SEO audit](seo-audit-2026-10-27.md) for current code and public HTTP verification. Earlier Amazon-only/mock-checkout descriptions below are historical: the published product page now renders price/stock and Add to cart, and shipping/returns describe direct sales. Product JSON-LD still has no Offer; adding one requires verified real retail terms and consistency with the server offer. The public page showed USD 19.99, while the same-day architecture note records initial production provisioning at a USD 1.00 verification price; the reason is unknown and needs operational verification before feeds/markup. Apex redirects to www with 307 while canonical/schema/sitemap still use apex. Ingredients, Science and How-to are indexable; source/label verification remains unresolved in the reviewed notes. Homepage illustrative names/stars are displayed, but disclosure strings in the dictionary are not rendered. GA configuration is present in public HTML, but code only implements Amazon outbound tracking, not ecommerce events. No GSC/GA reports, completed payment, field CWV or Merchant Center eligibility were verified in this audit.

## Purpose and source

This note captures the actionable recommendations in `luvlae_seo_strategy_ru_v2_competitor_benchmark.pdf`, prepared 2026-09-29 for the US market. It is a working SEO/content strategy, not legal advice or proof that a health claim is compliant or effective. Recheck current Google, FDA, FTC, and product-label requirements before implementation when they matter.

Original strategy conversion: click through to Amazon. As of 2026-10-18, purchase CTAs lead to the product page and the storefront uses an explicitly temporary mock checkout; see [implementation](commerce-ui.md). Do not add real purchase analytics or merchant Offer markup based on simulated payments or synthetic seed pricing. The strategy treats Luvlae Berberine Patches as a health/YMYL product and calls for stronger trust and evidence handling than a general ecommerce landing page.

## Strategic direction

- Make **Berberine Patches** the primary product identity and commercial topic.
- Use clear, qualified benefit language such as **appetite support**, **craving support**, **metabolic support**, and **healthy weight-management support** on commercial pages. Prefer “supports,” “helps support,” and “complements a healthy routine”; never promise outcomes.
- “GLP-1 Friendly” may appear only as a secondary descriptor, if used at all, with an explicit explanation that the product is not a prescription GLP-1 medication and does not contain semaglutide. Do not make GLP-1 the main brand identity.
- Do not use as baseline positioning: “natural Ozempic,” semaglutide/GLP-1 medication equivalence, appetite suppressant, fat-burning, guaranteed or quantified weight loss, disease/blood-sugar treatment, “no side effects,” “clinically proven patch” without Luvlae-specific human trials, or direct-to-bloodstream/high-bioavailability claims without product-specific evidence.
- Delivery and mechanism language (sustained/gradual release, bypasses digestion, absorption, bioavailability, direct bloodstream) is conditional. Require relevant evidence for the exact finished formulation and route before publishing it.
- Do not transfer findings about oral berberine to a transdermal patch. Clearly distinguish human oral evidence, preclinical transdermal evidence, and studies/tests of the finished Luvlae product.
- Treat competitor claims as market-language research only; competitor usage does not establish safety, substantiation, or compliance.
- The strategy cautions against calling the topical patch a “dietary supplement” without regulatory review. Verify classification and wording with qualified counsel for the actual product and label.

## Search intent and keyword groups

### Commercial

- berberine patches / berberine patch
- Luvlae berberine patches
- berberine patches for appetite support
- berberine patches for cravings
- berberine patches for weight management
- metabolic support patches
- pill-free berberine patches
- berberine patch 60 day supply
- GLP-1 friendly berberine patches (secondary only; see claim rules)

### Product decision and use

- berberine patch ingredients
- how to use berberine patches
- berberine patch placement
- how long to wear berberine patch
- berberine patch safety
- berberine patches vs capsules / pills
- berberine transdermal research

### Informational

- what are berberine patches
- do berberine patches work
- where to place a berberine patch
- berberine patch side effects
- transdermal berberine evidence
- berberine patches and GLP-1 medications difference
- how to read a berberine patch label

Do not create near-duplicate pages for “for women,” “for men,” “daily patch,” and other keyword permutations. Every URL must answer a distinct intent with useful original content. Amazon keyword volume is not Google search volume; validate priorities with Search Console and Google-focused keyword data.

## Recommended site architecture

- `/` — branded homepage and trust hub, with links to product, evidence, safety, and guides.
- `/products/berberine-patches/` — primary commercial landing page for “berberine patches”; verified product facts and Amazon CTA.
- `/ingredients/` — exact label composition and quantities; clearly separate ingredient research from finished-product evidence.
- `/how-to-use-berberine-patches/` — placement, verified wear time, removal, skin care, and practical questions.
- `/berberine-patch-safety/` — skin precautions, medication/pregnancy questions, and when to consult a clinician; qualified review where available.
- `/science/berberine-patches/` — route-specific evidence map: oral human, preclinical transdermal, and Luvlae-specific evidence.
- `/berberine-patches-vs-capsules/` — format comparison without claiming efficacy superiority.
- `/berberine-patches-vs-glp-1-medications/` — educational distinction, not a GLP-1 commercial landing page.
- `/guides/` — informational content hub.
- `/about/`, `/faq/`, `/contact/`, `/shipping/`, `/returns/` — brand, questions, contact, and clear Amazon fulfillment/return details.
- `/quality-testing/` only if real, publishable CoA, specifications, testing, or manufacturing evidence exists.

Avoid a one-page site that mixes product sales, use instructions, safety, and scientific evidence. Build pages around distinct intents and connect them with crawlable internal links.

## On-page requirements

- One unique, descriptive Title and one H1 per indexable page. Use natural language; do not repeat keyword lists in every heading.
- Give each page a specific meta description that accurately reflects its content and makes no unsupported outcome promise.
- Use self-referencing canonical URLs on indexable pages.
- Use a factual image alt text describing the actual image (for example, “Luvlae Berberine Patches - 60 Count”); do not keyword-stuff or use GLP-1 as an image keyword when it does not describe the image.
- Use an Open Graph image suited to sharing (strategy suggests about 1200 × 630 px).
- Product copy may be benefit-led, but use support/complement language. Explain the verified product, directions, ingredients, safety, and where to buy it.
- Product page should include a short evidence note and link to full Ingredients, Science, Safety, and How-to pages.
- Give health and science pages a real author, real reviewer if one exists, sources, and an update date that changes only after an actual review/update. Do not invent medical credentials.

## Evidence, safety, and trust

- On the Science page, label evidence by route and type: human oral berberine, preclinical transdermal research, and finished-product Luvlae evidence. Include study population, formulation/route, sample size, outcomes, and limitations when known.
- Say explicitly that oral research does not establish the same absorption or outcome for this patch; animal studies do not prove human efficacy or bioavailability for a consumer patch.
- Testimonials and review summaries describe user experience; they are not scientific proof of appetite, weight, or glucose outcomes. Do not copy Amazon's AggregateRating as if reviews were collected on luvlae.com.
- Make Safety a useful standalone resource, not only a footer disclaimer. Follow the current product label; describe skin-use precautions and medication/pregnancy questions cautiously and seek qualified review for medical guidance.
- Use exact current packaging/label facts. Do not claim third-party testing, GMP, made in USA, quality certifications, or other trust signals without verifiable documentation.
- Publish accurate business identity/contact details and explain that Amazon handles purchase/fulfillment/returns when applicable.
- A supplement disclaimer does not cure misleading overall claims; the full page's net impression must remain accurate.

## Technical SEO and structured data

- Maintain `sitemap.xml`; submit it to Google Search Console. Check `robots.txt` does not block intended product, ingredient, how-to, safety, science, or guide pages.
- Use a real HTTP 404 for missing pages; redirect HTTP and alternate hostnames to one HTTPS canonical hostname.
- Keep one H1 and a logical H2/H3 hierarchy. Navigation and important page links must be crawlable HTML links; do not hide essential content only behind JavaScript interactions.
- Show breadcrumbs on relevant internal pages and keep `BreadcrumbList` data aligned with the visible hierarchy.
- Suggested schema, only when it matches actual page content: `Organization` and `WebSite` on home/about; `Product` on the product page; `Article`/`BlogPosting` on guides and science content; `BreadcrumbList` on internal pages.
- Since checkout is on Amazon, do not invent on-site `Offer`, price, or availability; do not use merchant listing/merchant offer markup unless the site itself supports the purchase flow and satisfies current Google rules.
- Do not create `AggregateRating` from Amazon reviews or use `MedicalWebPage`/`Drug` schema unless product status and content genuinely qualify.
- Validate structured data with Google's current tools.
- Serve large images as WebP/AVIF where supported, specify width/height to reduce CLS, preload only the real hero image, and lazy-load below-the-fold images.
- Check mobile Core Web Vitals (LCP, INP, CLS) and crawl/indexing in Search Console.

## Content plan and measurement

Initial guide topics from the strategy:

1. What Are Berberine Patches? Format, Ingredients and Evidence
2. How to Use Berberine Patches: Placement, Wear Time and Skin Care
3. Do Berberine Patches Work? What Is Known and What Is Not
4. Berberine Patches vs Capsules: What Changes with the Delivery Format?
5. Berberine Patch Safety: Skin Reactions, Medications and When to Ask a Clinician
6. Berberine and Transdermal Delivery: What Research Actually Studied
7. Berberine Patches vs GLP-1 Medications: Not the Same Thing
8. How to Read a Berberine Patch Label: Ingredients, Amounts and Claims

Each article should answer its query early, distinguish route/formulation when citing research, prioritize primary/authoritative sources (FDA, FTC, NCCIH, PubMed and primary studies), include a real byline and sources, and link to relevant product and educational pages. Prefer useful original diagrams and analysis over generic volume.

Track indexable/ indexed target URLs, non-brand impressions and clicks, page-level CTR, rankings across relevant query groups, Amazon outbound clicks as a separate GA4 event/conversion, Core Web Vitals, and quality referring domains. Review high-impression/low-CTR pages. Use Search Console data after 4–6 weeks to decide content expansion; do not rely on intuition or Amazon keyword volume alone.

## Important product-data discrepancy

The SEO strategy PDF reports current-site ingredient amounts (berberine 70 mg, green tea 15 mg, Panax ginseng 15 mg, ginger 10 mg, L-carnitine 30 mg) and 6–8 hour wear directions. An earlier Amazon listing PDF in `.gpt-context/products/luvlae-berberine-patches.md` names L-glutamine and Garcinia Cambogia in the product title and says replace every 24 hours. Listing image files also show additional formula details. These sources conflict and may represent different listing versions/variants. **Do not merge these into a single product specification or publish exact ingredients, amounts, placement, or wear time until the current product label is confirmed.**

## Initial site implementation (2026-10-06)

- The homepage and product route are statically generated and indexable. The homepage links to separate product, ingredients, how-to, safety, science, FAQ, and about routes.
- The homepage, product, About, FAQ, Ingredients, How-to, Safety, and Science routes are indexable and included in `sitemap.xml`. On 2026-10-07 the user requested enabling indexing for Ingredients, How-to, Safety, and Science with code TODOs to re-check their content. These TODOs do not establish that outstanding source verification or qualified review has been completed; see `apps/web/src/_pages/information/model/pages.ts` and `apps/web/app/(default)/ingredients/page.tsx`.
- No on-site price, availability, review rating, Offer, or AggregateRating markup has been added. Amazon is linked as an external purchase destination.
- Homepage copy avoids the Figma mockup's unverified pharmacokinetic, absorption, and timed-release claims; see `apps/web/src/shared/config/i18n/messages/en.yaml`.
- The product page now separates marketplace-snapshot facts, label checks, evidence limits, safety, and Amazon purchase details in `apps/web/src/_pages/product/`. It does not publish a current ingredient panel or wear time.
- Homepage and product metadata include Open Graph images using the existing 512 × 279 px asset; a higher-resolution share image is still needed. Home has minimal `Organization` and `WebSite` JSON-LD; product has `Product` without `Offer` or rating plus visible breadcrumb markup. The Product schema does not imply eligibility for a Google product rich result without its required review/rating/offer data.
- The Science page now gives berberine background, states that most human research is oral, and says oral findings cannot establish delivery or effects for the patch. It no longer cites NCCIH or the 2018 rat study, and it links to the ingredients page. The Safety page uses the supplied precaution copy and links to the how-to guide. Both routes are indexable at the user's direction; code comments flag their content for re-checking, and source verification or qualified review remains outstanding.
- GA4 loading and `amazon_outbound_click` are prepared behind `NEXT_PUBLIC_GA_MEASUREMENT_ID`; GitHub Actions and Turborepo are wired to pass the repository Actions variable into production builds. No measurement ID, GSC verification, or live conversion has been confirmed. See `apps/web/README.md`.
- The product page now follows the supplied desktop/mobile Figma composition with a product gallery, fact cards, routine checklist, distinct educational links, evidence context, FAQ, and Amazon CTA. All page copy and metadata live in `src/shared/config/i18n/messages/en.yaml`; the image gallery uses native radio controls and the FAQ uses native disclosure elements. See `apps/web/src/_pages/product/` and `app/(default)/products/berberine-patches/page.tsx`.
- The additional user-supplied Amazon listing (`B0HBQWZCD3`) is a different ASIN and conflicts internally on wear time. Its relationship to the existing purchase ASIN is unverified, so no formula or wear-time claim was added from it; see [the product note](products/luvlae-berberine-patches.md).
- The Ingredients route displays the user-supplied “PER ONE PATCH” graphic and transcribes its 11 ingredient amounts into HTML. Its copy attributes the amounts to that image and explains that the image is not a complete current package label or confirmed match for the promoted ASIN. The user enabled indexing on 2026-10-07 with a code TODO to re-check the graphic against the current label and promoted ASIN; see [the product note](products/luvlae-berberine-patches.md).
- The About and FAQ routes were made indexable on 2026-10-07 at the user's direction after confirming their current copy. On the same date, the user requested indexing How-to, Safety, and Science with code TODOs to re-check their content. The sitemap builds from `indexableInformationPaths`, so all these routes are included automatically.

## Source

- User-provided PDF: `luvlae_seo_strategy_ru_v2_competitor_benchmark.pdf`, 19 pages, dated 2026-09-29.
- The strategy itself says it is not legal advice and notes that no GSC/server logs/CMS, finished-product lab documents, release/permeation tests, or Luvlae-specific human clinical studies were supplied. Treat its audit findings, competitor benchmark, keyword priorities, and recommendations as a plan to verify, not completed implementation facts.

## Marketing homepage update (2026-10-10)

- New homepage uses the user's 15 supplied review texts. The review list displays illustrative names and individual star ratings with a visible disclosure that these were not supplied with the texts; they are not verified customer data. No review dates, verified-purchase badges, helpfulness counts, or Review/AggregateRating schema have been added. Photos are lifestyle images paired with excerpts, not identified reviewers. Reviewer identity, provenance, and photo-to-review matching remain unknown.
- The 20% discount for buying two packs is supplied by the user. An attempted Amazon listing check on 2026-10-10 did not expose that promotion in the retrieved content. The badge includes a visible qualifier to check current eligibility/terms on Amazon; it is not independent verification of a current offer. Recheck the promotion when publishing or updating campaign copy.
- `/about-product` retains the previous homepage with unique title, description, canonical and sitemap entry. Organization/WebSite JSON-LD remains on `/`. Home Open Graph now references the existing 2500 × 2500 product image instead of a missing JPG.
