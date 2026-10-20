# Commerce database model

Date: 2026-10-18. Status: server foundation implemented; the full payment lifecycle below remains the target design. Stage migration `001-commerce` and the transaction rollback check are verified after `dbAdmin` was granted. See [implementation and API runbook](../apps/web/docs/commerce-api.md).

## Requirements and scope

Confirmed requirements: USA/USD sales, MongoDB Atlas, an existing Stripe account, manual order processing/shipping by a manager, admin product editing and stock management, rejection of checkout when requested quantity exceeds available stock, admin email/password authentication without email verification, and a cart/checkout/payment flow. See [commerce-plan.md](commerce-plan.md).

Proposed MVP assumptions: one SKU initially, guest checkout, one shipment per order, one admin permission level, browser-persisted cart, Stripe-hosted Checkout, and refunds initiated in Stripe Dashboard. These assumptions are not additional confirmed user requirements.

Use the same schema in separate stage and production databases. Local development targets stage. Do not mix environments using a document-level environment flag. Stripe `livemode` is still validated against the application environment.

## Conventions

- Internal IDs and references: BSON `ObjectId`; externally expose strings deliberately through API DTOs.
- Timestamps: BSON `Date`, interpreted as UTC; optional dates are omitted until known.
- Money: non-negative integer cents within JavaScript's safe integer range, validated on every calculation; currency is `USD`. Do not use floating-point dollar values.
- Mutable aggregate roots use `version` for compare-and-set updates; documents use `schemaVersion` for future migrations.
- Normalize admin emails for identity matching, without provider-specific dot/plus rewriting. Customer email is contact data, not a unique identity.
- Product references link to current catalog data; order item snapshots preserve historical commercial facts.
- Database validators enforce required fields, BSON types, enums, numeric bounds, and array limits. Application code enforces transitions, authorization, monetary arithmetic, and cross-document relationships. MongoDB references are not foreign-key constraints.
- No hard deletion of products referenced by orders; pause sales instead. No automatic deletion of orders or payment records before a retention policy is agreed.

## Collections

### 1. `products`

Owns the current sellable offer and editable product details, separate from Amazon pricing. Proposed editable fields: name, short description, price, stock quantity, and sales enabled flag. Existing long-form marketing translations remain outside this model.

| Field | Type / meaning |
| --- | --- |
| `_id`, `schemaVersion` | Internal identity and schema version |
| `sku` | Stable unique SKU; final value still to be selected |
| `name` | Display name used when creating order snapshots |
| `shortDescription` | Admin-editable product summary; published copy follows the product evidence rules |
| `price` | `{ currency: 'USD', unitAmount: integer }` |
| `inventory` | `{ stockQuantity: integer, reservedQuantity: integer }`; available quantity is derived as `stockQuantity - reservedQuantity` |
| `salesEnabled` | Boolean controlling whether new checkouts are allowed |
| `version` | Increment on price/availability changes |
| `createdAt`, `updatedAt`, `updatedBy` | Dates and admin reference for the last update |

Indexes: unique `{ sku: 1 }`. Stock quantities are non-negative integers; require `reservedQuantity <= stockQuantity`. `stockQuantity` means unsold stock, including units held for unpaid checkouts; paid units are deducted even before shipment. Show the manager stock, reserved, and available quantities separately. Available quantity is computed, not independently editable.

Admin changes to stock must preserve existing reservations; reject a new stock quantity below `reservedQuantity`. Managers never directly edit `reservedQuantity`: checkout/payment operations own it. SKU is stable once referenced by orders. Product edits do not rewrite existing order snapshots. Record product edits and inventory adjustments with before/after values, actor, reason, and operation ID. Product changes must reach the runtime purchase UI without a deployment; the broader marketing content workflow remains separate.

Disabling sales blocks new sessions; revoking existing sessions requires an explicit operation.

### 2. `orders`

The main aggregate, sufficient for the manager's order detail view without reading the current catalog.

| Field | Type / meaning |
| --- | --- |
| `_id`, `schemaVersion`, `version` | Identity and versions |
| `orderNumber` | Unique public reference, e.g. random `LV-...`; not an authorization secret or a guaranteed sequence |
| `creationKeyHash`, `creationRequestHash` | Server-derived guest-scoped idempotency key hash and request fingerprint |
| `guestAccess` | `{ tokenHash, expiresAt }`; hash of an opaque random capability, never the raw token |
| `items[]` | `{ productId, sku, name, quantity, unitAmount, lineSubtotal, productVersion }` |
| `currency` | `USD` |
| `pricing` | `{ state: 'estimated' \| 'final', subtotal, discount, shipping, tax, total }`; unknown shipping/tax/total are `null`, not zero |
| `pricingPolicy` | Shipping/tax/discount policy identifiers and versions used for this order |
| `customer` | Optional before Checkout collection: `{ email, name, phone? }`; phone only if needed for shipping |
| `shippingAddress` | Optional before collection: `{ recipientName, line1, line2?, city, state, postalCode, country: 'US' }` |
| `orderStatus` | `open`, `completed`, `cancelled` |
| `payment` | `{ status, activeAttemptId?, settledAttemptId?, amountPaid, amountRefunded, paidAt?, disputed, reconciliationRequired }` |
| `fulfillment` | `{ status, carrier?, trackingNumber?, processingAt?, shippedAt?, deliveredAt? }` |
| `cancellation` | Optional `{ reason, cancelledAt, cancelledBy }` |
| `notifications[]` | Small bounded outbox of logical confirmation/manager/shipping notifications |
| `createdAt`, `updatedAt`, `completedAt?` | Lifecycle timestamps |

`payment.status`: `pending`, `processing`, `paid`, `failed`, `expired`, `partially_refunded`, `refunded`.

`fulfillment.status`: `unfulfilled`, `processing`, `shipped`, `delivered`, `cancelled`.

Rules:

- `subtotal = sum(quantity * unitAmount)`; `lineSubtotal = quantity * unitAmount`; final `total = subtotal - discount + shipping + tax`. Discounts cannot exceed subtotal in the MVP model.
- Freeze item quantities/prices when creating an attempt. If Stripe calculates shipping/tax, store the initial estimate separately from the finalized provider breakdown; validate it against server-selected policies before accepting the final total. Persist final totals once confirmed. Do not compare a provider-calculated total to an unknown estimate as though both were final.
- Final paid amounts cannot be edited by a manager. If an unpaid cart changes, create a new checkout flow after expiring/reconciling any existing active session.
- Snapshot the recipient/address from the verified provider data before an order is ready for fulfillment. Collect any later address correction through an explicit audited action.
- `activeAttemptId` is the current payment reservation; `settledAttemptId` identifies the successful payment. A late success from another attempt is flagged for reconciliation rather than replacing the settled payment or shipping twice.
- `failed` describes a terminal attempt result, not an individual declined card interaction while a Checkout Session is still usable.
- `completed` means delivered under the manual workflow. Cancelling an order never implies that a refund succeeded. Preserve actual shipment state when a shipped order is cancelled/refunded.
- Fulfillment requires confirmed payment, complete shipping data, an open order, and no reconciliation/dispute hold. Block fully refunded orders; partially refunded orders require explicit manager review before fulfillment.
- Bounded outbox entries include a stable `key`, `type`, `status`, `attempts`, `nextAttemptAt`, `leaseUntil?`, `leaseToken?`, `providerMessageId?`, `sentAt?`, and a sanitized `lastErrorCode?`. Atomically add logical jobs with the corresponding order transition. Retry by updating the same entry, not appending attempts. Repeated shipment corrections do not append unlimited jobs.

Initial indexes:

- Unique `{ orderNumber: 1 }` and `{ creationKeyHash: 1 }`.
- `{ createdAt: -1, _id: -1 }` for cursor pagination.
- `{ orderStatus: 1, createdAt: -1, _id: -1 }` and `{ 'payment.status': 1, 'fulfillment.status': 1, createdAt: -1, _id: -1 }` for the initial admin queues. Validate actual query plans before adding more indexes.
- Add an outbox scheduling index based on the finalized claim query, using `$elemMatch` for fields from the same array element.

Do not index customer data unless a concrete admin search requirement needs it. Guest lookup uses `_id` plus token verification; an order number alone grants no access.

### 3. `checkoutAttempts`

Separates recoverable Stripe-session creation and retries from the business order. One order may have historical attempts, but at most one active attempt.

Fields: `_id`, `schemaVersion`, `orderId`, `requestKeyHash`, `requestHash`, `stripeIdempotencyKey`, `state`, `active`, `quoteSnapshot`, `inventoryReservation`, `stripeSessionId?`, `stripePaymentIntentId?`, `livemode`, `expiresAt?`, `lastReconciledAt?`, `lastErrorCode?`, `createdAt`, `updatedAt`.

- `state`: `creating`, `open`, `processing`, `succeeded`, `failed`, `expired`, `cancelled`.
- `quoteSnapshot`: items/currency/price versions, known amounts, and approved shipping/tax policy versions. Persist before calling Stripe; retries reuse exactly the same creation parameters.
- `inventoryReservation`: `{ state: 'held' | 'committed' | 'released', items: [{ productId, quantity }], expiresAt, committedAt?, releasedAt? }`. One reservation belongs to one attempt; retries reuse it. The deadline is a reconciliation trigger, not permission to release stock while payment may still complete. Do not TTL-delete reservations.
- Keep `active: true` during ambiguous timeouts, asynchronous payment processing, and a usable session after a card decline. Release it only after provider reconciliation proves the attempt is terminal. Cancellation must expire the provider session or flag unresolved processing.
- A timeout is not evidence of failure. Never blindly reuse an old attempt's idempotency key outside the provider's retention window; reconcile the provider state and flag unresolved cases for review before allowing a replacement charge.

Indexes:

- Unique `{ requestKeyHash: 1 }`; unique `{ stripeIdempotencyKey: 1 }`.
- Unique `{ orderId: 1 }` with `partialFilterExpression: { active: true }` to enforce one active attempt per order.
- Unique `{ stripeSessionId: 1 }` and `{ stripePaymentIntentId: 1 }`, each filtered to documents where that field has BSON type `string`. Omit unknown IDs rather than writing empty strings.
- `{ orderId: 1, createdAt: -1 }` for history; `{ active: 1, updatedAt: 1 }` for reconciliation.

Do not TTL-delete expired attempts: they remain useful for late payment reconciliation and support.

### 4. `paymentEvents`

A durable webhook inbox and processing ledger, not a collection of full Stripe payloads.

Fields: `_id`, `schemaVersion`, `provider: 'stripe'`, `eventId`, `eventType`, `providerObjectId`, `livemode`, optional `orderId`/`attemptId`, `providerCreatedAt`, `receivedAt`, `status`, `processingAttempts`, `nextAttemptAt`, `leaseUntil?`, `leaseToken?`, `processedAt?`, `lastErrorCode?`.

- `status`: `pending`, `processing`, `processed`, `ignored`, `failed`.
- Verify the signature and environment before inserting. Retain only the identifiers and sanitized data needed to retrieve/reconcile the event. Acknowledge receipt only after durable storage or completed processing.
- Existing event ID means resume/check processing, not automatically skip it. Workers claim a renewable lease; crashed workers can be retried after lease expiry.
- Do not use event timestamp as an ordering guarantee. Different event IDs about the same payment must not create duplicate business transitions or notifications.

Indexes: unique `{ provider: 1, eventId: 1 }`; `{ status: 1, nextAttemptAt: 1 }`; `{ status: 1, leaseUntil: 1 }`; `{ orderId: 1, receivedAt: -1 }`.

No initial TTL: determine retention for deduplication/replay and data minimization before introducing cleanup.

### 5. `adminUsers`

Fields: `_id`, `schemaVersion`, `email`, `emailNormalized`, `passwordHash`, `status: 'active' | 'disabled'`, `sessionVersion`, `passwordChangedAt`, `lastLoginAt?`, `createdAt`, `updatedAt`.

- Unique index `{ emailNormalized: 1 }`.
- Password hash includes algorithm/parameters/salt; no plaintext password or email-verification fields. No role matrix for the initial single permission level.
- Operational account creation/reset only. Increment `sessionVersion` on password reset or global logout. Login verifies active status; existing sessions also verify status/version.
- Distributed login throttling must be implemented separately; a browser-local counter is insufficient.

### 6. `adminSessions`

Fields: `_id`, `schemaVersion`, `adminUserId`, `tokenHash`, `sessionVersion`, `createdAt`, `expiresAt`, `revokedAt?`.

Indexes: unique `{ tokenHash: 1 }`; `{ adminUserId: 1 }`; TTL `{ expiresAt: 1 }` with `expireAfterSeconds: 0`.

The raw random session token exists only in the secure cookie. Check expiration/revocation and user status/session version on every authorized request; TTL deletion is asynchronous and is not an authorization mechanism. Never TTL-index an entire order based on the guest token's expiration.

### 7. `auditLog`

Fields: `_id`, `schemaVersion`, `operationId`, `actor: { type: 'admin' | 'system' | 'stripe', id? }`, `entityType`, `entityId`, `action`, `changes`, `reason?`, `createdAt`.

Store allowlisted before/after fields for product details, price, stock adjustments, reservations, statuses, and tracking changes. Do not store password hashes, tokens, full customer records, raw request bodies, or full provider payloads. Avoid an unbounded history array in every order.

Indexes: unique `{ operationId: 1 }` for one audit record per logical mutation; `{ entityType: 1, entityId: 1, createdAt: -1 }`.

Write audit records in the same transaction as the corresponding admin mutation. Retention and stronger storage-level immutability, if needed, remain decisions; an application-only append policy is not tamper-proof against privileged DB access.

## Consistency and lifecycle

1. **Deduplicate order creation:** look up the unique guest-scoped creation key. A retry with identical contents returns the existing order; a different request fingerprint with the same key is rejected. For a new request, proceed to the atomic stock reservation and order creation below.
2. **Reserve stock and payment:** before committing a new payable order/attempt, transactionally verify every SKU is enabled and `stockQuantity - reservedQuantity >= requestedQuantity`, increment reserved quantities conditionally, create the order if needed, insert the active attempt with a held reservation, and set `orders.payment.activeAttemptId`. Roll back all changes if any item is insufficient; return an out-of-stock response without creating a payable order or Stripe Session. The cart and initial quote do not reserve stock. The partial unique index provides an additional guard against races. Step 1's creation-key lookup remains the deduplication entry point; order creation commits only with this reservation.
3. **Call Stripe outside the transaction:** persist the response with compare-and-set, accounting for a webhook arriving first. Timeouts leave a recoverable attempt. Never hold a DB transaction open during a network call.
4. **Receive event:** durably store the verified event. Process synchronously or with a worker that can resume leased work.
5. **Apply provider state:** retrieve provider state outside the transaction as needed; transactionally validate the attempt/order version and allowed transition, update attempt and order, commit the held reservation by decreasing both `stockQuantity` and `reservedQuantity`, add bounded outbox jobs and audit entry, and mark the inbox event processed. Consume stock only on the first accepted successful payment. Retry database conflicts; re-evaluate provider state when stale. Never allow stale transitions to erase settled/refunded state.
6. **Manager action:** authorize, check version and allowed transition, update order/product and append audit in one transaction. Require complete shipping details before shipment.
7. **Deliver email outside the transaction:** claim/update the embedded outbox using atomic conditions and lease tokens. Use stable provider idempotency keys where supported; exactly-once delivery cannot be assumed across MongoDB and an external email service.

### Reservation release and restocking

- A failed Session creation can release its reservation only after it is known no usable provider session/payment exists. Ambiguous timeouts keep stock held until reconciliation.
- For cancellation/expiration, first expire or reconcile the Stripe Session outside the DB transaction. Release stock only after confirming there is no successful or still-processing payment. In one transaction change `held` to `released`, decrement reserved quantities, and record the transition. Duplicate events do not release twice.
- A reservation deadline schedules a recovery job. Delayed/async payment methods keep their reservations until terminal reconciliation; their maximum hold policy and supported payment methods must be selected before launch. Do not arbitrarily free stock on a timer while a payment can still succeed.
- If an exceptional payment arrives after release, place the order on reconciliation hold; do not deduct unavailable stock or fulfill automatically. A manager resolves fulfillment or refund.
- Shipping does not deduct stock again. Refunds do not automatically restock products. Paid unshipped cancellations and physically returned sellable goods use an explicit admin restock operation with an order reference, validated per-item cumulative quantities, and a unique audit operation ID. Atomically track cumulative restocked quantities on the order, increase product stock, and audit; retries cannot restock twice. Restocking shipped goods requires confirmation that goods were returned and are sellable.

MongoDB guarantees atomic writes within a single document; the cross-collection operations above require transactions. Transaction support and behavior in the selected Atlas tier/driver/Workers runtime must be validated before implementation. If it fails, revise the model explicitly rather than silently omitting consistency guarantees.

## Intentionally omitted from the MVP

- `carts`: browser SKU/quantity storage is sufficient; the server recalculates authoritative amounts.
- `customers`: guest contact/address snapshots belong to orders. Do not create customer accounts implicitly from email.
- Separate order items, addresses, or shipments collections: bounded data is embedded and read together. Split shipments/returns or customer accounts can be added once required.
- A mutable `payments` collection is omitted. The user explicitly requested financial transaction history; `paymentTransactions` is now implemented as a separate immutable observation journal (see below).
- Full marketing CMS and translated page content in Atlas: admin edits the product's offer fields and short description; existing long-form marketing content remains in the current authoring system.

## Implementation acceptance checks

Run migrations explicitly to create validators and named indexes; do not create indexes on every request. Verify duplicate email/SKU/session/event/key rejection, single active attempt under concurrency, expired-session rejection before TTL cleanup, atomic audit/order/outbox writes, late and duplicate provider events, price snapshots after catalog changes, unknown tax/shipping handling, and synthetic-only stage data. Validate backups/restoration and permissions independently of schema tests.

Also validate concurrent buyers competing for the last unit, insufficient quantity across multiple items, atomic rollback of reservations, duplicate reservation commit/release/restock, failed Session creation, expired sessions with delayed webhooks, async payment holds, admin stock reductions below reserved quantity, and product edits preserving historical orders.

Open decisions: initial SKU/price/stock quantity, reservation duration and supported payment-method hold policy, shipping and tax policies, notification provider, guest/admin session lifetimes, data retention, whether one shipment is sufficient, and exact supported order-search filters. Do not invent these values in production fixtures.

## References

Checked 2026-10-18:

- [MongoDB embedded data](https://www.mongodb.com/docs/manual/data-modeling/embedding/) — embedding data read/updated together.
- [MongoDB atomicity and transactions](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/) — single-document writes and transactions across documents.
- [MongoDB partial indexes](https://www.mongodb.com/docs/manual/core/index-partial/) — partial unique constraints for active attempts and known provider IDs.
- [MongoDB TTL indexes](https://www.mongodb.com/docs/manual/core/index-ttl/) — asynchronous expiration cleanup for sessions.

## Implementation update — 2026-10-18

- The user authorized database/access-layer/API implementation with frontend work deferred. Direct-sale SKU, price and stock are supplied through the admin API; no seeds/default commercial values are created.
- Added `paymentTransactions`: immutable payment/refund/dispute observations, pending/succeeded/failed/cancelled status, integer USD cents, provider object/event, order/attempt, livemode and timestamps. Unique operation and observation indexes prevent duplicate records. An internal append function validates association and requires a transaction session; there are no financial-write HTTP endpoints. This is not a double-entry ledger; fee/payout ingestion is outside the current Stripe integration scope. Actual provider ingestion is still deferred.
- `loginLimits` stores distributed fixed-window counters with TTL. Sessions last eight hours; expiry/revocation/user-version checks do not depend on TTL deletion. Password KDF: standard PBKDF2-HMAC-SHA256, 100,000 iterations, random 16-byte salt and 32-byte key, constant-time comparison. The user selected the deployed Workers cap and administrator recreation; old 600,000-iteration hashes require recreation/reset. Local workerd omits this cap, so regression tests enforce it explicitly; see [admin UI notes](admin-ui.md).
- Code-first migration `001-commerce` creates the validators and indexes. An explicit migration principal needs schema-management permissions; runtime does not create indexes. Collection creation is not an atomic migration: incomplete runs have no completed marker and can be retried after resolving errors.
- Product/order admin operations and atomic order/reservation creation are implemented. `orders.restockedQuantities` tracks cumulative per-SKU restocks. The initial notification schema is a bounded pending/sent outbox; the fuller leased/retry sender described above requires a future migration and worker.
- Sandbox Stripe Checkout webhook verification and atomic processing now commit/release reservations and append payment observations. Checkout Session creation still returns 503; scheduled reconciliation, refunds and disputes remain pending. See [Stripe runbook](../apps/web/docs/stripe-local.md).
- Stage Atlas connection and local Workers driver execution verified. The initial Atlas 8000 `collMod` permission failure was resolved after the user granted `dbAdmin`; migration and rollback check completed. No product/order/admin seed. Local replica-set tests pass. See the runbook for commands and acceptance evidence.


## Durable Stripe request snapshot — 2026-10-19

Migration 004 adds optional checkoutAttempts.stripeRequest with the server-generated Session parameters and API version.
New Stripe reservations persist that immutable request atomically with order and inventory before calling Stripe;
retries use the saved parameters/version and original idempotency key. Applied migrations 001/002 remain unchanged.
Legacy bound Sessions are retrieved; ambiguous unbound legacy attempts require operator metadata recovery and are
never recreated with guessed request defaults. See [integration plan](stripe-checkout-integration.md).
