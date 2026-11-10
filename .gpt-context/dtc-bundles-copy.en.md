# DTC bundles — proposed English copy

Prepared 2026-11-06 at the user's request. Draft content for implementation; not published. Placement and assumptions are in [the technical solution](dtc-bundles-technical-solution.md); sequencing is in [the implementation plan](dtc-bundles-implementation-plan.md). Editorial notes in this document must never appear in customer-facing content. Render prices/counts from the server catalog, not from this document.

## Homepage: first screen (`home.promo`)

Eyebrow: LUVLAE

H1: Berberine Patches

Supporting line: A simple, pill-free step for your everyday routine.

Description: Discover a discreet patch format that’s easy to apply and fits around your day. Each box contains 60 patches.

Format highlights: Pill-free format · Discreet design · Easy to apply

Primary CTA: View Product

Quantity label: 60 patches per box

Shipping line: Free Standard Shipping within the contiguous U.S. No minimum order.

Shipping link: Shipping Details

Guarantee line: 30-Day Money-Back Guarantee on your entire first order.

Guarantee link: See Guarantee Details

Editorial: retain current image and layout; line breaks adapt to available space. Full product name must remain visible. Shipping Details links to `/shipping`; Guarantee Details to `/returns`.

## Homepage: existing product section (`home.hero`)

Eyebrow: LUVLAE BERBERINE PATCHES

Heading: A patch format that fits your day.

Description: Keep your routine simple with a discreet, pill-free format. Start with one box or choose a multi-box pack, with 60 patches in every box.

Highlights: Pill-free format · Discreet design · Easy to apply

Primary CTA: View Product

Secondary CTA: About the Product

Supporting line: Explore the product and choose your pack.

Editorial: link the secondary CTA to the existing `/about-product`, not `/about`.

## Homepage: pack selection

Eyebrow: CHOOSE YOUR PACK

Heading: Find your fit.

Description: One box or a little more on hand — choose the pack that suits your routine. Every box contains 60 patches.

| Field | 1-Pack | 2-Pack | 3-Pack |
| --- | --- | --- | --- |
| Title | 1 Box | 2 Boxes | 3 Boxes |
| Count | 60 patches | 120 patches | 180 patches |
| Total price | $19.99 | $29.99 | $39.99 |
| Supporting line | A simple place to start. | Keep an extra box on hand. | More on hand for your routine. |
| CTA | View Product | View Product | View Product |
| Destination | `/products/berberine-patches?offer=standard` | `/products/berberine-patches?offer=<two-pack-uuid>` | `/products/berberine-patches?offer=<three-pack-uuid>` |

Editorial: UUID values above are documentation placeholders. Build links from the actual stable offer IDs returned by the catalog; never render placeholder URLs. New pack sizes and prices use the same copy templates with catalog-derived counts and amounts.

2-Pack badge specified in the brief: Best Value

Editorial decision outstanding: 3-Pack has the lowest price per box. Recommended alternative for the highlighted 2-Pack badge: `Recommended`. Do not claim `Most Popular` without sales evidence. This editorial note is not customer copy.

Below the cards:

Free Standard Shipping within the contiguous U.S. No minimum order. [Shipping Details](/shipping)

Your entire first order is covered by our 30-Day Money-Back Guarantee — including every box in a 2-Pack or 3-Pack. [Guarantee Details](/returns)

Editorial: do not add percentage savings or strike-through prices unless derived from the same current catalog and displayed with a clear comparison basis.

## Product page: purchase area

Existing title retained: Luvlae Berberine Patches

Suggested subtitle: A discreet, pill-free format for your everyday routine.

Selector legend: Choose Your Pack

Options:

- 1-Pack · 1 box · 60 patches — $19.99
- 2-Pack · 2 boxes · 120 patches — $29.99
- 3-Pack · 3 boxes · 180 patches — $39.99

Price label: Pack Total

CTA: Add to Cart

Shipping: Free Standard Shipping within the contiguous U.S. No minimum order.

Shipping link: Shipping Details

Guarantee: Try your first order with confidence. Every box is covered by our 30-Day Money-Back Guarantee, including 2-Pack and 3-Pack orders.

Guarantee detail: Contact us within 30 days of delivery. Opened or partially used boxes are eligible. See our refund policy for full terms.

Guarantee link: Read Our Refund Policy

Unavailable option: This pack is currently unavailable. Please choose an available pack.

Cart line pattern: 2-Pack · 2 boxes · 120 patches

Cart quantity label: Sets

Editorial: retain existing offer-error and checkout recovery messages. Selecting a pack does not add it to the cart. Price label/count update with selection, with no unsupported health or supply-duration promises.

## Homepage: final CTA

Eyebrow: YOUR ROUTINE, YOUR PACK

Heading: Make room for a simpler routine.

Description: Explore Luvlae Berberine Patches and choose from three pack options, with 60 patches in every box.

CTA: View Product

Supporting line: Free Standard Shipping within the contiguous U.S. Your entire first order is covered by our 30-Day Money-Back Guarantee. Terms apply.

Editorial: link the relevant phrases to Shipping and Returns; do not turn this CTA into Add to Cart.

## About Luvlae (`/about`)

Metadata title: About Luvlae | A Simpler Everyday Routine

Meta description: Get to know Luvlae’s philosophy: simple routines, thoughtful product choices, and clear information about our berberine patch format.

Eyebrow: ABOUT LUVLAE

H1: Small steps. A routine of your own.

Lead: We believe self-care should leave room for real life. Luvlae is about making space for simple, considered choices in your everyday routine.

### The idea behind Luvlae

Daily routines are personal. They change with our schedules, our preferences, and the way we move through the day. Our starting point is a simple question: how can an everyday product fit more naturally into that routine?

With Luvlae Berberine Patches, we focus on a discreet, pill-free format that’s easy to apply. Each box contains 60 patches, and you can choose the pack that works for you.

### Simplicity with purpose

For us, simplicity means making the essentials easier to understand: what a product is, what comes in the box, how to follow its directions, and what to expect when you order.

We want the experience of choosing and buying from Luvlae to feel clear from the first visit to the moment your order arrives.

### What matters to us

**Everyday practicality.** A product should fit into your life, with a format that respects your preferences and routine.

**Clear choices.** Straightforward pack sizes, visible prices, and accessible shipping and refund information help you decide what works for you.

**Honest information.** We distinguish information about individual ingredients from evidence about a finished patch. Research on an ingredient does not, by itself, establish the effects of a topical product.

**Care beyond the order.** We make it easy to find our support team and understand the terms of our first-order money-back guarantee.

### Our approach to product development

Our approach starts with the everyday experience: the format, how it fits into a routine, and how clearly the product is explained. We value practical choices and clear communication over complicated promises.

We also believe that product information should be specific about what is known. When exploring Luvlae, read the ingredients and directions on your current package, and use our guides to learn more about the patch format and the evidence around it.

### Here when you need us

Questions about the product, your order, or our policies? Contact our support team. Your entire first order is covered by our 30-Day Money-Back Guarantee, including every box in a multi-box pack. Full terms are available in our refund policy.

Primary CTA: Explore Berberine Patches

Secondary CTA: Contact Us

Text link: Read Our Refund Policy

Editorial: primary link to `/products/berberine-patches`; support to `/contact`; policy to `/returns`. Keep existing product/safety/evidence links available. These passages describe philosophy and intended approach, not a founding history, manufacturing audit or verified research programme. Do not add founder dates, locations, endorsements, testing claims or certifications without sources.

## Shipping Policy: targeted replacement

Replace only the current Shipping Rates paragraph. Keep the current geography, processing, delivery estimates, tracking and support sections unless operations changes them separately.

Heading: Free Standard Shipping

Paragraph: We offer free standard shipping on all orders delivered within the contiguous United States. No minimum order is required. This applies to our 1-Pack, 2-Pack, and 3-Pack offers. No standard shipping charge is added at checkout.

Editorial: confirm this matches fulfillment and enforce supported addresses before payment. Do not silently expand shipping to Alaska, Hawaii, Puerto Rico or other territories.

## Returns & Refunds Policy: targeted replacement

Metadata description: Read Luvlae’s 30-Day Money-Back Guarantee for your entire first order, including multi-box packs, plus refund terms and how to contact support.

Lead: At Luvlae, we want you to feel confident about your purchase. Our 30-Day Money-Back Guarantee covers your entire eligible first order placed directly through www.luvlae.com, including every box in a 2-Pack or 3-Pack.

### 30-Day Money-Back Guarantee

If you are not satisfied with your first Luvlae order, contact us within 30 days of delivery to request a refund. The guarantee covers all boxes in that first order, including all boxes purchased as part of a 2-Pack or 3-Pack. Opened or partially used boxes are eligible.

The satisfaction guarantee is available once per customer or household and applies to the first order placed directly through www.luvlae.com. Repeat orders are not covered by this satisfaction guarantee.

You do not need to continue using a product that causes irritation or discomfort. Stop using it and contact our support team.

### How to Request a Refund

Please contact us through our Contact Us page and include your order number, the email address used at checkout, and a brief explanation of your request.

We may request reasonable supporting information to locate your order or understand the issue. Proof of product use is not required for dissatisfaction requests.

### No Physical Returns

We do not require physical returns for eligible guarantee refunds. Please do not send products to our business address or fulfillment warehouse.

### Refund Amounts and Processing

For an approved satisfaction-guarantee request covering your first order, we refund the amount you paid for all products in that order, including applicable product taxes. This includes the full amount paid for eligible 2-Pack and 3-Pack offers. Any amount already refunded will be deducted so that the total refunded does not exceed the amount you paid.

Standard shipping within the contiguous United States is free, so there is no standard shipping charge to deduct from your refund.

Refunds are issued to the original payment method. We process approved refunds within 5 business days. Your bank or payment provider may require additional time to post the credit.

Editorial: retain the existing sections on damaged/defective/incorrect/missing items, other retailers, consumer rights and cancellation. Those remedies remain separate from first-order satisfaction coverage. Preserve the existing cancellation-policy anchor. Replace the old one-unit restriction everywhere it appears. Publish an effective date only when the revised policy actually takes effect; treatment of earlier orders remains to be decided.

## Optional FAQ entry, if shipping/guarantee FAQs are added

**Does the guarantee cover a 2-Pack or 3-Pack?**

Yes. Our 30-Day Money-Back Guarantee covers every box in your eligible first order, including 2-Pack and 3-Pack purchases. Contact us within 30 days of delivery. See our Returns & Refunds Policy for full terms.

**Is standard shipping free?**

Yes. Standard shipping is free on all orders within the contiguous United States, with no minimum order. See our Shipping Policy for delivery areas and estimated processing and delivery times.
