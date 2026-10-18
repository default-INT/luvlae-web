# Project profile

## Status

As verified on 2026-10-18, the repository contains a pnpm/Turborepo workspace and a Next.js App Router app at `apps/web`, configured for Cloudflare Workers through vinext. The English marketing homepage, an About Product page, product page, and preliminary information pages are statically generated, with page requests still handled by the Worker using a read-only Static Assets cache. The preliminary information pages are `noindex` while current label and evidence details remain unverified; see [architecture.md](architecture.md). The configured GitHub Actions workflow builds pull requests without deploying, deploys `main` to a separate stage Worker on `workers.dev`, and deploys creation/updates of the highest numbered existing `release/release-x.y.z` branch (with a current-head check); required Cloudflare secrets are configured and explicitly passed through Turborepo for deployment. Production runs #12 and #13 succeeded on 2026-10-12; #13 deployed current commit `398b900`. `www.luvlae.com` serves vinext responses; the apex redirects to `www`. Cloudflare account settings and domain mapping remain uninspected. See the [deployment audit](deployment.md). Commerce DB/access APIs and admin authentication are implemented; the admin UI and Stripe payment integration remain pending. Stage schema migration and transaction rollback are verified. The current conversion is an outbound Amazon link; on-site payment and a small admin area remain future possibilities.

## Maintenance

On 2026-10-18 the user selected MongoDB Atlas for future orders and requested consideration of a QA environment. Local stage Atlas connectivity is verified; stage migration and transaction rollback are verified after granting dbAdmin; deployed-Worker connectivity is still unverified. Stage configuration is implemented in the repository; its remote Worker/hostname has not yet been provisioned or verified here. The user selected automatic Cloudflare hostnames for stage and pushes to `main` as its deployment trigger; production release routing is configured locally but has not yet been verified in Actions. See the [QA proposal](qa-environment.md); its specific topology and rollout remain proposals.

Update this profile as the project is established. Record verified facts and point to the relevant files; do not infer details that are not present in the repository.

See [commerce API implementation](../apps/web/docs/commerce-api.md) for current migration, API and verification status. Frontend purchase behavior is unchanged.
