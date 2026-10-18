# Commerce server foundation

Implemented 2026-10-18. The storefront now uses runtime offers, a persistent browser cart, and a temporary mock paid checkout (see below). These same-origin Route Handlers run inside `apps/web`.

## Database and operations

- Official MongoDB driver 6.21.0, request-scoped clients for Workers, explicit multi-document transactions.
- `src/_app/commerce/` owns commerce models, access functions and orchestration. `shared/lib/mongodb` owns connections and transaction infrastructure. All privileged modules use `server-only`.
- `001-commerce` creates strict BSON validators and named indexes for `products`, `orders`, `checkoutAttempts`, `paymentEvents`, `paymentTransactions`, `adminUsers`, `adminSessions`, `auditLog`, and distributed `loginLimits`.
- `_migrations` records successfully applied versions; `_migrationLocks` serializes migration execution. Reruns resume partial schema creation and skip completed migrations. Do not edit a migration after successful application to a shared environment; add a new migration. An interrupted process can leave a lock: inspect the migration before removing that lock manually.
- No startup/request-time index creation, product seeds, invented selling prices, or default stock. An administrator supplies SKU, price and stock through the API.
- Local `.env.local`/`.env` are loaded by the CLI. Worker secrets are configured separately per environment. `NEXT_MONGODB_USERNAME/PASSWORD` are authoritative. A legacy credential-bearing `NEXT_MONGODB_URI` is normalized in memory by stripping its embedded credentials; prefer a credential-free URI.
- Migration credentials need `createCollection`, `createIndex`, and `collMod` on the target database plus access to the migration metadata collections. Use a separate migration principal; the runtime principal does not need schema-management permissions. Configure least-privilege insert/find access to the financial/audit journals; their append-only API is not protection against privileged database access.
- Financial/order data has no TTL. TTL is used only for sessions/login-rate buckets. Session expiry is checked on each request independently of TTL cleanup.

Run from `apps/web`, with Node >=22 and pnpm 9.15.0:

```sh
DB_CONFIRM_NAME=<exact-target-database> pnpm db:migrate
DB_CONFIRM_NAME=<exact-target-database> pnpm db:check
DB_CONFIRM_NAME=<exact-target-database> pnpm db:admin:create
DB_CONFIRM_NAME=<exact-target-database> pnpm db:admin:reset-password
pnpm test:server
```

Supply `ADMIN_EMAIL` and `ADMIN_PASSWORD` through a local untracked environment or secret runner, not command arguments or committed files. Creation/reset require a password of 15–256 characters. Credentials are validated before connecting to MongoDB; missing/invalid email and missing/short/long password have separate error codes (`ADMIN_EMAIL_REQUIRED`, `INVALID_ADMIN_EMAIL`, `ADMIN_PASSWORD_REQUIRED`, `ADMIN_PASSWORD_TOO_SHORT`, `ADMIN_PASSWORD_TOO_LONG`). Values are never printed. Reset increments session version and revokes all existing sessions. `db:check` verifies a real write rollback in an aborted transaction using `_databaseProbes`, not merely a ping. Stage/production databases and users must be separate. Migrations are deliberately not part of web builds or automatic deployment.

## Protocol and authentication

- Success: `{ "data": ... }`. Failure: `{ "error": { "code": "...", "message": "..." } }`.
- All API responses: `Cache-Control: no-store`, `X-Robots-Tag: noindex`.
- JSON mutations require `Content-Type: application/json`; body size is limited to 16 KiB. Schemas reject unknown fields.
- Browser mutations, including login and quote, require an `Origin` matching the request URL origin. No cross-origin access is enabled.
- Login returns an `HttpOnly`, `SameSite=Strict` cookie, `Secure` on HTTPS; localhost HTTP can be used for development. Cookie path is `/api/admin`; lifetime is eight hours, no sliding renewal. Admin endpoints authorize every request against session expiration/revocation and active user/session version. Missing cookies are rejected before connecting to MongoDB.
- Passwords use salted PBKDF2-SHA256 with 600,000 iterations, checked in workerd. Unknown accounts run the same KDF. MongoDB-backed fixed-window login limits: ten attempts per normalized email per 15 minutes, 100 globally per minute. Production should add edge rate limiting before database/KDF work; these limits can reject traffic at a shared window boundary and are an initial operational policy.
- List endpoints use `limit` (1–100, default 25), opaque `cursor`, and return `{ items, nextCursor }`. Cursors combine time and ObjectId to handle timestamp ties.
- Product/order mutations require `version` and UUID `operationId`. A replay with the same actor, target and request returns `{id,replayed:true}` without another mutation; reuse with different contents returns `409 IDEMPOTENCY_CONFLICT`. Replays return the entity reference, not a stale snapshot. Concurrent identical requests can initially receive `409 CONFLICT`; retry the same operation ID.

## Implemented endpoints

| Method | Path | Access / behavior |
| --- | --- | --- |
| GET | `/api/products/:sku` | Public offer; disabled/missing products return 404 |
| POST | `/api/checkout/quote` | Server-calculated item subtotal and product versions; no reservation |
| GET | `/api/orders/:id/status` | `Authorization: Bearer <guest-token>`; minimal status, no contact/address |
| POST | `/api/admin/auth/login` | `{email,password}`; sets session cookie |
| POST | `/api/admin/auth/logout` | Authorized session; revoke and clear cookie |
| GET | `/api/admin/auth/me` | Administrator ID/email |
| GET | `/api/admin/products` | Products with stock/reserved/available quantities |
| POST | `/api/admin/products` | Create an offer; SKU becomes stable |
| GET | `/api/admin/products/:sku` | Product details |
| PATCH | `/api/admin/products/:sku` | Versioned product/price/stock/sales update |
| GET | `/api/admin/orders` | Filters: `orderStatus`, `paymentStatus`, `fulfillmentStatus` |
| GET | `/api/admin/orders/:id` | Order snapshot, customer/address and fulfillment |
| PATCH | `/api/admin/orders/:id/fulfillment` | Validated processing → shipped → delivered transitions |
| POST | `/api/admin/orders/:id/cancel` | Explicit cancellation; does not refund or restock |
| POST | `/api/admin/orders/:id/restock` | Explicit eligible restocking, bounded by purchased quantity |
| GET | `/api/admin/transactions` | Financial history; filters: `orderId`, `type`, `status` |

All `/api/admin/**` endpoints except login require authentication. SKU syntax: 1–64 uppercase letters, numbers, underscores or hyphens, starting with a letter/number. IDs are 24 lowercase hex characters.

Create product body (values are synthetic examples, not approved commercial settings):

```json
{
  "sku": "TEST-SKU",
  "name": "Example product",
  "shortDescription": "",
  "unitAmount": 2500,
  "stockQuantity": 10,
  "salesEnabled": false,
  "operationId": "00000000-0000-4000-8000-000000000001"
}
```

`unitAmount` is a positive integer in USD cents. `stockQuantity` is a nonnegative integer; sales default to disabled. Update accepts any nonempty subset of `name`, `shortDescription`, `unitAmount`, `stockQuantity`, `salesEnabled`, plus required `version`, `operationId`, and `reason`. Reserved stock is server-owned; stock cannot be reduced below reserved quantity. Available stock is derived. There is no product deletion endpoint.

Quote body: `{ "items": [{ "sku": "TEST-SKU", "quantity": 1 }] }`, up to 20 distinct SKUs, quantities 1–99. Price is read from Atlas, not trusted from the browser. Response contains item price/version snapshots and estimated pricing with `shipping`, `tax`, `total` set to `null`, and `checkoutReady:false`. Unknown charges are not represented as zero. A quote does not hold inventory.

Fulfillment body: `{version,operationId,status,carrier?,trackingNumber?}`. Carrier/tracking are required only for `shipped`. Only paid, open, fully addressed, undisputed orders without reconciliation holds can advance. Partially refunded orders remain blocked until a separate review flow exists. Shipping appends one pending outbox job atomically; no email sender is implemented.

Cancellation body: `{version,operationId,reason}`. Active/processing payments must be reconciled first. Already shipped fulfillment is preserved. Restock body: `{version,operationId,reason,returnedAndSellable,items:[{sku,quantity}]}`. Paid unshipped orders must first be cancelled; shipped goods require confirmation of a sellable return. Cumulative restocks cannot exceed purchased quantities. Repeating the same operation cannot increase stock twice.

Guest tokens are 32 random bytes encoded as base64url; the DB stores only their hash and expiry. Invalid/expired tokens and missing orders all return 404. IDs/order numbers grant no access. No token is accepted in a query string.

## Financial transactions and checkout boundary

`paymentTransactions` stores immutable financial observations for payment, refund and dispute operations, including pending/succeeded/failed/cancelled outcomes, amount/currency, provider IDs, event ID, order/attempt IDs, environment and timestamps. New outcomes are new records, never edits to a successful record. Do not sum every observation as revenue: several observations may describe one provider operation. This is a transaction history, not a double-entry accounting system or a complete Stripe balance/fee/payout ledger.

`appendPaymentTransaction` checks order/attempt/event association, environment and idempotency, and requires a caller-supplied MongoDB session. A future verified provider processor must call it in the same transaction as order/inventory updates and event completion. There is no browser or admin API to invent financial facts, edit transactions or delete history. Failed Checkout creation attempts also belong to `checkoutAttempts`; verified provider messages belong to `paymentEvents`. Card details and full provider payloads are not stored.

`reserveOrder` is an internal server operation that transactionally checks the confirmed product versions, reserves all items, and inserts the order, active attempt and audit. It accepts server-selected expiry/policies and guest-scoped hashes. It is not exposed as a standalone order-creation API. No stock is released merely because a timer elapsed.

The following routes are declared but deliberately unavailable:

| Method | Path | Response |
| --- | --- | --- |
| POST | `/api/checkout/session` | 503 `CHECKOUT_NOT_CONFIGURED` |
| POST | `/api/webhooks/stripe` | 503 `PAYMENTS_NOT_CONFIGURED` |

Stripe session creation, signed event ingestion, reconciliation, reservation commit/release, refunds synchronization and financial journal population from Stripe are not implemented in this stage. These routes neither create payable orders nor acknowledge unverified events. Shipping/tax policies, reservation/payment-method policy, email delivery and retention remain integration decisions. No sales are enabled by this change.

## Verification and current environment status

- Local replica-set integration tests cover validators/indexes, transaction rollback, the last-unit race, request replay, price snapshots, stock protection, payment history immutability, fulfillment/restocking, password/session checks, pagination, authorization and rate limits.
- Cloudflare Vite stage build passed. Local Workers preview reached Atlas and returned `DATABASE_NOT_READY` as expected before schema migration completion; unauthenticated admin requests return 401. PBKDF2 600,000 iterations returned 32 bytes in workerd.
- Stage Atlas migration `001-commerce` and the transaction rollback check completed successfully after the user granted `dbAdmin`. No products, administrator accounts, orders or prices were seeded. The CLI requires `DB_CONFIRM_NAME` to equal `NEXT_MONGODB_DB_NAME`; missing/mismatched confirmation now reports `DB_CONFIRMATION_REQUIRED` before opening a database connection. Operational errors show allowlisted messages without dumping provider/validation payloads.
- A deployed stage Worker, remote runtime secrets, production migration, backups/restore and live Stripe have not been verified or changed here.

## Storefront and mock checkout — 2026-10-18

- All purchase CTAs lead to `/products/berberine-patches`; the header opens the cart Drawer. `features/shopping-cart` owns its provider, runtime offer loading, quantity controls, persistence and checkout. Marketing/product HTML stays prerendered; price/availability load through the uncached product API.
- Cart storage is `luvlae-cart-v1` in localStorage (SKU/quantity only); quantities are 1–99, additionally bounded by current availability. Quotes are rechecked before order creation. Changed offer versions/prices require another explicit checkout click. An uncertain creation response retains the exact request in sessionStorage and disables edits until retried; the replay bypasses a new quote, so consuming the last unit does not prevent recovering a committed order.
- `POST /api/checkout/mock`: `{operationId,guestToken,items:[{sku,quantity,productVersion}]}`. Token: 32 random bytes, base64url (43 chars); operation ID: UUID. Same-origin JSON only. `MOCK_CHECKOUT_ENABLED=true` is required on the server; disabled mode returns 503. Cloudflare stage sets true, production false; local development uses an untracked `.env.local` setting.
- One transaction checks every product/version/stock, decrements unreserved stock directly, inserts an open order marked `paid`, an inactive succeeded attempt with committed stock, and an `order.mock-paid` audit entry. No outstanding reservation or payment call is created. The amount equals the BE subtotal; shipping/tax are zero under explicitly mock-only policies. Sample customer/address are server-owned constants. No emails are sent.
- Response: `{data:{id,replayed}}`; 201 for creation, 200 for replay. Idempotency is scoped to the guest token and operation ID; changed contents return 409. Orders carry `checkoutMode:mock` and `TEST-LV-…` numbers in manager API responses. There are no invented Stripe events or financial journal entries. Existing orders default to `stripe` when reading mode.
- `/order/:id` is noindex and excluded from sitemap. The client reads the guest token from sessionStorage and loads the protected status API, which now includes item names/quantities/price snapshots, pricing and checkout mode, without contact/address. The token never appears in URLs. Confirmation works after reload in the same browser session. Successful checkout removes purchased quantities.
- `002-mock-order-mode` is an additive schema migration applied by `db:migrate`. `003-test-berberine-product` is an explicit data migration invoked by `db:seed:test` with the existing exact database confirmation guard and mock-mode switch. It inserts `LUVLAE-BERBERINE-60`, 60 patches per box, **synthetic $29.99**, initial stock **100**, sales enabled. It never overwrites an existing product and never replenishes stock on rerun. These are test settings, not verified retail terms.

```sh
# apps/web, Node 22+, stage/test database only
DB_CONFIRM_NAME=<exact-stage-database> pnpm db:migrate
MOCK_CHECKOUT_ENABLED=true DB_CONFIRM_NAME=<exact-stage-database> pnpm db:seed:test
```

Verified locally against configured stage Atlas: migrations 002/003 applied; runtime offer loaded; browser checkout created one TEST-LV order with mock contacts, paid status and one consumed unit. Desktop and 390px Drawer, cart quantity/subtotal, persistence/removal, and protected confirmation were checked. Stripe routes remain unavailable; replacing the mock requires real payment reconciliation and inventory lifecycle integration, not merely changing the button endpoint.
