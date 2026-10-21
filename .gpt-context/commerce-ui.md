# Storefront cart and temporary checkout

Implemented 2026-10-18 following user approval of a temporary paid-order simulation. See [API details](../apps/web/docs/commerce-api.md#storefront-and-mock-checkout--2026-10-18).

- All Amazon purchasing buttons now point to the product page; header purchasing action is a cart button with item count. Amazon remains a source reference only. Amazon campaign discount wording was removed; no on-site discounts are implemented.
- `src/features/shopping-cart` uses Zustand (without React Context) for Add to cart with quantity, persistent SKU/quantity cart, modal right Drawer, editing/removal and direct Checkout. Inputs cap quantity at 99; the product selector also uses its SSR stock snapshot. `/products/berberine-patches` is request-rendered and reads the offer directly on the server through `entities/product/index.server.ts`. The initial HTML includes the BE price; there is no client price-loading request. Other marketing pages stay static.
- Only clicking Checkout verifies offers through `/api/products/:sku`, then `/api/checkout/quote` and `/api/checkout/mock`; changed prices/versions need reconfirmation. Mock endpoint creates an open, paid order with server-mocked contacts and US address, stock consumed atomically, a committed attempt and explicit mock audit. No Stripe calls, real payment records or emails. `checkoutMode:mock` and the audit distinguish simulated orders internally; new customer order numbers use LV (older stored TEST-LV numbers remain unchanged). Mock-only zero shipping/tax makes total equal subtotal.
- `MOCK_CHECKOUT_ENABLED=true` is required; Cloudflare stage enables it, production disables it. Local untracked `.env.local` enables it for development. No remote Worker was deployed by this change.
- `/orders/:id` is SSR, noindex and excluded from sitemap. The checkout response sets a per-order HttpOnly/SameSite=Lax cookie, Secure on HTTPS, scoped to that order path for 30 days. The server checks its hash/expiry before rendering snapshots; no browser order-data fetch. Legacy `/order/:id` links can upgrade their existing sessionStorage token through authenticated `/api/orders/:id/access` before navigating to the SSR page.
- Creation uses guest-scoped idempotency; pending exact requests persist across reload/network failure and block edits until resolved. Success removes purchased quantities. No public contact/address fields are returned.
- Schema migration 002 adds optional checkout mode without changing applied migration 001. Explicit test-data migration 003 inserts SKU `LUVLAE-BERBERINE-60`, synthetic USD 29.99, initial stock 100; reruns never overwrite/replenish. `db:seed:test` requires mock mode and exact DB confirmation. Both migrations applied to configured stage Atlas; one local browser test order consumed one unit.
- Validation: server integration suite covers stock race, multi-item rollback, paid mock lifecycle, replay/conflict, mode gating, seed preservation, and no invented financial entries. Runtime browser verification includes quantity/subtotal, cart reload/removal, 390px Drawer and successful checkout/confirmation.

## SSR/store revision and UI preferences

- Zustand 5.0.15 is installed. Store factories return fresh empty stores for SSR; only the browser shares a store, and RSCs never read/write mutable store state. Runtime initialization restores browser data after hydration.
- localStorage v2 holds SKU/quantity and server-originated offer snapshots so the Drawer can open without fetching products. Old v1 carts are imported. These cached prices are advisory; BE verifies them at checkout. No verification on Add to cart, Drawer open, window focus or quantity edits. Buttons are not blocked by background product requests; checkout itself has an in-flight lock and exact-request retry protection.
- Customer-facing UI must not expose implementation/test wording (for example “Test checkout”, “Paid (test)”, sample-details explanations). The underlying temporary backend behavior and internal audit remain explicit in code/docs. Keep future customer copy focused on the purchase flow.
- Private orders and admin routes declare request rendering and noindex/no-store headers, including CDN-Cache-Control no-store.


## Embedded Stripe Checkout — 2026-10-19

- CartDrawer now calls `/api/checkout/session` and navigates to the protected `/orders/:id/checkout` SSR route,
  within the existing per-order HttpOnly cookie path. Embedded Stripe.js collects card, contact and US shipping details.
- Prices remain Atlas-owned. Shipping/tax are included with zero additional surcharge, no discounts or automatic tax.
  A new Stripe reservation stores final totals and lasts 30 minutes for new checkouts (revised 2026-10-21); server copies preserve the original deadline on retry.
- Cart quantities and the exact pending request remain until a server-confirmed paid order. Paid cleanup writes an
  atomic localStorage receipt with updated quantities, preventing repeated subtraction on refresh. The receipt list
  is bounded to 50 orders. Expired/failed attempts unlock editing only after server confirmation; clock expiry alone does not.
- Result pages render appropriate paid/pending/failure/expiry copy. Pending state refreshes SSR for up to 60 seconds,
  then offers manual status refresh. onComplete navigates only and cannot mark a payment paid.
- Stripe client secrets are server-rendered only for an owned payable Session; not stored in URLs or browser storage.
  Locale is English; Link is disabled for newly created card-only Sessions. Returning to shopping preserves the pending checkout.
- Creation defaults available with valid keys; STRIPE_CHEKOUT_DISABLED=true pauses checkout. Runtime test/live keys, production
  environment gates, deployment artifact isolation and outstanding live setup are in [live readiness](../apps/web/docs/stripe-live-readiness.md).
- Browser sandbox verification completed the actual CartDrawer -> Embedded Checkout -> signed webhook -> paid order
  flow with synthetic contacts. Atlas verified one observation/committed reservation; no real live payment was made.

## Shared Drawer revision — 2026-10-21

- CartDrawer and the admin OrderDrawer use `src/shared/ui/Drawer` for native modality, focus restoration, scroll locking and entrance/exit animations. Contents unmount after exit; cart data/runtime stay in Zustand. Reduced-motion users skip animation, and rapid reopen cancels the pending exit. Order-only saving restrictions remain outside the shared component.

## Guest checkout cancellation and cart controls — 2026-10-21

- New Stripe Sessions/reservations last 30 minutes. Stripe's native expiry minimum is 30 minutes; the user selected this instead of adding a scheduler for 10 minutes. Existing immutable requests keep their original deadlines.
- CartDrawer has an explicit Cancel checkout action. Quantity changes/removal first cancel an existing Session, then apply the edit. Items stay in the cart; the next checkout uses a new operation/token. During cancellation, competing checkout/edits are blocked.
- `POST /api/orders/:id/checkout/cancel` requires same-origin JSON and the guest Bearer token. The server authenticates ownership, expires an open Stripe Session, retrieves its current state, and releases held stock transactionally only after confirmed unpaid expiry. It marks the order/fulfillment cancelled and writes one guest-cancellation audit. Repeated cancellation/webhooks cannot release stock twice; completed/processing/paid payments keep the cart locked for status recovery. Cancellation can run while new checkout creation is paused.
- An uncertain creation response is resolved through the original exact request before cancellation. Network/storage failures retain the pending request for retry.
- Shared `QuantityInput` is used by CartDrawer and ProductPurchase on the product page. It uses 44px minus/plus buttons, editable numeric text and keyboard controls; the product selector retains its stock-minus-cart cap, up to 99. Cart controls wrap on small screens; the summary has an explicit 18px gap.
