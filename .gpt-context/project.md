# Project profile

## Status

As of 2026-10-06, the repository contains a pnpm/Turborepo workspace and a Next.js App Router app at `apps/web`, configured for Cloudflare Workers through vinext. The Figma-based English homepage, a product page, and preliminary information pages are statically generated. The preliminary information pages are `noindex` while current label and evidence details remain unverified; see [architecture.md](architecture.md). A GitHub Actions workflow checks pull requests and deploys pushes to `main`; required Cloudflare secrets are configured and explicitly passed through Turborepo for deployment. The account dashboard shows a configured `workers.dev` subdomain, but first deployment is not yet successful; confirm that the GitHub `CLOUDFLARE_ACCOUNT_ID` secret identifies this account. No custom domain is connected. On-site payment/admin are not implemented. The current conversion is an outbound Amazon link; on-site payment and a small admin area remain future possibilities.

## Maintenance

Update this profile as the project is established. Record verified facts and point to the relevant files; do not infer details that are not present in the repository.
