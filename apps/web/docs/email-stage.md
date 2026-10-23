# Stage transactional email

The stage Worker dispatches notification jobs every minute. `EMAIL_ENABLED` defaults to `false`, and the scheduled handler exits before opening the database while disabled. Stage sends from `Luvlae Stage <onboarding@resend.dev>` and routes **every** buyer and administrator message to one configured inbox associated with the Resend account. The transport prefixes subjects with `[STAGE]`. Logical buyer/admin jobs remain separate in MongoDB even when the physical destination is the same.

## Configure

1. Run the notifications migration against the intended stage database using the normal `db:migrate` command and its exact database-name confirmation. Finish stage database and template checks before enabling dispatch.
2. Set these secrets on **`luvlae-web-stage`**: `RESEND_API_KEY`, `EMAIL_STAGE_RECIPIENT`, `RESEND_WEBHOOK_SECRET`, and `EMAIL_ENABLED=false`. Keep values out of CI build variables, tracked files and logs. The API key alone in a local `.env` does not configure a deployed Worker. The stage Cloudflare configuration supplies `APP_ENV=stage`.
3. Register a Resend webhook for `https://<stage-origin>/api/webhooks/resend` with email send/delivery/failure/bounce/complaint events. Put its **signing secret** in `RESEND_WEBHOOK_SECRET`; it is distinct from `RESEND_API_KEY`. Confirm stage access controls permit this exact signed webhook path.
4. Build/deploy with `EMAIL_CONFIGURED=true` after provisioning those secrets. In GitHub Actions set repository variable `EMAIL_STAGE_CONFIGURED=true`; only main/stage consumes it. Without this build gate stage has no required email secrets, and a deployed `EMAIL_CONFIGURED=false` binding disables all sending even if an old runtime `EMAIL_ENABLED=true` remains. Artifact checks reject a stage build made with a different gate setting. Production ignores this gate and has no email bindings or schedule.
5. Set runtime secret `EMAIL_ENABLED=true` only after the migration and configured stage deployment are ready. This is the independent runtime pause switch. Optional **non-secret build settings** are `EMAIL_FROM`, `EMAIL_REPLY_TO`, and `APP_ORIGIN` (CI repository variables `EMAIL_STAGE_FROM`, `EMAIL_STAGE_REPLY_TO`, `EMAIL_STAGE_APP_ORIGIN`). Defaults are the Resend stage sender, no Reply-To, and the existing stage `workers.dev` origin. They are text bindings, not required secrets; change them through the build configuration and rebuild. Do not put keys or private recipients in these build settings.

Administrator order alerts use administrators with `notify.orders=true` in the stage database. Set an individual administrator's preference with `ADMIN_EMAIL`, `ADMIN_NOTIFY_ORDERS=true` (or `false`) and `DB_CONFIRM_NAME`, then run `node --conditions=react-server --import tsx scripts/db/admin-notifications.ts` from `apps/web`. This is separate from the stage delivery inbox; all resulting stage mail still routes to `EMAIL_STAGE_RECIPIENT`.

Migration `007-admin-notifications` adds nested `notify: { orders: boolean }` and defaults existing administrators to `false`. New administrators also default to `false`. Only active opted-in administrators are selected; eligibility and email identity are checked again at dispatch, so disabling an administrator or turning off the flag suppresses their queued alert. There is no separate environment recipient list for administrators.

For local development, place the same values in ignored `apps/web/.env.local` with `APP_ENV=development`. `EMAIL_STAGE_RECIPIENT` must be the Resend account-owned test inbox. The transport never accepts arbitrary diagnostic destinations. Production configuration rejects the Resend test sender and stage recipient setting.

## Check without sending

From `apps/web`, run:

```sh
node --conditions=react-server --import tsx scripts/email-stage.ts --check
```

This validates configuration and prints no secret or recipient. The command does not contact Resend. For a deliberately requested synthetic delivery, run the same command with `--send`; it submits one synthetic message to the configured stage inbox and prints only the provider message ID. No email is sent by build, startup, migration, or `--check`.

After activation, inspect the Cloudflare stage Cron Events and Worker invocation logs, then verify a real stage order journey and the corresponding notification history. A Resend API acceptance response only means the provider accepted the request; the signed callback and inbox receipt establish later delivery state. If a request times out or returns a 5xx, the outbox treats the outcome as uncertain and uses its frozen payload/idempotency key recovery policy. The same key must not be replayed after Resend's 24-hour idempotency window without operator reconciliation.

To pause sending, set stage runtime `EMAIL_ENABLED=false`. This does not erase notification records; review any pending jobs before reactivation. Production promotion requires a verified domain sender, separate runtime settings, actual recipient policy, webhook capacity, and a deliberate cutover.

## Recovery policy

The authorized order details show email history. Definitive sending failures can be retried with the audited order notification API. A provider-confirmed delivery failure (`accepted` + `delivery=failed`) creates a new redelivery job with a fresh provider key, preserving the original message/callback history. Concurrent or replayed retry requests cannot start duplicate active redeliveries. Hard bounce/complaint suppression cannot be bypassed with Retry.

An uncertain send outcome is never blindly resent after the safe idempotency window; inspect Resend history before any operator recovery. Later factual order notifications continue even if an older message is uncertain. Definitive quota rejections retain safe manual recovery after quota reset. Unsent preparation/shipment/confirmation/cancellation notices are rechecked against current state; stale customer messages are cancelled.

## Verification — 2026-10-23

Local provider/template checks and a synthetic send using the ignored local key succeeded; Resend accepted the message. Inbox delivery is not independently confirmed. A local workerd scheduled invocation with email disabled returned `outcome: ok`. Remote migrations, stage deployment/secrets, provider webhook registration and a deployed scheduled end-to-end order journey have not been performed by this implementation.

Validation: the final email suites passed 37 tests (provider/config/templates, replica-set queue and lifecycle cases); the deployment/release suites passed 8 tests. ESLint, TypeScript and the Cloudflare stage build passed. Independent GPT-6 Sol review found no remaining concrete defects after fixes. A full server-suite run had one pre-existing failure: `checkout-session.test.ts` expects `automatic_tax.enabled=false` while the unchanged Checkout implementation enables it. This mismatch is present at `HEAD`; this integration does not alter tax behavior or weaken that assertion.
