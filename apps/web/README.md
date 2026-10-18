# @luvlae/web

Next.js App Router application. Route entry points live in `app/`; application code follows the FSD conventions documented in the repository-root `.gpt-context/fsd-rules.md`.

Run the development server from the repository root with `pnpm dev`.

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
