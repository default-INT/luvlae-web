# @luvlae/web

Next.js App Router application. Route entry points live in `app/`; application code follows the FSD conventions documented in the repository-root `.gpt-context/fsd-rules.md`.

Run the development server from the repository root with `pnpm dev`.

## MongoDB environment variables

The MongoDB variable contract is declared in `.env.example`. Fill these entries in the ignored `apps/web/.env` for local development using stage credentials:

- `NEXT_MONGODB_USERNAME` — Atlas database user.
- `NEXT_MONGODB_PASSWORD` — database user's raw password.
- `NEXT_MONGODB_URI` — Atlas `mongodb+srv://` URI containing the host and connection options, without username/password; credentials are supplied separately through driver options.
- `NEXT_MONGODB_DB_NAME` — target database (`luvlae_stage` or `luvlae_prod`, proposed names).

These are server-only variables; do not rename them to `NEXT_PUBLIC_*`, expose them through Next.js `env` config, or import credentials into client modules. `cloudflare.config.ts` declares all four names with `bindings.secret()` for both Workers; declarations do not upload their values. The MongoDB driver uses request-scoped connections.

## Stripe stage secrets

`apps/web/.env.example` also lists the server-only Stripe variables. For local development, put the Stripe test-mode values in the ignored `apps/web/.env.local`. The stage Worker declares these two Cloudflare runtime secrets. Local forwarding uses the CLI signing secret, which differs from the stage endpoint secret:

- `STRIPE_SECRET_KEY` — Stripe sandbox secret API key beginning with `sk_test_`; used by the server to retrieve Checkout Sessions and verify current payment state; Session creation is a later phase.
- `STRIPE_WEBHOOK_SECRET` — signing secret beginning with `whsec_`; Stripe provides it for the stage webhook endpoint after that endpoint is created. Used to verify incoming webhook signatures.

In Cloudflare Dashboard, open **Workers & Pages → `luvlae-web-stage` → Settings → Variables and Secrets → Add**, choose **Secret**, and create both names with their stage values. The webhook signing secret is not the API key and is not available until a webhook endpoint exists. Never use `sk_live_` for stage, expose either value as `NEXT_PUBLIC_*`, or put real values in tracked files. Embedded Checkout creation and webhook settlement are implemented with explicit activation and test/live isolation. See [live preparation and runtime configuration](docs/stripe-live-readiness.md).

### Cloudflare runtime secrets

In Cloudflare Dashboard, open **Workers & Pages → the Worker → Settings → Variables and Secrets → Add**, choose **Secret**, and add all four `NEXT_MONGODB_*` names from the MongoDB section. Save/deploy the settings. Repeat with separate values for each Worker:

| Worker | Credentials |
| --- | --- |
| `luvlae-web-stage` | Stage Atlas user, URI, and database; same target as local development |
| `luvlae-web` | Production Atlas user, URI, and database |

Add these secrets before deploying the updated Worker configuration: the declared secrets are required. They are runtime bindings, so GitHub Actions does not need MongoDB credentials to build or deploy. Keep the existing Cloudflare deployment credentials in GitHub; do not copy MongoDB values into the workflow or tracked configuration. Remote secret presence and values have not been verified from this workspace.

The user selected Atlas IP access entry `0.0.0.0/0` for stage to support local and stage connections. This permits incoming connections from any IPv4 address; database authentication is still required. The remote Atlas setting has not been changed or verified here. Production network access must be configured separately.

## Analytics

Set `NEXT_PUBLIC_GA_MEASUREMENT_ID` to a valid GA4 measurement ID (`G-...`) at build time to load the Google tag. Without it, no analytics script is loaded. For GitHub Actions deployments, add it as a repository Actions variable with that name; the Cloudflare workflow passes it to the build, and Turborepo includes it in the relevant task environments and cache hashes. Amazon links emit the custom `amazon_outbound_click` event with `link_url`, `link_location`, and `page_path` when GA4 is configured. Mark that event as a key event in GA4 if it should count as a conversion. The measurement ID and Search Console setup are not stored in this repository.

## Cloudflare environments

Run from the repository root with Node 22:

- `DEPLOY_ENV=stage pnpm build:cloudflare` — build `luvlae-web-stage`.
- `DEPLOY_ENV=stage pnpm preview:cloudflare` — build and preview stage locally.
- `DEPLOY_ENV=stage pnpm deploy:cloudflare` — build and deploy stage using Cloudflare credentials.
- `DEPLOY_ENV=production pnpm deploy:cloudflare` — build and deploy the existing production Worker.

`DEPLOY_ENV` defaults to `production` for existing local commands; unknown values fail. The build/deploy wrapper passes the matching Vite/Cloudflare mode, sets `NEXT_PUBLIC_APP_ENV`, and verifies the output Worker name and environment marker before upload. To upload an existing build, use `DEPLOY_ENV=stage pnpm --filter @luvlae/web exec node scripts/cloudflare.mjs deploy --skip-build` (or `production` for a matching production build).

GitHub Actions deploys pushes to `main` to stage and the highest numbered `release/release-x.y.z` branch to production. PRs into `main` build stage without deployment credentials. Existing repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` authenticate both Workers in the same account; the token must allow deployment of the new stage Worker. Stage uses `https://luvlae-web-stage.<account-subdomain>.workers.dev`; the actual account subdomain is shown after deployment. No custom domain is configured, and preview URLs are disabled for stage.

Stage always disables GA4, even if a measurement ID was supplied. It returns `X-Robots-Tag: noindex, nofollow, noarchive` from its Worker wrapper and static-assets `_headers`, disallows crawling in `robots.txt`, and returns an empty sitemap. Production metadata/canonical URLs are retained as content references. Cloudflare Access is not configured by this repository: stage is publicly reachable unless access restrictions are added in the account. Do not put private data on it. Future database/payment/email integrations need separate test resources and credentials.

## Commerce database and API

The server foundation is implemented without frontend changes. See [the API and database runbook](docs/commerce-api.md)
for endpoints, request bodies, migration/admin commands, transaction history and current integration boundaries.
Use Node >=22. Database commands are app-local: `pnpm --filter @luvlae/web db:migrate`, `db:check`,
`db:admin:create`, `db:admin:reset-password`; set `DB_CONFIRM_NAME` to the exact target database name.
`pnpm --filter @luvlae/web test:server` runs synthetic MongoDB replica-set integration tests.

Prices and stock are supplied by an administrator; there are no production product seeds.
Embedded Checkout, protected result pages and signed webhook settlement are implemented. Checkout defaults disabled; see [local Stripe testing](docs/stripe-local.md) and [test/live activation](docs/stripe-live-readiness.md).
Stage Atlas migration and transaction rollback check are verified after granting `dbAdmin`.
Missing/mismatched `DB_CONFIRM_NAME` reports `DB_CONFIRMATION_REQUIRED` before connecting.
