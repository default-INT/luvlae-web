# Stage transactional email

The `luvlae.com` sending domain is verified in Resend, and a direct test from `notify@luvlae.com` reached an external inbox. The stage Worker dispatches queued notifications every minute, sends from `Luvlae <notify@luvlae.com>`, and delivers to each actual buyer or opted-in administrator email. Subjects include `[STAGE]`.

Stage has no recipient allowlist, redirect inbox, runtime enable switch, or build activation gate. It sends real mail to the addresses stored on stage orders and active administrators with `notify.orders=true`. Use only test orders and inboxes controlled by the team. Production stays separately disabled and has no email schedule.

## Configure and deploy

1. Apply notification migrations `006-notifications` and `007-admin-notifications` to the stage database using `db:migrate` and the exact database-name confirmation. Do this before deploying the always-on stage sender.
2. In Cloudflare, set these Secrets on **`luvlae-web-stage`**: `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET`. Use a Resend key restricted to sending from `luvlae.com`. A key used for a direct API test is not automatically available to the Worker. Never put either value in GitHub variables, tracked files, or logs.
3. Register a Resend webhook for `https://luvlae-web-stage.evgeniy-trofimov-int.workers.dev/api/webhooks/resend` with email sent, delivered, delayed, failed, bounced, and complained events. Store its signing secret as `RESEND_WEBHOOK_SECRET`; it is separate from the API key. The current Free plan allows one webhook endpoint, so decide which environment gets callbacks before configuring production.
4. `EMAIL_STAGE_FROM`, `EMAIL_STAGE_REPLY_TO`, and `EMAIL_STAGE_APP_ORIGIN` are optional GitHub Actions variables. Defaults are `Luvlae <notify@luvlae.com>`, `notify@luvlae.com`, and the stage origin above. There is no email build gate. A push to `main` deploys stage with its sender and scheduled dispatcher.
5. After deployment, place a test order using an inbox controlled by the team. Verify the message arrives at the address used in checkout, has a `[STAGE]` subject prefix, appears in Resend, and is shown in authorized admin order history. Use Stripe test checkout for a realistic buyer lifecycle; the mock order fixture uses a reserved `.test` address and cannot receive real mail.

Admin notifications go to active admin accounts with `notify.orders=true`. Set an individual preference using `ADMIN_EMAIL`, `ADMIN_NOTIFY_ORDERS=true` (or `false`), and `DB_CONFIRM_NAME`, then run `node --conditions=react-server --import tsx scripts/db/admin-notifications.ts` from `apps/web`.

## Explicit sender check

Local development does not enqueue transactional messages. To send one synthetic stage message to a controlled external inbox, set `APP_ENV=stage` and `RESEND_API_KEY` in ignored `apps/web/.env.local`, then run:

```sh
node --conditions=react-server --import tsx scripts/email-stage.ts --check
node --conditions=react-server --import tsx scripts/email-stage.ts --send you@example.com
```

`--check` does not send. `--send` sends a real message to the supplied address and prints only the provider message ID. A provider acceptance response is not proof of inbox delivery; check the mailbox and Resend email status.

## Operations

There is no pause variable. For an emergency stop, revoke or remove the stage Resend API key. This prevents new provider sends but can mark queued jobs failed; restore the key and use the authorized retry flow after reviewing those jobs. The scheduler and notification queue remain active.

The webhook verifies raw-body Svix signatures, tracks delivery/bounce/complaint events, and applies recipient suppression. Definite failures can be retried from authorized order details; uncertain outcomes require reconciliation before retrying. Resend idempotency keys expire after 24 hours, so do not blindly replay an ambiguous send after that window.

If a deployment reports `Aborting the upload operation because of conflicts`, inspect the configuration diff before retrying. Values under remote `vars` are plaintext even when named `SECRET`; `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` must be Cloudflare Secrets. If a webhook signing secret was exposed, rotate it in Resend. Keep strict deployment checks enabled.

The vinext legacy-manifest warning about a missing `fallback` flag is separate from Worker settings conflicts; seeing the conflict message means the warning did not stop the build.

## Verification status

As of 2026-10-26, Resend domain verification and a direct external test send succeeded. Stage Worker secrets, stage migrations, webhook registration, deployment, and the scheduled order-to-inbox flow still require remote verification.
