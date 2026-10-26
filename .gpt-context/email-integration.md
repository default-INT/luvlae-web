# Transactional email research and proposed integration

Researched 2026-10-22. **Resend selected; code implemented locally on 2026-10-23.** The research/proposals below are historical inputs; current behavior is in the [email runbook](../apps/web/docs/email.md) and [implementation sequence](email-implementation-plan.md). User expects up to 10 orders/day. Required: buyer order/progress emails, administrator new-order emails, custom design/HTML and infrastructure fit. Admin recipients now come only from active database users with `notify.orders=true`; a synthetic local send was accepted by Resend. Remote rollout is not verified.

### User decision — 2026-10-26

The user explicitly chose one always-on implementation for stage and production, sending to actual order/admin addresses including arbitrary external providers such as Gmail. Do not redirect stage mail to a test inbox or require a recipient allowlist. `EMAIL_STAGE_RECIPIENT`, `EMAIL_ENABLED`, and `EMAIL_STAGE_CONFIGURED`/`EMAIL_CONFIGURED` gates do not exist. The `luvlae.com` domain is verified and a direct test send to an external inbox succeeded. Stage subjects carry `[STAGE]`; use only team-controlled stage orders and inboxes. This decision supersedes the stage capture/allowlist recommendations below.

## Recommendation and verified provider terms

### Stage-first onboarding decision — 2026-10-22

User requested starting with stage testing and asked about using email without a custom domain. Use the Resend-provided sender `Luvlae Stage <onboarding@resend.dev>` initially; real inbox delivery from this domain is restricted to the email associated with the Resend account. A Gmail/other public email can be the recipient/account identity, not the Resend From address. Provider simulator recipients (`delivered@resend.dev`, `bounced@resend.dev`, `complained@resend.dev`) support event testing, not visual inbox inspection, and consume quota. Sources: [resend.dev restrictions](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain), [test addresses](https://resend.com/docs/dashboard/emails/send-test-emails).

Create a `luvlae-stage` API key with Sending access; without a verified sending domain, leave domain scope unrestricted rather than selecting a nonexistent domain. Store its value only in ignored local settings and the `luvlae-web-stage` runtime secret when wiring the adapter. Distinct keys do not create a provider sandbox: the application must enforce the recipient policy. Proposed stage behavior redirects buyer/admin notifications to one configured account-owned test inbox, prefixes subjects `[STAGE]`, and permits simulators only through explicit tests. Do not send order contact data from real customers through test fixtures. Production stays disabled/unconfigured.

The user reports that key creation and addition to the project are complete (2026-10-22); `.env.example` declares `RESEND_API_KEY`. Secret values were not inspected. Test inbox identity, deployed Worker secret availability and actual sending remain unverified. Existing application code does not yet consume email settings. The concrete next steps and full lifecycle scope are in the [implementation plan](email-implementation-plan.md); do not describe the full integration as configured merely because a key exists.

Recommend **Resend Free** for initial testing and low-volume launch; keep templates in the repository and send through its HTTPS API. The current Next.js/React app runs on Cloudflare Workers via vinext, with Atlas and Stripe; no AWS application infrastructure is required. Ease-of-integration ranking below is an engineering assessment, not a measured deliverability comparison.

| Provider | Free/testing allowance | Custom layout | Assessment for this project |
| --- | --- | --- | --- |
| Resend | 3,000 emails/month, 100/day; Pro $20/month for 50,000 without daily cap | HTML/text API; React supported | Preferred: documented Workers integration and provider request idempotency |
| Brevo | 300 sends/day on Free | `htmlContent` or stored template | More daily headroom; branding caveat: official Free-plan guidance says Brevo logo cannot be removed. Validate actual transactional HTML behavior before choosing for fully branded mail |
| Postmark | 100 emails/month on non-expiring developer plan; Basic $15/month at displayed 10,000-email volume | `HtmlBody`/`TextBody` | Suitable transactional alternative; free allowance is mainly useful for evaluation |
| Amazon SES | Time-limited/account-dependent AWS Free Tier benefits; verify eligibility in account | HTML/text API | Base outbound rate $0.10/1,000 plus data/add-ons; more setup (IAM, request signing, sandbox production approval, delivery-event plumbing) |

Resend Free currently lists **one webhook endpoint**, three domains and 30-day provider data retention; Pro lists five endpoints. Do not assume separate stage/production API keys create separate webhook quotas or sandbox isolation. AWS FAQ describes both 3,000 message charges/month for the first 12 months of SES use and newer AWS credit rules; do not promise either allowance without checking the actual account.

Budget illustration, assuming one admin recipient and 3–5 buyer messages across a normal lifecycle: 4–6 sends/order, about 40–60 sends/day and 1,200–1,800/month at 10 orders/day over 30 days. Real daily usage depends on when older orders ship, processing/delivery events, refunds and administrator count; this is not a guaranteed order capacity. More recipients consume additional sending capacity. Reserve room for peaks; reassess around 70–80 sends/day or before an expected spike. Free-tier cap exhaustion can delay critical mail; Pro removes the daily cap.

Primary sources checked:

- [Resend pricing](https://resend.com/pricing) and [Workers integration](https://resend.com/docs/send-with-cloudflare-workers).
- [Resend HTML/text API](https://resend.com/docs/api-reference/emails/send-email), [24-hour idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [domain verification](https://resend.com/docs/dashboard/domains/introduction), [signed webhooks](https://resend.com/docs/webhooks/verify-webhooks-requests), [test addresses](https://resend.com/docs/dashboard/emails/send-test-emails).
- [Brevo Free plan](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans), [HTML API](https://developers.brevo.com/reference/send-transac-email), [logo restrictions](https://help.brevo.com/hc/en-us/articles/4409354969746-Customize-your-plan-with-add-ons).
- [Postmark pricing](https://postmarkapp.com/pricing) and [HTML/text API](https://postmarkapp.com/developer/api/email-api).
- [SES pricing](https://aws.amazon.com/ses/pricing/), [Free Tier FAQ](https://aws.amazon.com/ses/faqs/), [sandbox restrictions/approval](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html), [HTML/text support](https://docs.aws.amazon.com/ses/latest/dg/send-email-formatted.html).
- [Cloudflare scheduled handlers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) and [React Email](https://react.email/docs/introduction).

## Verified repository baseline

- [Worker configuration](../apps/web/cloudflare.config.ts) has separate stage/production settings but no email credentials or cron sender. Stage wraps the vinext fetch handler; production uses it directly. A scheduled entrypoint must be wired and verified, not assumed to work through a Route Handler.
- [Order model](../apps/web/src/_app/commerce/models.ts) has embedded `notifications`; [schema](../apps/web/src/_app/commerce/migrations.server.ts) limits this array to 10 entries with pending/sent states only. Lease, provider IDs, delivery states and retry/error metadata are absent.
- [Fulfillment updates](../apps/web/src/_app/commerce/orders.server.ts) append one shipping job atomically. Processing/delivered changes do not enqueue mail. Delivery is manager-entered, not carrier-confirmed.
- [Stripe settlement](../apps/web/src/_app/commerce/stripe-checkout-persistence.server.ts) records payment/contact/inventory state but does not enqueue buyer/admin confirmation. Mock orders start with no notification jobs.
- Guest order access uses a browser-bound HttpOnly cookie and a stored token hash. A plain `/orders/:id` link does not grant access from another device. Never email the existing guest credential or add it to a query string.

## Proposed scope and events

| Event committed by server | Recipient | Intended notification |
| --- | --- | --- |
| First verified successful payment | Buyer | Order/payment confirmation, purchased items and final totals |
| Same payment transition | Configured admin recipient(s) | New paid order, summary and authenticated admin link |
| Fulfillment becomes processing | Buyer | Order is being prepared; optional if it follows payment immediately |
| Fulfillment becomes shipped | Buyer | Carrier, tracking number and safely constructed tracking link |
| Fulfillment becomes delivered | Buyer | Delivered, explicitly based on current manual workflow |
| Cancellation actually completes | Buyer | Order cancelled; accurately distinguish pending and completed refund |
| Individual refund succeeds | Buyer | Amount refunded for that refund, including partial refunds; do not promise bank receipt time |

Core first release: buyer confirmation, admin paid-order alert, shipment. Processing/delivered and cancellation/refund notifications follow in the same integration roadmap. A pending or expired unpaid checkout is not a new paid order. Refund initiation is not refund completion. Do not send duplicate refund notices when a cancellation and its refund commit together; group related outcomes deliberately. Arbitrary cancellation reasons are internal and must not be copied into customer email.

## Proposed implementation

1. **Sender and templates.** Verify a dedicated sending subdomain such as `notify.luvlae.com`; add provider-supplied SPF/DKIM and aligned DMARC without overwriting unrelated mail records. Example sender `Luvlae <orders@notify.luvlae.com>` and Reply-To must be finalized; the latter should be a monitored mailbox. An outbound service does not establish that mailbox. Use repository-owned React Email templates rendered to HTML plus plain text. Keep branding in shared email components, inline email-compatible styles and hosted HTTPS images; website SCSS is not directly reusable email styling. Verify Gmail, Outlook, Apple Mail, mobile widths and dark mode.
2. **Durable outbox.** Prefer a dedicated `notificationJobs` collection for per-recipient delivery, repeatable refunds and recovery rather than expanding the existing 10-entry array indefinitely. This changes the earlier embedded-outbox proposal: insert jobs and the order transition within the same MongoDB transaction. Add explicit versioned migration, validator, unique logical-key index, and due-job/lease indexes. Define a stable key from environment/order/business event/recipient identity (no plaintext email in keys). Persist recipient, locale, event data and template version as a stable send snapshot; deduplication must survive different Stripe event IDs for the same business outcome. Do not couple job bookkeeping to the order's admin-edit version.
3. **Background dispatch.** Add a bounded Cloudflare `scheduled` handler, initially every minute, that claims due jobs atomically with expiring leases/tokens, sends outside DB transactions, and records provider message ID. Verify current pinned `cf`/vinext entrypoint support and Atlas access in deployed scheduled execution. Start with one scheduled path per environment and no Redis/extra queue service. A fast path after commit may reduce latency, but MongoDB remains the recovery source. Email failures must not roll back payment or fulfillment.
4. **Retry and uncertainty.** Stable provider idempotency key and unchanged payload for each logical job. Store first send attempt and distinguish definite rejection, transient errors and ambiguous timeouts. Retry 429/5xx/network failures with bounded backoff/jitter, respecting provider limits. Resend retains keys for 24 hours: stop blind resend of an ambiguous request before that window expires and require reconciliation/operator review; do not claim exactly-once delivery. Lease-token ownership must guard completion updates after a worker crash. Permanent failures become actionable failures, not infinite retries.
5. **Delivery events and operations.** Signed webhook Route Handler with raw-body verification, timestamp/replay checks and deduplicated event ingestion. Correlate events by provider message ID or opaque job metadata; recover webhook-before-send-response races. Keep send acceptance separate from delivered/bounced/complained state and handle reordered callbacks. Suppress automatic sends to hard-bounced/complaining recipients and expose sanitized errors/recovery to administrators. Monitor backlog age, permanent failures and quota headroom; alert through an independent operational channel if sending is broken. Retain only necessary delivery metadata, not full email/provider payloads in logs.
6. **Environment isolation.** Proposed runtime settings: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `EMAIL_ENABLED`, admin recipient configuration and stage recipient allowlist. These are new settings, not existing bindings. Separate credentials/domains or restricted provider resources where available; stage enforcement belongs in server code and must cover every recipient field. Default local/stage to capture/test addresses and explicit allowlisted real inboxes. Free has one webhook endpoint: prioritize production; use fixtures/test addresses for stage, or evaluate a permitted separate provider workspace/paid plan when simultaneous end-to-end callbacks are needed. Never silently send stage mail to order contacts.
7. **Rollout and compatibility.** Import the existing pending shipping jobs into the new outbox idempotently under an explicit cutoff/eligibility policy; disable the old writer when switching. Do not email historical orders automatically. Decide how to handle stale unsent progress events after cancellation, shipment or refund, with ordering/coalescing so obsolete preparation mail does not follow shipment. Start with synthetic stage orders and test inboxes, then a small controlled production send and monitoring.

Placement: provider adapter in server-only `src/shared/lib/email/`; lifecycle/outbox orchestration beside current `src/_app/commerce/`; email templates in a focused app-level module; thin webhook route and Cloudflare entrypoint composition. Follow [FSD rules](fsd-rules.md), avoid introducing an extra application/package for this one consumer. No Turborepo task changes are required by the plan; if introduced during implementation, read installed version's bundled docs first.

## Customer order links

Core release can include the order summary in the email, public support contact and carrier tracking after shipment. An effective cross-device “View order” CTA needs a separate recovery design first. Suggested direction: rate-limited emailed code, hashed short-lived challenge, verified exchange through POST for a new scoped guest cookie; do not weaken the current no-token-in-query rule. Codes/credentials must not enter analytics or logs. This recovery is additional scope and is not implemented by the email provider.

## Acceptance checks and remaining inputs

- Duplicate/reordered Stripe events enqueue one buyer and one job per intended admin, with rollback preserving order/outbox atomicity.
- Concurrent cron claims, process crash, provider timeout, 429/5xx, exhausted quota, 24-hour ambiguity, and manual recovery do not lose jobs or trigger uncontrolled duplicates.
- Signed delivery events, duplicate/out-of-order callbacks, suppression, bad addresses and webhook-before-response are handled.
- Processing/shipment/delivery/cancellation/refund events reflect actual committed state; partial/repeated refunds, late payment holds and stale queued events are covered.
- Stage never sends outside its explicit allowlist; mock checkout never implicitly targets a real buyer. Template previews and actual inbox rendering pass; scheduled execution is checked in deployed stage.
- Before implementation finalize sender/reply mailbox, admin recipients, optional buyer statuses, historical shipping cutoff and whether cross-device order access is in scope. The volume assumption (up to 10 orders/day) is confirmed; Resend is selected; the integration details remain proposed.
