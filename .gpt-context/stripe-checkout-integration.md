# Embedded Stripe Checkout integration plan

Date: 2026-10-19. Status: implemented by three collaborating agents and integrated/verified locally; remote live activation remains pending.

## Confirmed requirements

- Implement now, with multiple agents. Form stays on the Luvlae website.
- Use Stripe Embedded Checkout (iframe managed by Stripe), card payments, required name/email and US shipping address.
- USD prices from Atlas include delivery throughout the USA and tax for this phase. Add no shipping/tax surcharge:
  final pricing has discount=0, shipping=0, tax=0, total=subtotal; automatic tax/discounts disabled.
  This is the user's current commercial assumption, not verified tax accounting advice or a tax exemption claim.
- A payable checkout/reservation lasts one day (24 hours). Align the stored deadline with Stripe Session expiry;
  preserve it on retries. Do not release stock solely because the local clock passed that deadline.
- Prepare both sandbox and live configuration. This task prepares live operation; it does not authorize a production
  deployment, provision live credentials, or make an actual charge. Production activation remains an explicit runtime switch.
- Refunds, disputes, emails and broader marketing/SEO changes remain separate work. Do not label unfinished operations as launch-ready.

## Target flow and fixed contracts

1. CartDrawer Checkout preserves current price/stock reconfirmation and exact-request retry logic.
2. `POST /api/checkout/session` accepts the existing pending body:
   `{operationId:UUID, guestToken:43-char-token, items:[{sku,quantity,productVersion}]}`.
   All monetary facts are server-owned. Same-origin validation and strict schema apply.
   Response envelope: `{data:{id:string,replayed:boolean}}`; 201 initial / 200 replay.
   It sets the existing per-order HttpOnly cookie, and the browser navigates to `/orders/:id/checkout`.
3. `/orders/:id/checkout` is a protected SSR/noindex/no-store page within the existing cookie path.
   Its thin route composes `getGuestCheckout(id, token)` from `_app/commerce/checkout-session.server.ts`
   with a checkout page/feature. Returns null for unauthorized/missing order. The service validates guest ownership,
   retrieves the existing Stripe Session and returns this serializable view:
   `{id, status:'open'|'complete'|'expired', paymentStatus:string, publishableKey:string,
     clientSecret:string|null, expiresAt:string}`.
   Never store clientSecret in local/session storage, URLs or logs. No new customer-secret exposure.
4. Client mounts Embedded Checkout using runtime publishableKey and clientSecret. For card-only checkout choose
   `redirect_on_completion:'never'`, and use onComplete to navigate to `/orders/:id`.
   Never interpret onComplete or a URL as paid. Returning to cart preserves its items and pending attempt;
   Checkout can resume the same session without a new reservation. Deal clearly with expired/failed sessions.
5. `/orders/:id` continues to SSR the protected order. Pending/processing gets bounded `router.refresh()` polling.
   Only a server-confirmed paid status removes the purchased quantities, once per checkout; refresh must not
   subtract them again. Do not clear the entire cart or clear it on Session creation.
6. Webhook keeps declarative validation -> transition plan -> sequential DB effects. It verifies the configured
   environment, order/attempt references, final totals and current PaymentIntent. No invented Stripe events.

## Agent assignments and file ownership

### Backend agent

Own checkout-session.server.ts and focused new checkout helpers, reservations.server.ts, checkout handler/route,
server integration tests in a NEW checkout-session.test.ts. Do not change existing commerce.test.ts.
Implement final pricing, 24h reservation, server Stripe Session creation with installed SDK's `ui_mode:'embedded_page'`,
`allowed_payment_method_types:['card']`, Link disabled, English locale, US shipping collection, name/email collection and zero extra shipping/tax.
Store session association before returning. Call Stripe outside transactions. Recover failures with the same
Stripe idempotency key and immutable request parameters; concurrent creation cannot double-reserve.
Export getGuestCheckout as specified. Preserve existing internal reserveOrder test behavior for other callers.
Fail closed when STRIPE_CHECKOUT_ENABLED is not true. Use createStripeClient/runtime mode helpers from shared Stripe.
Terminal retries must not create a second payable Session; stock release needs confirmed provider state.

### Frontend agent

Own features/shopping-cart, new checkout page/UI and `/orders/[id]/checkout/page.tsx`, order result page/UI,
entities/order client types if needed, English commerce YAML and generated dictionary, cart/UI tests.
Mount @stripe/stripe-js embedded form (root installs package); use a client component and destroy on unmount.
Keep card data inside Stripe. Preserve price reconfirmation, exact retry protection and cart quantities until paid.
Handle missing configuration, initialization errors, pending/processing, failure and expired checkout; accessible
loading/retry controls, responsive layout. Use existing SCSS and FSD conventions, no implementation/test copy.
The public service/view contract above is fixed; coordinate changes with the root/backend agent.

### Environment/webhook agent

Own shared/lib/stripe, stripe-checkout-policy.server.ts, environment gate in stripe-webhook.server.ts,
cloudflare.config.ts, .env.example, focused new mode tests and live readiness runbook.
STRIPE_MODE=test|live defaults test; STRIPE_CHECKOUT_ENABLED defaults disabled.
Runtime STRIPE_PUBLISHABLE_KEY is returned only to the owned checkout view (no NEXT_PUBLIC build key needed).
Match secret/publishable key prefixes, event/session/intent/attempt livemode to configured mode.
Live mode must require production environment; stage/local must reject live configuration. Preserve default
sandbox webhook behavior when checkout creation is disabled. Add production secret declarations and activation
instructions without uploading secrets or deploying. Describe real outstanding readiness items accurately.

### Root agent

Own this plan, cross-agent API coordination, dependency installation, integration fixes, final verification,
local sandbox smoke/browser checks where credentials permit, updates to summary context/runbooks.
Review recovery/expiry edge cases and production prerequisites; never claim real payment verification from mocks.

## Parallel work and validation

Backend and frontend proceed against the fixed DTO; environment work proceeds on separate files. All agents read
AGENTS.md and linked relevant context, preserve existing dirty changes, use named exports/declarative rules, and
avoid unrelated lint rewrites. Shared checkout DTO changes need coordination. Do not create commits or deploy.

Acceptance: meaningful server tests for duplicate/concurrent checkout, changed contents, exact quote, 24h expiry,
API failure after creation and replay, invalid mode/guest access, wrong environment, declined/3DS payment behavior;
cart tests for pending preservation and clearing only after paid; all existing server tests; TypeScript; scoped lint;
Cloudflare stage AND production builds. Browser checks: responsive embedded form and complete sandbox purchase,
webhook -> order -> inventory, with real configuration when available. Missing pk keys/live endpoint/settings
are reported as unverified setup prerequisites rather than silently fabricated.

## Sources

- https://docs.stripe.com/checkout/embedded/quickstart — embedded_page, runtime client secret, Stripe iframe.
- https://docs.stripe.com/api/checkout/sessions/create — session expiry and supported parameters.
- https://docs.stripe.com/keys — sandbox/live key isolation and publishable-key role.


## Implementation results

- Backend, frontend and environment assignments implemented. New browser library @stripe/stripe-js installed;
  installed SDKs use allowed_payment_method_types and createEmbeddedCheckoutPage (current API names).
- Migration004-stripe-request-snapshot applied to configured stage Atlas. Session request parameters and API
  version persist atomically with the reservation; provider call/retry uses that exact saved request.
- Operator stripe:reconcile validates DB_CONFIRM_NAME, repairs unambiguous bindings and replays real events.
  Bounded batches return nextCursor to avoid starving later attempts. No scheduled worker was provisioned.
- 69 server tests and 3 deployment isolation tests pass; TypeScript and scoped changed-module lint pass.
  Whole-repository lint still reports 257 existing formatting errors across 50 files under the user's newer rules.
- Stage sandbox-enabled and production live-enabled Worker builds pass. No secrets uploaded or Worker deployed.
- Actual Chrome sandbox purchase passed through CartDrawer, Embedded Checkout, signed webhook, paid SSR order
  and cart cleanup. A second Session demonstrated declined-card recovery and successful test 3DS confirmation.
  Mobile 390px layout has no horizontal overflow. Production credentials/account/endpoint and live settlement remain unverified.
- Live readiness and exact activation/pause/recovery commands: [runbook](../apps/web/docs/stripe-live-readiness.md).

- Real sandbox expiry validation: a newly created unpaid Session was explicitly expired through Stripe API;
  its genuine expired webhook returned 200, Atlas showed payment expired/reservation released/zero transactions,
  and reloading the owned checkout page unlocked the unchanged cart. 3DS paid order had one observation and no
  reconciliation flag. Runtime checks used only synthetic contacts and official Stripe test cards.
- Final checks also passed five release-selection tests and public-asset scan found no configured Stripe API/signing
  secret values in 113 files. Screenshot evidence is local and is not committed to the repository.
