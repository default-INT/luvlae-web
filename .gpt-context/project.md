# Project profile

## Status

As of 2026-10-02, the repository contains a pnpm/Turborepo workspace and a Next.js App Router app at `apps/web`, configured for Cloudflare Workers through vinext. The English homepage is prerendered to Cloudflare Static Assets and local Worker preview succeeds. A GitHub Actions workflow checks pull requests and deploys pushes to `main`; Cloudflare GitHub secrets still need to be configured before the first deployment. No custom domain is connected. The build, ESLint, TypeScript, and i18n conventions are recorded in [architecture.md](architecture.md). Product pages and on-site payment/admin are not implemented. The current SEO plan describes an Amazon outbound purchase flow; on-site payment and a small admin area remain future possibilities.

## Maintenance

Update this profile as the project is established. Record verified facts and point to the relevant files; do not infer details that are not present in the repository.
