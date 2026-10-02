# SEO requirements for Luvlae.com

## Purpose and source

This note captures the actionable recommendations in `luvlae_seo_strategy_ru_v2_competitor_benchmark.pdf`, prepared 2026-09-29 for the US market. It is a working SEO/content strategy, not legal advice or proof that a health claim is compliant or effective. Recheck current Google, FDA, FTC, and product-label requirements before implementation when they matter.

Primary conversion: click through to Amazon. The strategy treats Luvlae Berberine Patches as a health/YMYL product and calls for stronger trust and evidence handling than a general ecommerce landing page.

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

## Source

- User-provided PDF: `luvlae_seo_strategy_ru_v2_competitor_benchmark.pdf`, 19 pages, dated 2026-09-29.
- The strategy itself says it is not legal advice and notes that no GSC/server logs/CMS, finished-product lab documents, release/permeation tests, or Luvlae-specific human clinical studies were supplied. Treat its audit findings, competitor benchmark, keyword priorities, and recommendations as a plan to verify, not completed implementation facts.
