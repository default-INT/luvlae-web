# @luvlae/web

Next.js App Router application. Route entry points live in `app/`; application code follows the FSD conventions documented in the repository-root `.gpt-context/fsd-rules.md`.

Run the development server from the repository root with `pnpm dev`.

## Analytics

Set `NEXT_PUBLIC_GA_MEASUREMENT_ID` to a valid GA4 measurement ID (`G-...`) at build time to load the Google tag. Without it, no analytics script is loaded. For GitHub Actions deployments, add it as a repository Actions variable with that name; the Cloudflare workflow passes it to the build, and Turborepo includes it in the relevant task environments and cache hashes. Amazon links emit the custom `amazon_outbound_click` event with `link_url`, `link_location`, and `page_path` when GA4 is configured. Mark that event as a key event in GA4 if it should count as a conversion. The measurement ID and Search Console setup are not stored in this repository.
