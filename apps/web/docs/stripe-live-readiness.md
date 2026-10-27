# Embedded Checkout environments and launch preparation

Updated 2026-10-20. Code/configuration preparation is not evidence of deployed live readiness.
No live credentials, remote endpoint or actual charge was provisioned or verified by this change.
The integration plan is [here](../../../.gpt-context/stripe-checkout-integration.md).

## Runtime contract

| Setting | Default / required value |
| --- | --- |
| `STRIPE_CHEKOUT_DISABLED` | `false`; only exact `true` blocks creating/resuming the embedded form |
| `STRIPE_MODE` | `test`; only `test` or `live` accepted |
| `STRIPE_SECRET_KEY` | Server-only standard `sk_test_…` / `sk_live_…` or restricted `rk_test_…` / `rk_live_…`, matching mode |
| `STRIPE_PUBLISHABLE_KEY` | Runtime `pk_test_…` / `pk_live_…` matching mode; returned to the protected checkout view |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for this exact endpoint/environment (`whsec_…`) |
| `APP_ENV` | `production` required for live; Cloudflare binds the selected deployment environment |
| `NEXT_PUBLIC_APP_ENV` | `production` build marker required for live, independently of `APP_ENV` |

Keep the API and signing secrets out of browser bundles. The publishable key is public by design; all keys
must belong to the same Stripe account/sandbox. Prefix checks verify mode, not ownership of a publishable key.
Restricted keys must grant the provider operations used by checkout, webhooks, refunds and reconciliation;
accepting the prefix does not verify permissions. Validate those flows in the target environment.
The existing CLI wrapper deliberately accepts test keys and localhost forwarding only.

The disable switch blocks checkout creation/form access; it does **not** block webhook intake. Keep live
webhook processing active when pausing new sales so existing payable Sessions can finish safely.
The webhook, retrieved Session, expanded PaymentIntent and stored payment attempt must agree with configured
mode. Connect-account events are unsupported. A received payment transaction inherits the validated attempt mode.

## Local sandbox

In ignored `apps/web/.env.local`, set the matching sandbox API and publishable keys plus:

```dotenv
STRIPE_MODE=test
STRIPE_CHEKOUT_DISABLED=false
APP_ENV=development
```

Start `pnpm --filter @luvlae/web stripe:listen http://localhost:3002/api/webhooks/stripe`, then restart
the application after it writes the local signing secret. See [local CLI instructions](stripe-local.md).
The application refuses checkout before a signing secret and matching keys are configured.
Never use the CLI signing secret for a remote stage/production endpoint.

## Cloudflare build and activation inputs

`apps/web/cloudflare.config.ts` reads `STRIPE_MODE` and `STRIPE_CHEKOUT_DISABLED` when constructing Worker
configuration. It writes their values as runtime text bindings and writes `APP_ENV` from the selected mode.
These are explicit **build/deploy inputs**: a Dashboard-only variable change can be overwritten on the next
deployment. Persist the desired non-secret values in the authorized release environment/workflow.
Never put secret key values in those build inputs or source control.
The build wrapper passes the explicit shell inputs (default test/available), preventing ignored local `.env`
entries from changing a release setting. Its deployment manifest records mode/activation and refuses to deploy an
artifact whose Worker bindings or manifest differ from the requested values. Turborepo includes both inputs
in task hashing. GitHub Actions reads the single optional repository variable `STRIPE_CHEKOUT_DISABLED`:
exact `true` disables checkout in stage and production; absent/false leaves it available with valid keys.
Pull-request checkout remains disabled. The spelling `CHEKOUT` is intentional in this configuration contract.
The former stage/production enable variables are no longer read. Production mode is selected independently
with `STRIPE_PRODUCTION_MODE=live` (otherwise test). Preserve live mode while disabling production checkout
after launch, so outstanding live payments can still settle.

Checkout now defaults available in all environments, including production; deployments therefore require all
three Stripe secrets unless explicitly disabled. Disabled production with default test mode does not declare
Stripe secrets as mandatory. Stage continues to declare its API/signing secrets. Enabled checkout
declares all three Stripe runtime keys. Production live mode retains API/signing declarations even when
checkout is disabled, so pausing sales preserves webhook requirements. The installed `cf` binding API has
no optional secret declaration: required secrets must already exist before a corresponding deployment.

For a sandbox stage artifact:

```sh
DEPLOY_ENV=stage STRIPE_MODE=test STRIPE_CHEKOUT_DISABLED=false pnpm build:cloudflare
```

For an explicitly authorized production activation artifact, after runtime secrets/settings are ready:

```sh
DEPLOY_ENV=production STRIPE_MODE=live STRIPE_CHEKOUT_DISABLED=false pnpm build:cloudflare
```

Building does not upload secrets, register endpoints or deploy. The eventual deployment must use the same
environment/configuration values. Stage/development configurations reject live mode before deployment;
the server also rejects live mode without both production markers.

To pause new live checkout, prepare/deploy production with `STRIPE_MODE=live STRIPE_CHEKOUT_DISABLED=true`.
Keep API/signing secrets, live endpoint subscriptions and order/database records available. Do not switch
to test mode while existing live Sessions still need settlement. Existing forms may still complete at Stripe;
disabling new checkout is not cancellation of existing payments.

## Required evidence before enabling real payments

1. Complete Stripe account activation and verify live card acceptance, business/support details and the intended
   production HTTPS domain in Stripe. Verify production Atlas migrations (including 004-stripe-request-snapshot), stock/prices and isolated credentials;
   do not seed synthetic products into the live storefront.
2. Register a separate **live snapshot** destination at `https://www.luvlae.com/api/webhooks/stripe` for
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`. Verify endpoint API compatibility
   with the installed SDK and store that endpoint's signing secret separately from test and CLI secrets.
3. Provision matching live API/publishable keys and endpoint signing secret through the hosting secret mechanism.
   Verify delivery and API access in the target Worker; local tests cannot establish remote secret correctness.
4. Complete a sandbox purchase in the embedded form, including a US address. Verify the delivered event changes
   order state, consumes reserved inventory once and records matching mode/amount. Verify declined/3DS cards,
   interrupted initialization, refresh/retry, webhook delay/replay, and expiration with released stock.
5. Establish operational handling for webhook non-2xx responses, failed inbox entries and reservations whose
   expiry delivery was missed. `nextAttemptAt` is diagnostic only: no scheduled reconciliation worker currently
   consumes it. The guarded manual command below can recover associations and replay real provider events. New attempts
   persist exact creation parameters/API version with inventory before contacting Stripe; legacy unbound attempts
   without a request snapshot require metadata recovery rather than guessed retries.
   Investigate provider state before releasing held stock. Assign manual fulfillment/support and
   application refund/cancellation workflow after migration 005 and sandbox verification; retain Stripe Dashboard dispute handling. Subscribe deployed webhooks to refund.created/refund.updated/refund.failed/charge.refunded and run explicit Checkout/refund reconciliation recovery as documented in commerce-api.md.
6. Confirm the user's current no-surcharge pricing policy is approved for launch: delivery and tax are included
   in item prices; this integration does not calculate tax obligations. Record verification of the required
   commercial/legal configuration outside this code change.
7. Obtain explicit production deployment authorization, activate through the release environment, then record
   real endpoint delivery and settlement evidence. An actual live payment needs explicit authorization and a
   real payment method; synthetic tests do not prove a live charge or payout.

Current unverified items include remote production credentials/endpoint, account/domain configuration,
production commerce data, target-runtime end-to-end payment, fulfillment and reconciliation operations.
Refund/dispute application workflows remain separate work.

## Manual reconciliation

Run from `apps/web` with the intended environment's API/database credentials in the operator's local secret
environment and `DB_CONFIRM_NAME` set to the exact configured database name:

```sh
pnpm stripe:reconcile 20
```

The optional batch size is 1–100 (default 20). Output includes an opaque `nextCursor`; continue with
`pnpm stripe:reconcile 20 <nextCursor>` until it returns null. A later pass starts without a cursor.
This advances past unresolved/open older attempts instead of starving later orders. Live operation also requires explicit
`STRIPE_MODE=live APP_ENV=production NEXT_PUBLIC_APP_ENV=production` in that operator environment.
The command inspects active attempts, retrieves an associated Session or searches up to 1,000 recent Sessions
for one unambiguous metadata match, verifies the association, then replays authentic matching Stripe events.
It never fabricates a financial event or releases stock based only on local expiry. Ambiguous/truncated
searches, missing provider events and provider failures remain unresolved for operator investigation.
Provider event retention and the bounded search mean old or high-volume failures can require manual recovery.
Summary output contains counts, a continuation cursor and error codes, not contact details or secret values. No scheduler is installed.

Official references: [API keys and test/live isolation](https://docs.stripe.com/keys),
[webhook endpoints and signing secrets](https://docs.stripe.com/webhooks),
[Embedded Checkout](https://docs.stripe.com/checkout/embedded/quickstart).
