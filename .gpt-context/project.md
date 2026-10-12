# Project profile

## Status

As of 2026-10-12, the repository contains a pnpm/Turborepo workspace and a Next.js App Router app at `apps/web`, configured for Cloudflare Workers through vinext. The English marketing homepage, an About Product page, product page, and preliminary information pages are statically generated. The preliminary information pages are `noindex` while current label and evidence details remain unverified; see [architecture.md](architecture.md). A GitHub Actions workflow checks pull requests and deploys pushes to `main`; required Cloudflare secrets are configured and explicitly passed through Turborepo for deployment. Production deployments succeeded through workflow run #9; runs #10 and #11 failed during Cloudflare API calls after successful builds. The account dashboard shows a configured `workers.dev` subdomain; custom-domain status has not been verified. On-site payment/admin are not implemented. The current conversion is an outbound Amazon link; on-site payment and a small admin area remain future possibilities.

## Maintenance

Update this profile as the project is established. Record verified facts and point to the relevant files; do not infer details that are not present in the repository.
