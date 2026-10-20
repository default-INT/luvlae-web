# Stripe sandbox webhook and local testing

Updated 2026-10-19. The storefront now creates embedded Checkout Sessions when enabled.
Delivery and tax are included in the item price; no separate surcharge is added. Cards and US shipping
address collection are enabled; the payable Session/reservation lasts 24 hours.
See [the integration plan](../../../.gpt-context/stripe-checkout-integration.md) and
[live configuration/readiness](stripe-live-readiness.md). Refund/dispute application workflows and scheduled
reconciliation remain separate work. The guarded operator reconciliation command is available.

## Dependencies and local workflow

The app installs `stripe` (server SDK, with its own TypeScript types) and `@stripe/cli` (development only).
Use Node >=22 and run these commands from the repository root:

```sh
pnpm --filter @luvlae/web stripe:version
pnpm --filter @luvlae/web stripe:listen http://localhost:3002/api/webhooks/stripe
```

The listener reads `STRIPE_SECRET_KEY=sk_test_…` from the app's ignored `.env.local` / `.env` using Next's
loading order. It authenticates through `STRIPE_API_KEY`, so browser login is unnecessary when a valid
sandbox key is already configured. It obtains the CLI signing secret and writes only
`STRIPE_WEBHOOK_SECRET` to ignored `apps/web/.env.local`, preserving other entries. Secret output is redacted.
Only localhost forwarding URLs are allowed. Without a URL, the listener defaults to port 3000.

Start or restart the app **after** the listener saves the signing secret. In another terminal:

```sh
pnpm --filter @luvlae/web dev --port 3002
```

In a third terminal, generate a standard Stripe sandbox fixture:

```sh
pnpm --filter @luvlae/web stripe:trigger
```

The listener should report `POST /api/webhooks/stripe [200]`. A standard fixture has no Luvlae
order association and is deliberately acknowledged as ignored. It verifies real delivery, signature
verification, Stripe API retrieval and MongoDB event persistence; it does **not** prove a customer order
was paid. It creates synthetic product/price/payment objects in the connected Stripe sandbox.

For direct CLI access use `pnpm --filter @luvlae/web exec stripe …`.
The wrapper supports only `listen [URL]`, `trigger` and `version`. Leave the listener running during testing;
Ctrl+C stops it. Do not run competing listeners for the same sandbox during this check.

Local signing secrets come from `stripe listen`; the stage signing secret comes from the separately
registered stage endpoint. They are different. Never replace the Cloudflare stage secret with the CLI secret.
The sandbox API key is server-only and is never a publishable browser key.

## Endpoint and Session contract

`POST /api/webhooks/stripe` accepts **snapshot** Checkout events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`

The endpoint checks the raw body with Stripe's async Web Crypto verifier, a 300-second signature tolerance,
and a 256 KiB body limit before opening MongoDB. Only events matching the configured mode, without a Connect account, are accepted.
The SDK uses Fetch for compatibility with Workers. Both Stripe secrets and the commerce database migration
are required. Configured test/live mode is enforced; live also requires production build/runtime markers.
Checkout creation is available with valid keys unless STRIPE_CHEKOUT_DISABLED=true. See the live runbook for activation inputs.

The Session creator persists these values before a webhook can settle a payment:

- `checkoutAttempts.stripeSessionId`, associated with a real held reservation and order.
- Session `metadata.orderId`, `metadata.attemptId`, and `client_reference_id=orderId`.
- `quoteSnapshot.pricing.state='final'`, with exact integer USD subtotal, discount, shipping, tax and total.
  The webhook requires these totals and the successful PaymentIntent's amount/currency to match.
- Session mode `payment`, USD currency, and the customer's name/email plus US shipping address
  (`collected_information.shipping_details` in the installed SDK). Missing contact/address data on a paid
  order sets `payment.reconciliationRequired`, blocking automatic fulfillment.

The approved current policy is shipping/tax included, so shipping=0, tax=0, discount=0, total=subtotal.
The finalized server quote is stored before creating the Session; the webhook never adopts arbitrary
Stripe totals as the expected quote. The 24-hour deadline is preserved across retries.

The handler retrieves the latest Session with expanded PaymentIntent **outside** the MongoDB transaction.
A completed but unpaid Session holds stock and sets payment to processing. Verified payment consumes held
stock once. Expiry releases stock; async failure releases it only when the current PaymentIntent confirms
failure/cancellation. A late payment after a released reservation is recorded as paid with reconciliation
required, without consuming another buyer's stock. Fulfillment remains blocked in that state.

Implementation follows explicit stages in `stripe-webhook.server.ts`: load/validate association, plan the transition,
apply it, complete the event. `stripe-checkout-policy.server.ts` owns pure validation rules and transition tables;
`stripe-checkout-persistence.server.ts` applies the plan sequentially within the transaction.

Order, attempt, stock, append-only payment observation and event completion commit atomically.
Repeated deliveries and distinct success events for an already settled attempt do not consume stock twice.
Terminal state does not regress on stale events. A payment for another attempt on an already settled order
returns a reconciliation error for investigation rather than being acknowledged as a duplicate. No return URL can mark an order paid.
Unsupported events and Sessions without Luvlae metadata/association are stored as ignored.
A Session carrying Luvlae metadata but lacking its persisted association returns 503 for retry.

Responses use the existing `{data:…}` / `{error:{code,message}}` API envelope with `Cache-Control: no-store`:

- 200: processed, replayed or ignored.
- 400: missing/invalid/stale signature, invalid event or wrong environment.
- 413: oversized body.
- 409: association, amount or inventory mismatch; investigate and resend after repair.
- 503: incomplete configuration, unavailable database or Session association not ready.
- 500: unexpected provider/processing failure; retry delivery.

The inbox stores identifiers, status and safe error codes, never full Stripe payloads. Processing failures
remain retryable and return non-2xx; Stripe delivery retries provide recovery. `nextAttemptAt` is diagnostic
state: no background inbox worker/reconciler is installed yet. The local CLI does not replace durable
stage retries; trigger another fixture or resend a failed sandbox event after fixing local problems.
Refund/dispute events are ignored until their dedicated implementation; do not subscribe to them yet.

## Verification

`pnpm --filter @luvlae/web test:server` runs synthetic MongoDB replica-set tests without Stripe network calls.
They cover raw signatures/tampering/staleness/body limits/live rejection, concurrent replay, distinct success
events, held async reservations, expiry/failure, amount mismatch rollback and retry, late payment
reconciliation, unrelated fixtures and provider failures.

On 2026-10-19, CLI 1.54.0 authenticated using the existing local sandbox key and forwarded a real
`checkout.session.completed` fixture to the Next.js server on port 3002 with HTTP 200. Order settlement
was verified with synthetic integration tests; a full embedded checkout sandbox purchase subsequently passed (see verification below).

Official references: [local testing and signatures](https://docs.stripe.com/webhooks),
[CLI installation](https://github.com/stripe/stripe-cli), [server SDK](https://github.com/stripe/stripe-node).


## Embedded purchase verification — 2026-10-19

A Chrome purchase from the actual CartDrawer created an embedded Session with the real sandbox account,
collected a synthetic name/email/US address and used Stripe's official test card. The delivered completed
webhook returned 200. Protected order SSR showed paid and Cart 0. Atlas inspection confirmed amount 999 cents,
committed reservation, one financial observation, customer/address present and reconciliationRequired=false.
These are sandbox facts; no live charge, remote deployment or live endpoint was verified.

A second Session using the final English/card-only configuration displayed an insufficient-funds decline,
kept the cart/reservation and then completed Stripe's test 3DS challenge successfully on the same Session.
The Embedded Checkout layout was also checked at 390px without horizontal overflow.

An unpaid final-configuration Session was explicitly expired in the sandbox. The real expired event returned 200;
Atlas confirmed payment expired, reservation released and no financial entry. The page showed expiration and
unlocked the retained cart. Migration 004 request snapshots were present on both final-configuration attempts.
