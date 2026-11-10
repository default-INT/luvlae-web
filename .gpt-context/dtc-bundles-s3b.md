# DTC bundles — Stage 3B locked shipping and inclusive tax

Local implementation only, not deployed or tested against real Stripe. No remote database/provider/email writes occurred. Migration `009-locked-shipping` is additive after `008`; it preserves legacy order/attempt/request documents and adds optional shipping/provisioning fields and order-only `pricing.includedTax`.

## Protocol

New Stripe and mock creations require `cartFormat: 'packs-v2'`, pack items and `shippingAddress: {recipientName,line1,line2?,city,state,postalCode,country:'US'}`. Strings are bounded/trimmed, state uppercased, ZIP is five digits or ZIP+4. State must be one of the contiguous 48 or DC. Excluded-region ZIP prefixes are rejected even when paired with an allowed state; New York `00501` and California `961xx` remain accepted. These are geography/syntax checks, not full postal deliverability verification.

ZIP evidence: [USPS three-digit districts](https://about.usps.com/what/performance/service-performance/zip-3-by-area-district.htm), [USPS package services excluded prefixes](https://faq.usps.com/articles/Knowledge/What-are-Package-Services), [USPS military addressing](https://pe.usps.com/text/dmm300/703.htm). The server source is `shipping-address.ts`; the client-safe `ShippingAddress` type is exported from `entities/order`.

Legacy/v1 exact persisted requests replay before catalog reads and before new-format enforcement. New legacy/v1 requests return `CHECKOUT_RELOAD_REQUIRED` before order/reservation/provider writes. This error specifically means no persisted order existed for the creation key; it allows an unsent old pending request to be replaced by a new addressed request. Unknown network/provider/recovery errors do not carry that guarantee. Quote accepts v2 pack items without an address for estimates.

## Provider state and recovery

Normalized delivery enters the v2 fingerprint, order.shippingAddress + shippingPolicy, and attempt.shippingSnapshot. Each Stripe attempt gets a dedicated Customer. `customerProvision` persists pending state, parameters, API version and stable key before the external call. Customer ID is persisted with a transaction/CAS, then the Session request is frozen before Session creation. No customer reuse or delivery updates from billing details.

Embedded Session uses the saved Customer, `customer_update.shipping='never'`, omits editable shipping collection/customer creation, and uses the frozen Customer shipping for tax. Explicit payment_intent_data.shipping is omitted because Stripe rejects it with automatic_tax enabled. Association checks the Customer ID and order/attempt destination identity. Paid contact projection preserves delivery when Stripe collected shipping is absent; billing may supply buyer contacts without changing delivery.

Original reservation deadline remains authoritative. Unknown Customer/Session results retain reservations and reuse frozen keys/parameters; no new provider objects are created after the deadline or Customer idempotency recovery window. If no Session request ever existed, guest cancellation safely releases physical reservations in a transaction competing with Session freezing; late Customer completion cannot open payment after cancellation. When a Session request exists but its result is unknown, provider-confirmed cancellation/recovery remains required.

## Included tax

Gross quote/item prices and total remain immutable, with tax surcharge zero. Known frozen requests with automatic tax enabled and every price explicitly inclusive may report nonzero `amount_tax`; bounded observed tax is stored only as order.pricing.includedTax. Attempt quote/request/hash are not rewritten. V2 payment requires automatic-tax enabled/status complete, exact gross subtotal/total and matching paid/received PaymentIntent amounts. Unknown legacy frozen-request metadata keeps strict tax comparison. Reference: [Stripe tax behavior](https://docs.stripe.com/tax/products-prices-tax-codes-tax-behavior).

## Verification

Final focused backend run: 60/60 pass (`/tmp/luvlae-s3b-final-focused.log`): validation/geography, no invalid reservations, Customer timeout/retry/concurrency, safe unopened cancellation after deadline, destination immutability, legacy/v1 exact replay, zero/nonzero inclusive tax, wrong Customer/incomplete tax rejection, migration repeat/partial-state checks, and existing checkout/commerce/email/pack lifecycle coverage. Scoped ESLint and TypeScript pass.

Earlier full suite: 160/171 pass (`/tmp/luvlae-s3b-tests.log`), with ten cart fixture failures during concurrent S5 contract migration and the known email scheduler trigger assertion. The old automatic-tax assertion is now updated to the reviewed enabled/inclusive behavior. S5 owner handles cart tests separately.

Real Stripe embedded/sandbox verification remains the existing release prerequisite: restricted-key Customer permissions, locked delivery, billing changes, gross-subtotal tax semantics, valid/excluded address journeys and recovery. This does not establish full postal address verification. Sales terms policy version/effective date remain unconfigured; no date was invented.

## Review correction: deadline and unknown identity recovery

`freezeShippingSession` rechecks the original reservation deadline inside the transaction before writing a first Session request. A Customer response arriving after that deadline leaves no frozen Session request or provider Session call, so unpaid cancellation remains available.

`POST /api/checkout/resolve` accepts only `{operationId,guestToken}` and performs an ownership/operation/access-expiry lookup of the Stripe creation key. Success returns only `{id}` with the existing guest order cookie; it does not reserve inventory, calculate a quote, call a provider or require checkout to be enabled. A missing/mismatched/expired lookup returns `CHECKOUT_NOT_READY`; this does not prove that concurrent creation cannot still commit. Unknown-ID v2 cancellation resolves identity first, then calls the existing authenticated cancellation route. It must retain pending recovery state on unresolved lookup. Legacy/v1 unsent fallback may clear only on the separately guaranteed `CHECKOUT_RELOAD_REQUIRED` response.

Review-fix checks: 30/30 locked-shipping + checkout tests pass (`/tmp/luvlae-s3b-reviewfix.log`), including lost Customer response/unknown ID after deadline → lookup → repeated cancellation, a Customer response crossing the deadline, ownership/expiry isolation and resolve route Origin/body guards. Scoped ESLint and TypeScript pass.

## Stripe sandbox correction — 2026-11-10

A real stage attempt reached Customer ready but Stripe rejected Session creation: automatic tax cannot be combined with payment_intent_data.shipping. The new Session builder omits that duplicate shipping field; order.shippingAddress and dedicated Customer shipping remain frozen and shipping collection stays disabled. A diagnostic test-mode embedded Session with the corrected builder was accepted (automatic tax enabled, client secret present) and immediately expired unpaid; no order/DB mutation or payment was made by that diagnostic. Existing frozen requests must not be rewritten; recovery is handled separately. This proves Session creation, not a completed card payment/tax-settlement journey.

Recovery correction: explicit guest cancellation of a frozen request with the known automatic-tax/PaymentIntent-shipping conflict replays only that exact request/key/API version within23h of attempt creation. Only the specific typed HTTP400 Stripe rejection with a request ID authorizes transactional release; current fingerprint/key, no Session, held state and unpaid ownership are rechecked. Frozen requests are not rewritten and ordinary resume keeps its previous semantics. Unknown results, changed requests or aged keys remain reserved for reconciliation. Repeat confirmed cancellation is idempotent. Local full regression214/214; independent checkout/shipping review33/33 PASS. Stage deployment has not yet been performed for this fix.
