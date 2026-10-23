# Resend integration implementation plan

Date: 2026-10-22; implementation update 2026-10-23. The code below is implemented locally; remote rollout remains separate. A synthetic email was accepted by Resend using the ignored local key; stage runtime provisioning is unverified. Current operational instructions supersede proposed configuration names below: [stage runbook](../apps/web/docs/email-stage.md). Research and provider restrictions: [email integration](email-integration.md).

## Agent subtasks and ownership

| Subtask | Model | Result |
| --- | --- | --- |
| Branded HTML/text templates and synthetic previews | GPT-6 Luna | Seven lifecycle templates, integer cents, escaping and tracking-link tests |
| Resend adapter, stage transport and callback verification | GPT-6 Sol | Native fetch, Svix signatures, safe routing and configuration tests |
| Outbox, migrations, dispatch, webhook/recovery | GPT-6 Sol | Transactional jobs, leases, ambiguity/retry rules, inbox and suppression |
| Lifecycle integration tests | GPT-6 Luna | Actual mock checkout/fulfillment/cancellation/refund and opt-in migration coverage |
| Integration, admin notify preference, admin history/API, stage build/config/docs | Parent agent | Combined changes and operational checks |
| Independent final code review | GPT-6 Sol | Review findings fixed and regression coverage added; final verification recorded in runbook |

User amendment: administrator recipients come from the database only, via nested `notify.orders: boolean` plus active status. The proposed `EMAIL_ADMIN_RECIPIENTS` configuration below is superseded and must not be implemented. Default false; check eligibility at enqueue and delivery. Templates use native email HTML with website colors/card styling and font fallbacks, rather than importing website SCSS or a React Email dependency.

## Target and boundaries

Deliver custom transactional email for the complete order lifecycle and admin new-paid-order alerts, starting with stage. Use the existing `apps/web`, MongoDB Atlas transactions and Cloudflare Workers; no separate application, Redis or message broker is required initially. Resend is the delivery adapter, not the source of order/payment truth. Customer email content is English initially, matching the current storefront locale; keep text localizable and avoid product/health claims beyond transactional order snapshots.

Stage starts without domain verification: `Luvlae Stage <onboarding@resend.dev>`, `[STAGE]` subject prefix, all ordinary buyer/admin mail routed to one explicitly configured email associated with the Resend account. The same inbox receiving buyer/admin messages must not merge those logical jobs. Restrict all provider recipient fields at the transport boundary; simulator addresses are permitted only in explicit diagnostic scenarios. Disable production dispatch until sender domain, recipients and production configuration are ready.

## Event contract

| Logical event | Trigger and existing integration point | Audience and content |
| --- | --- | --- |
| `order.paid` | First verified accepted payment transition in `stripe-checkout-persistence.server.ts`; also verified reconciliation through that path | Buyer: order number, item/quantity/price snapshots, final total/currency |
| `admin.order-paid` | Same committed transition | Each configured admin: new paid order, summary, authenticated admin link |
| `order.processing` | Actual transition to processing in `orders.server.ts` | Buyer: preparation started |
| `order.shipped` | Actual shipped transition in `orders.server.ts` | Buyer: carrier, tracking number, safe carrier link |
| `order.delivered` | Actual delivered transition in `orders.server.ts` | Buyer: delivered; current source is the manager, not carrier tracking |
| `order.cancelled` | Completed cancellation in `finishCancellation` in `refund-persistence.server.ts` and explicit no-payment cancellation paths where applicable | Buyer: cancellation completed; refunded amount only when verified |
| `refund.succeeded` | First transition of each individual refund to succeeded in provider persistence; synthetic equivalent for explicitly enabled stage mock flow | Buyer: that refund's amount/currency, distinguish partial vs full; no invented bank settlement time |

No business notification from a browser success page, checkout creation, pending/failed unpaid payment or inventory restock. Admin order alert means a paid order; payment holds/reconciliation exceptions must not imply that it is eligible to ship. External Stripe refunds update money only, as today; emails must not implicitly cancel or restock. Local free-text cancellation/refund reasons are internal.

If cancellation and its successful refund commit together, create one combined cancellation/refund message rather than two redundant emails. If a refund was already notified and cancellation completes later, send the separate cancellation fact. Preserve a deterministic deduplication relationship for the refund so later Stripe events cannot send it again. Successful refund later reversed to failure follows the existing reconciliation hold: notify operators and suppress any unsent now-inaccurate refund message; do not silently re-send customer success.

## Delivery sequence

### 1. Stage configuration and provider boundary

- Add validated server-only settings: existing `RESEND_API_KEY`; new `EMAIL_ENABLED`, `EMAIL_FROM`, `EMAIL_STAGE_RECIPIENT`, `EMAIL_ADMIN_RECIPIENTS`, optional `EMAIL_REPLY_TO`, `RESEND_WEBHOOK_SECRET`, and environment-specific `APP_ORIGIN` for links. Confirm final names while implementing against existing environment conventions; these additional settings are not implemented yet. Never infer origin from untrusted request headers.
- Add runtime binding declarations scoped to stage and activation state; avoid making a missing email secret a new mandatory production deployment dependency. Local uses ignored env files; deployed stage uses Worker runtime secrets/bindings, not just CI build variables. Do not print secret values or recipient addresses in diagnostics.
- Create server-only provider interface `sendTransactionalEmail` and a Resend HTTPS adapter using native `fetch`, explicit timeout, stable idempotency header, opaque job tag, sanitized errors and provider message ID. Use official SDK/Svix support for signature verification after validating Workers compatibility; do not hand-roll cryptographic verification.
- Add a controlled CLI diagnostic for synthetic test content, restricted to development/stage. No unauthenticated test-send route or automatic send on startup/build. Actual diagnostic send is a separately explicit action; it is not executed by this plan.
- Completion: key is available in the runtime that actually sends, one explicitly requested synthetic message reaches the account-owned inbox, and blocked recipients never reach Resend. Production remains disabled. No assertion of end-to-end readiness from an API 2xx alone.

### 2. Repository-owned email design

- Add React Email components for the event contract, with a shared brand layout, order rows, totals, CTA and footer. Keep HTML/text rendering behind a server-only interface. Verify React Email rendering works with installed React/RSC/vinext and the scheduled execution bundle before connecting business events; use native HTML output if runtime constraints require it.
- Use email-compatible inline styles, accessible structure/alt text, HTTPS images and font fallbacks. Website SCSS Modules are not sent as email styling. Components follow same-name folder/file and explicit exports; treat email CSS as a specific renderer requirement rather than changing website style conventions.
- Render buyer/admin templates with synthetic data. Escape user-controlled text, validate/construct tracking links from supported carrier mappings, and avoid copying untrusted tracking HTML/URLs. Do not include internal status notes or unverified product claims.
- Initial buyer emails include order details and carrier/support links. Cross-device private order access needs separate recovery work; do not add a broken “View order” button or expose existing guest credentials. Admin links point to the authorized stage admin UI.
- Completion: HTML and plain text previews cover long names, multiple items, USD amounts, small screens and dark mode. Actual inbox checks cover Gmail, Outlook and Apple Mail where test accounts are available; document unavailable checks honestly.

### 3. Durable notification outbox and migration

- Add an additive migration (next available number, currently expected `006-notifications`) for `notificationJobs`, minimal deduplicated `emailEvents` inbox and recipient suppression data. Follow existing explicit migration/DB-name confirmation conventions; do not modify applied migrations or provision schema in request handlers. Gate activation on migration readiness before enabling lifecycle writers.
- One job per semantic event and logical recipient. Unique key combines environment, order, event occurrence (e.g. provider refund ID), audience and recipient identity; never only Stripe webhook ID, never raw email in exposed keys. Buyer/admin jobs remain distinct when stage redirects both to one mailbox. Snapshot admin recipients at enqueue time.
- Persist source event time/sequence, order/refund references, template version, locale, recipient and stage-routed destination, immutable event data, created time, attempts, next attempt, lease token/expiry, first provider request time, sanitized error and provider message ID. Freeze exact provider payload before first request and reuse it across retries/deployments.
- Separate dispatch state (`pending`, `sending`, `accepted`, `failed`, `unknown`, `suppressed`, `cancelled`) from observed delivery state. Accepted means Resend accepted the request; it does not mean the recipient received or read it.
- Add indexes for unique logical key, due jobs, lease recovery, provider ID and order history. Notification bookkeeping does not increment the order's optimistic-edit version. Store only necessary personal data with an explicit retention policy before production.
- Completion: duplicate enqueue produces one job, order+job rollback together, schema validation/indexes work, and independent concurrent jobs cannot corrupt each other.

### 4. Wire existing business services

- Add enqueue calls inside the existing MongoDB transaction after accepted state changes: Stripe settlement/reconciliation, manager fulfillment, completed cancellation and individual successful refunds. No network/email rendering with side effects inside those transactions.
- Hook explicitly gated stage mock checkout into equivalent synthetic events for repeatable UI tests; never bypass real payment verification for Stripe orders. Cover mock refund/cancellation paths separately so tests reflect the current implementation rather than assuming all refunds use Stripe persistence.
- Replace embedded shipping-job writes with the new enqueue path. Keep old schema readable for rollback compatibility. Existing pending embedded jobs receive no automatic historical send: import only an explicitly chosen recent/eligible subset with a stable mapping key, or mark the old backlog retired through an operator action. Replaying deployment/migration cannot duplicate them.
- Queue only transitions occurring after the activation cutoff. While email is disabled, do not accumulate a surprise historical mailing backlog. Activate the complete configuration and migration together before enabling writers/dispatch.
- Keep per-order notification order; coalesce obsolete unsent progress messages (e.g. preparation after shipment) and suppress false shipment/preparation notices after cancellation. Do not pretend an already accepted/in-flight email can be recalled.
- Completion: one synthetic paid order creates buyer/admin jobs; each real fulfillment transition creates its intended job; duplicate/reordered Stripe events and admin-operation replay do not create extra messages; refunds/cancellation obey the event contract.

### 5. Scheduled dispatch and recovery

- Add `scheduled` handling to a Worker entrypoint while preserving vinext fetch behavior and stage noindex headers. Verify the pinned `cf` configuration/runtime and `server-only` imports before changing deployment wiring. Run every minute initially, in bounded batches with rate limiting; no public polling endpoint.
- Atomically claim due jobs with an expiring lease. Before calling Resend, persist the frozen request/idempotency key and first-request time. Completion writes require current lease-token ownership. Resume crashed jobs without inventing a new logical send.
- Respect provider 429/retry headers and use bounded backoff/jitter for transient failures. Distinguish definite rejection from uncertain timeout. Resend remembers idempotency keys for 24 hours: place ambiguous aged jobs into operator review before expiry rather than replaying indefinitely. A definitive rejection can be handled under its own retry rules; do not rotate keys to bypass ambiguity.
- Provider/database outages do not undo accepted order/payment transitions. Monitor backlog age, quota headroom and failed/unknown jobs; operational alerts must have an independent path if email itself is down.
- Completion: real deployed stage scheduler reaches Atlas and Resend, survives a crash after send/before DB update, and cannot double-claim the same job or exceed its runtime batch budget. Check at least one cold invocation; local manual CLI success does not prove scheduled execution.

### 6. Delivery webhooks and administrator visibility

- Add thin `POST /api/webhooks/resend` route. Verify raw-body Svix signature/timestamp and bounded body size; signing secret is separate from the sending API key. Allow provider access past stage browser-access controls only for this exact signed endpoint.
- Persist verified events idempotently before acknowledgement. Correlate by provider message ID/opaque job tag; handle webhook arriving before send-response persistence. Retry/reconcile unresolved events. Stage shared-account callbacks must match known stage jobs; unrelated signed events never mutate stage order state.
- Track delivery, bounce, complaint, delay and failure using event history and a deliberate reducer; a delayed callback must not erase delivery, while a complaint may follow delivery. Apply suppression to actual destinations and give administrators sanitized actionable state.
- Extend authorized admin order details with email type/time, dispatch/delivery state, attempts and failure code. Add an authorized, audited retry action for definitively failed jobs; unknown outcomes require reconciliation, and suppressed recipients cannot be bypassed by a generic Retry button. No raw provider payloads, secrets or unnecessary personal data in UI/logs.
- Use the Free plan's endpoint for stage initially. Production promotion must deliberately reassign it or provide additional supported endpoint capacity; never quietly redirect callbacks needed by the other environment.
- Completion: signed simulator events update matching jobs once; invalid/replayed/out-of-order/foreign callbacks cannot corrupt state; admin failure recovery is inspectable and audited.

### 7. End-to-end acceptance and later production promotion

- Run server integration tests against a replica set for atomic enqueue/rollback, concurrent claims, payment/admin replay, partial/repeated refunds, combined cancellation/refund, late-payment holds and obsolete queued progress.
- Exercise network timeout, 429/5xx, permanent address failure, quota exhaustion, worker crash, 24-hour ambiguity and delivery-event races. Confirm stage routing covers every provider recipient field and production cannot accidentally use test sender/recipient routing.
- Run project lint/type checks and Cloudflare stage build; read installed Turborepo bundled docs before any task/config changes. Avoid unrelated tooling upgrades. Verify actual deployed stage cron and signed provider callback separately from local tests.
- Stage walkthrough: Stripe test payment → buyer/admin confirmation → processing → shipment with tracking → manual delivered; additional orders cover cancellation and full/partial refund. Mock path is a supplemental synthetic test, not a substitute for Stripe sandbox testing.
- Later production prerequisites: verified sending domain/DNS, monitored Reply-To, actual admin recipient list, separate runtime credentials/database targeting, delivery-webhook capacity and retention/monitoring policy. Enable only future events after a deliberate cutover, with email disable switch and backward-compatible DB rollback. Existing jobs are never deleted by a code rollback.

## Planned code placement

| Responsibility | Location |
| --- | --- |
| Provider adapter, provider configuration, signature verification | `apps/web/src/shared/lib/email/` with server-only public API |
| Event policies, enqueue, dispatch, delivery reduction | Focused modules beside current `apps/web/src/_app/commerce/` |
| Email layouts/templates/rendering | `apps/web/src/_app/emails/`, same-name component folders |
| Additive migration/collection access | Existing commerce migration and collection modules |
| Resend callback | `apps/web/app/api/webhooks/resend/route.ts`, thin composition |
| Authorized email status/retry API | Existing admin route/handler conventions |
| Admin email history | Existing admin order details |
| Scheduler | Existing Cloudflare entrypoint/configuration |
| Operator smoke/recovery tools and runbook | `apps/web/scripts/` and `apps/web/docs/email-stage.md` |

No customer-facing development labels. No new app/package merely for this integration. Respect [FSD rules](fsd-rules.md).

## Inputs still needed when executing

Account-owned test recipient, where the key was provisioned (local runtime and/or deployed stage), stage application origin and optional Reply-To. Do not request the secret in chat. Real production admin recipients, domain and retention policy are later production inputs. These are configuration details, not blockers to writing the plan or implementing the disabled/capture-mode foundation.
