# Transactional email

The `luvlae.com` sending domain is verified in Resend, and a direct test from `notify@luvlae.com` reached an external inbox. Stage and production use the same templates, queue, dispatcher, provider adapter, webhook handler, Worker entrypoint, and scheduled trigger. Both deliver to the actual buyer or opted-in administrator address. Stage subjects receive a `[STAGE]` prefix; production subjects do not.

There is no recipient redirect, allowlist, runtime enable switch, build activation gate, or environment-specific email implementation. Use only team-controlled orders and inboxes in stage.

## Configure and deploy

1. Apply notification migrations `006-notifications` and `007-admin-notifications` to each environment database using `db:migrate` and the exact database-name confirmation.
2. In Cloudflare, set `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` separately on **`luvlae-web-stage`** and **`luvlae-web`**. Use Resend keys restricted to sending from `luvlae.com`. Never put either value in GitHub variables, tracked files, or logs.
3. Register the Resend webhook URL for the environment that receives callbacks: `/api/webhooks/resend`, with email sent, delivered, delayed, failed, bounced, and complained events. Store that endpoint's signing secret as `RESEND_WEBHOOK_SECRET`; it is separate from the API key. The current Free plan allows one webhook endpoint, so production should own the callback endpoint when it goes live; stage sending still works without delivery callbacks, but its delivery state will remain unconfirmed.
4. The shared defaults are `Luvlae <notify@luvlae.com>` for `EMAIL_FROM` and `notify@luvlae.com` for `EMAIL_REPLY_TO`. `APP_ORIGIN` defaults to the stage Worker URL in stage and `https://www.luvlae.com` in production. These text bindings may be overridden without changing application code.
5. After deployment, place a test order using an inbox controlled by the team. Verify the message arrives at the address used in checkout, appears in Resend, and is shown in authorized admin order history. Stage mail must have `[STAGE]`; production mail must not. Use Stripe test checkout for a realistic stage lifecycle; the mock order fixture uses a reserved `.test` address and cannot receive real mail.

Admin notifications go to active admin accounts with `notify.orders=true`. Set an individual preference using `ADMIN_EMAIL`, `ADMIN_NOTIFY_ORDERS=true` (or `false`), and `DB_CONFIRM_NAME`, then run `node --conditions=react-server --import tsx scripts/db/admin-notifications.ts` from `apps/web`.

## Explicit sender check

The diagnostic uses the same provider adapter as queued order notifications. Set `APP_ENV=stage` or `APP_ENV=production` together with a server-only `RESEND_API_KEY` in ignored `apps/web/.env.local`, then run:

```sh
node --conditions=react-server --import tsx scripts/email-diagnostic.ts --check
node --conditions=react-server --import tsx scripts/email-diagnostic.ts --send you@example.com
```

`--check` does not send. `--send` sends a real message to the supplied address and prints only the environment and provider message ID. A provider acceptance response is not proof of inbox delivery; check the mailbox and Resend email status.

## Operations

There is no pause variable. For an emergency stop, revoke or remove the environment's Resend API key. This prevents new provider sends but can mark queued jobs failed; restore the key and use the authorized retry flow after reviewing those jobs. The scheduler and notification queue remain active.

The webhook verifies raw-body Svix signatures, tracks delivery/bounce/complaint events, and applies recipient suppression. Definite failures can be retried from authorized order details; uncertain outcomes require reconciliation before retrying. Resend idempotency keys expire after 24 hours, so do not blindly replay an ambiguous send after that window.

If a deployment reports `Aborting the upload operation because of conflicts`, inspect the configuration diff before retrying. Values under remote `vars` are plaintext even when named `SECRET`; `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` must be Cloudflare Secrets. If a webhook signing secret was exposed, rotate it in Resend. Keep strict deployment checks enabled.

## Verification status

As of 2026-10-26, Resend domain verification and a direct external test send succeeded. Cloudflare Worker secrets, migrations, webhook registration, deployments, and scheduled order-to-inbox flows still require verification in their respective environments.
