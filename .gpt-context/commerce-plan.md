# On-site commerce plan

Date: 2026-10-18. Status: server foundation and storefront cart/mock paid checkout implemented; real Stripe integration remains pending. See [current temporary flow](commerce-ui.md). See [implementation and API runbook](../apps/web/docs/commerce-api.md).

## Confirmed by the user

- Sales in the USA, currency USD; MongoDB Atlas was previously selected for orders.
- A Stripe account already exists. Live configuration and webhook readiness have not been verified.
- A manager will process and ship orders manually; warehouse integration is not required for the first version.
- Admin area: manage orders and their statuses, edit products, and manage prices and stock quantities.
- Block checkout when requested quantity exceeds available stock; no overselling.
- Admin authentication: email and password, without email verification. Public registration has not been requested.
- Customer flow: add to cart, check out, and pay.

The current application only links to Amazon for purchases; see [architecture.md](architecture.md) and `apps/web/src/entities/product/model/product.ts`. Amazon prices and terms must not automatically become the terms for purchases on this site.

## Proposed first-version scope

| Area | Capabilities |
| --- | --- |
| Product | One SKU initially, editable product details, price in USD, stock quantity, ability to pause sales |
| Cart | Add items, change quantity, remove items, persist in the browser |
| Checkout | Guest purchase; email, name, US shipping address; total including shipping and tax |
| Payment | One-time payment through Stripe-hosted Checkout, return to a result page |
| Orders | Create before payment, confirm payment on the server, order number and protected result page |
| Admin | Sign in/out, paginated and filtered order list, order details, processing/shipping/completion, tracking number, product editing, pricing and stock adjustments |
| Notifications | Customer confirmation after payment, manager notification, shipping email; provider not yet selected |

Defer customer accounts, subscriptions, promo codes, complex roles, warehouse synchronization, and automatic shipment creation. In the first version, refunds can be issued through Stripe Dashboard and synchronized to the order; a refund interface in the admin area is optional.

## Deployment and boundaries

- Start within `apps/web`: `/cart`, `/checkout`, `/order/...`, `/admin/...`, and server Route Handlers. Separate `apps/api`/`apps/admin` applications are not needed yet; this is a proposal, not an approved topology change.
- Keep `app/**/route.ts` and `page.tsx` thin. Compose API handlers in `_app/api-routes`, pages in `_pages`, reusable business entities in `entities`, and user interactions in `features`. MongoDB/Stripe/email/auth adapters belong in focused server-only modules in `shared`; order business rules do not belong in `shared`. Keep orchestration across domains above the entity layer. See [FSD rules](fsd-rules.md).
- MongoDB Atlas is the source of truth for prices, orders, and admin accounts. Use the official `mongodb` driver for the initial validation; verify the specific versions against vinext/Workers experimentally.
- Before building the flow, verify connectivity from the stage Worker, TLS, atomic updates, required transactions, concurrent requests, timeouts, and connection lifecycle. If limitations are unacceptable, separately evaluate a Durable Object for connections or a Node.js API; do not change hosting in advance.
- Stage and production use separate databases/permissions, Stripe sandbox/live configurations, webhook secrets, and email settings. See the [QA proposal](qa-environment.md).

## Pricing and cart

- Store monetary amounts as integer cents and currency as `USD`; validate the SKU, positive integer quantity, and quantity limit on the server.
- The browser cart stores SKU and quantity. Load the displayed price from the server; the browser does not determine the amount charged. A server-side cart collection is unnecessary for the MVP.
- Admin price changes must work without deployment. Fetch the interactive purchase block's data from an uncached runtime API while keeping marketing HTML static. Disable checkout until the price loads and offer a retry on failure.
- Before creating Checkout, the server provides a quote with a price version. If the version changes, show the updated total and request customer confirmation. The created order stores an immutable price snapshot; its active Stripe session uses that snapshot until expiration.
- Atlas owns pricing; the server sends Stripe `price_data` from the order snapshot. Do not maintain a second independently editable price catalog in Stripe.
- The existing two-pack discount belongs to the Amazon campaign. Do not enable a separate on-site discount without the user's decision.
- Atlas owns stock quantities for direct sales; Amazon availability is not the source. Store `inventory.stockQuantity` and `inventory.reservedQuantity`, deriving available quantity as their difference. Reject insufficient quantities server-side. Reserve stock atomically before creating a payable order/Stripe Session, consume it once on successful payment, and release only after terminal cancellation/expiration reconciliation. See [database-model.md](database-model.md) for concurrency, delayed payments, and restocking rules.

## Order creation and payment

1. The customer opens the cart and confirms the server quote. Determine shipping and tax before charging; show the final total in Checkout before payment.
2. The server uses an idempotency key and a transaction to check/reserve available stock and save an order with item and price snapshots, then creates a linked Stripe Checkout Session outside the transaction. Insufficient stock rejects checkout without creating a payable order/session. Stripe Checkout can collect contact information and the shipping address; the server saves them to the order after payment. Only agreed US destinations are allowed.
3. Retrying a request returns the same result; bind the key to the guest session and request contents. Concurrent requests must not create two active payments for one order. Recover failures between Atlas and Stripe using the persisted attempt identifier and the same Stripe idempotency key.
4. Stripe sends a webhook. The server verifies the signature against the raw body, environment, order association, currency, expected amounts, and actual payment status. `checkout.session.completed` alone does not establish successful payment for every payment method.
5. The server atomically records payment, consumes reserved stock once, and records notification jobs. Handle duplicate and reordered events safely; older events must not roll back current state. Flag late payment on a cancelled order or after reservation release for the manager, without automatically shipping it.
6. The customer sees server-confirmed status. If the webhook has not arrived, show a pending state and refresh it; visiting the success URL does not mark the order as paid. After confirmation, clear only the purchased items/quantities from the cart.
7. The manager sees the paid order, starts processing, enters the carrier/tracking number, and marks it as shipped. Under the manual process, the manager confirms delivery completion.

Returning from Checkout via Cancel does not cancel the order: the session may remain usable. Handle session expiration and explicit cancellation on the server. Allow another payment only after checking the previous attempt and ruling out a second active charge.

## Statuses

Keep three independent states:

| Field | Proposed values | Updated by |
| --- | --- | --- |
| `orderStatus` | `open`, `completed`, `cancelled` | Server and permitted manager actions |
| `paymentStatus` | `pending`, `processing`, `paid`, `failed`, `expired`, `partially_refunded`, `refunded` | Server based on Stripe |
| `fulfillmentStatus` | `unfulfilled`, `processing`, `shipped`, `delivered`, `cancelled` | Manager through server-validated transitions |

- Do not allow processing/shipping unpaid or cancelled orders, manually setting `paid`, editing paid amounts, or arbitrarily reversing statuses.
- Cancelling a paid order and refunding it are separate operations: cancellation does not mean the money has been returned. Account for partial refunds, refund failures, and already shipped items. Flag disputed payments for manual review.
- Record status and price changes with timestamps, actor, and previous/new values. Use document versions to prevent concurrent manager updates from overwriting each other.

## Data and API

See [database-model.md](database-model.md) for the proposed fields, relationships, indexes, session handling, and transaction boundaries. This is a design proposal; no Atlas schema has been applied.

Minimum collections:

- `products`: stable SKU, editable name/short description, currency, price in cents, stock/reserved quantities, sales enabled flag, version, and timestamps.
- `orders`: internal ID and unique order number, item snapshots, subtotal/discount/shipping/tax/total, recipient details, statuses, version, tracking, action history, and payment association.
- `checkoutAttempts`: order, idempotency key, quote snapshot, Stripe Session/PaymentIntent IDs, expiration, and attempt result. Unique indexes prevent duplicate creation of the same attempt.
- `paymentEvents`: unique Stripe event ID, object ID, type, and processing state supporting retries. Recording an event before processing must not permanently block a retry after failure.
- `adminUsers`, `adminSessions`: permitted accounts, password hashes, and managed server sessions.
- `auditLog`: price/availability changes and administrative actions, without secrets or unnecessary personal data.

Email jobs can use an embedded outbox in the order, updated atomically with its state. A separate worker/cron claims jobs with a lock, retries failures, and alerts on persistent failures. A separate outbox collection requires a transaction with the order update. Notifications do not determine payment success.

Preliminary API boundaries (final contracts to be defined during design):

- `GET /api/products/:sku`, `POST /api/checkout/quote`, `POST /api/checkout/session`.
- `GET /api/orders/:id/status` — requires authorized guest-session access or a secure token; minimal response without address or email.
- `POST /api/webhooks/stripe`.
- `POST /api/admin/auth/login`, `POST /api/admin/auth/logout`.
- `GET /api/admin/orders`, `GET /api/admin/orders/:id`, `PATCH /api/admin/orders/:id/fulfillment`, `POST /api/admin/orders/:id/cancel`.
- `GET /api/admin/products`, `GET /api/admin/products/:sku`, `PATCH /api/admin/products/:sku` — view/edit product details, price, stock quantity, and sales availability with version validation and audit. Reserved quantity is server-managed; reject stock reductions below existing reservations.
- `POST /api/admin/orders/:id/restock` — explicit audited restocking for eligible cancelled/returned units, with idempotency and cumulative quantity validation; a refund alone does not restock goods.

## Authentication and operations

- Create the first administrator through an operational command; no public registration or email verification is needed. Store passwords only as strong salted hashes. Validate the chosen algorithm/library and computational cost in Workers; do not rely on unavailable native modules.
- Use revocable server sessions with expiration and rotation on login; cookies use `HttpOnly`, `Secure`, and `SameSite`. Check authorization on every admin API; a hidden link or page-only middleware is insufficient.
- Rate-limit login attempts, use the same error for an invalid email or password, and apply Origin/CSRF checks to mutations. MVP password reset is an operational procedure that revokes sessions, without public recovery.
- Card details remain in Stripe. Guest orders must not be readable using only a sequential order number; the public number is not an access secret.
- Orders/admin/payment use `no-store`, private pages use `noindex`, and secrets exist only in runtime bindings. Do not log addresses, emails, passwords, access tokens, or full Stripe payloads.
- Provide reconciliation of stuck payments with Stripe, event reprocessing, webhook/email failure monitoring, Atlas backups, and restore verification. Application rollback must not delete orders; schema changes must remain compatible.
- Emails and external deliveries may be repeated; use stable deduplication keys and provider idempotency support where available.

## Phases and acceptance criteria

1. **Clarify sales rules:** SKU/price, shipping, tax, cancellation/refunds, inventory, login method, and accounts. Deliverable: agreed scope and contracts.
2. **Validate infrastructure:** Atlas from the actual stage Worker, Stripe sandbox Session and signed webhook, password hashing and cookie sessions in Workers, environment isolation. Deliverable: confirmed compatibility before main development.
3. **Server core:** models, indexes, calculation and price versions, payment attempts, status transitions, audit, and failure recovery. Deliverable: verified amount and idempotency invariants.
4. **Admin area:** login, protected APIs, product editing, price/availability, stock adjustments/restocking, orders, processing, and tracking. Deliverable: a manager can edit a product and handle a synthetic order without database access.
5. **Customer flow:** runtime price, cart, Checkout, result page, and emails. Deliverable: a test purchase proceeds from the product page through manager shipment.
6. **QA and launch:** checks below, live secrets/webhook, shipping and sales terms on the site, controlled live validation. Enable purchasing only after validating the complete flow.

Required validation: successful/declined/3DS payments; closed browser and delayed webhook; duplicate/reordered events; invalid signature; double click; failure after Stripe Session creation; price changes in the cart and an existing session; invalid quantity/address/amount; cancellation/expiration/late payment; refunds; Atlas and email outages; denied access to another customer's order/admin APIs; order persistence across deployment; stage cannot modify production.

## Open decisions

- Direct-sale price and stock are administrator-supplied; no initial values are seeded. Quantity discounts remain undecided.
- Shipping: cost, free-shipping threshold, delivery times, carriers, coverage of states/territories/APO/PO boxes. “USA” does not yet specify the exact allowed destinations.
- Tax rules and calculation setup: determine separately; an existing Stripe account does not mean tax configuration is ready.
- Confirmed SKU/packaging and initial stock for direct sales, reservation duration, and payment-method hold policy. Stock enforcement is required. See the [product note](products/luvlae-berberine-patches.md).
- Direct-sale cancellation, returns, and seller contact information. Amazon terms do not replace the site's own policies.
- Number of administrators and account emails; email provider and sender domain; order data retention period.
- Stripe live readiness and company region have not been verified; select payment methods during integration.
- Changes to CTAs, shipping/returns copy, purchase analytics, and Product/Offer structured data require a separate review under the [SEO rules](seo-requirements.md) before enabling sales.

## Verified external sources

Checked on 2026-10-18. These sources describe provider capabilities, not an existing working integration in this project.

- [Cloudflare: MongoDB from Workers](https://developers.cloudflare.com/workers/tutorials/connect-to-mongodb-atlas/) — native driver, direct connection, and Durable Object; Hyperdrive does not support MongoDB.
- [Stripe: Checkout options](https://docs.stripe.com/payments/checkout/quickstarts) — hosted Checkout as the basis for the proposed payment interface.
- [Stripe: Session payment status](https://docs.stripe.com/api/checkout/sessions/object) — checking actual payment status.
- [Stripe: webhooks](https://docs.stripe.com/webhooks) — raw-body signature verification, retries, and no guaranteed event order.
- [Stripe: idempotent requests](https://docs.stripe.com/api/idempotent_requests) — safely retrying session creation after a network failure.

## Implementation update — 2026-10-18

The user authorized the DB/access/API stage and requested stored financial transaction history. Direct-sale prices and stock are administrator-supplied. Models, explicit migration, product/admin/order APIs, internal atomic reservation, append-only payment observation history and integration tests are implemented without UI changes. Checkout Session and Stripe webhook routes are declared but return 503; provider integration and reservation completion/release remain pending. Stage Atlas connectivity, schema migration and transaction rollback are verified after the user granted `dbAdmin`. No direct-sale price/stock or admin account was seeded.
