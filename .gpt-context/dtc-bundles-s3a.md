# DTC bundles — Stage 3A pack commerce lifecycle

Local implementation; independent review and shipping enforcement remain separate. No provider requests, remote DB changes or deployment were performed during development. Stripe tests use injected synthetic stubs.

## Contracts and snapshots

- Quote, Stripe session and mock endpoints accept an explicit `cartFormat: 'packs-v1'`. Quote lines use `{ sku, offerId, quantity }`; checkout lines additionally require `productVersion`. The legacy request shape remains accepted without pack fields and retains its original fingerprint inputs and item snapshots.
- Pack requests record `pricingPolicy.catalog: 'packs-v1'` on order and attempt quote. This marker is added only for the explicit new format. The new path requires migration `008-dtc-bundles` before creating records. Existing orders are looked up and replay fingerprints checked before catalog reads/normalization.
- Calculator snapshots preserve set quantity and total cents per set, `offerId`, `unitsPerPack`, `inventoryQuantity`, and a name identifying pack size/patch count. Quote response omits internal product IDs. Server snapshot totals remain immutable after catalog edits/archive.
- Reserve/mock read catalog inside their transaction, aggregate physical demand across offers per SKU, limit it to 99 boxes, and mutate one shared inventory row per product. Attempt reservation quantities contain aggregated boxes. Stripe line quantity and unit amount remain sets and cents per set, built into the existing frozen request before the injected provider call. Legacy frozen requests, retries/deadlines, tax behavior and payment configuration are unchanged.

## Consumers

- `aggregateInventoryItems` validates snapshots and sums physical quantities before applying cumulative `restockedQuantities`. Manual restock and paid cancellation therefore handle multiple offer lines correctly; shipped refunds remain money-only. Legacy all-absent pack fields normalize to one box per quantity.
- Admin/guest order and checkout quote DTOs preserve optional pack fields from stored snapshots. Admin detail also serializes an existing optional `salesTerms` snapshot; no policy date/version is invented or automatically enabled.
- Notification jobs preserve pack snapshots; email rows label sets and physical boxes. Existing legacy jobs retain their previous quantity labels. Begin-checkout/purchase item mapping and the analytics allowlist preserve snapshot `offerId` as `item_variant`, with quantity/price in sets. No catalog reread occurs in these projections.

## Verification and remaining work

`tests/dtc-lifecycle.test.ts` covers mixed 2/3-pack quote/reserve/payment, frozen lost-response retry after archive, duplicate paid webhook, expiry release, stock race/99-box bound, cancellation with cumulative physical restock, shipped refund/restock bounds, exact legacy fingerprint/replay, and frozen notification composition. Full synthetic server suite at freeze: 157/159 pass; only the two known automatic-tax/email-trigger baseline assertions fail. Scoped ESLint and TypeScript pass.

S3B must implement/verify pre-payment contiguous-US address enforcement separately, including legacy-new-request bypass prevention while allowing exact legacy replay/resume. Embedded shipping collection is intentionally unchanged in S3A. `salesTerms` remains optional and unset for new orders until an approved policy version/effective date exists. Frontend cart/pending cleanup and order quantity labels remain the relevant UI stages, not server lifecycle changes.
