# Cloudflare deployment audit

## Production route conflict — 2026-10-27

A subsequent user-supplied log showed strict deployment also comparing remote `workers_dev: true` / `preview_urls: true` with locally generated false values. Production now explicitly sets `workersDev: true` and `previewUrls: true` to preserve the existing remote settings; stage remains `workersDev: true`, `previewUrls: false`. Remote redeployment remains unverified.

A user-supplied production release log showed strict deployment aborting because local configuration omitted the existing Dashboard route `{ pattern: '*.luvlae.com/*', zone_name: 'luvlae.com' }`. `apps/web/cloudflare.config.ts` now declares the matching production-only `triggers.fetch({ pattern: '*.luvlae.com/*', zone: 'luvlae.com' })`, alongside the email scheduler. Stage/development have no custom-domain fetch trigger. Strict deployment checks remain enabled. This preserves the existing route rather than removing it during upload; successful remote redeployment remains unverified. The accompanying vinext legacy-fallback warnings were not the reported upload failure.

Verified on 2026-10-18 against commit `398b900` using repository configuration, installed adapter source, a successful local Node 22.22.2 Vite build, GitHub's public Actions API, and production HTTP responses. No deployment was performed.

## Production evidence

- Latest Actions run [#13](https://github.com/default-INT/luvlae-web/actions/runs/38258374695) succeeded on 2026-10-12 for `398b900426a98a488ef1c82e2b1a3e0d42bd1afb`; lint, typecheck, and deployment steps succeeded. Run #12 also succeeded after deployment retries were added.
- `https://luvlae.com/` returns 307 to `https://www.luvlae.com/`. The redirect response includes `x-vercel-id`; the redirect's ownership/configuration was not inspected.
- `https://www.luvlae.com/` and `/products/berberine-patches` return 200 with `x-vinext-cache: HIT`, `x-nextjs-cache: HIT`, and `Cache-Control: s-maxage=31536000, stale-while-revalidate`.
- `/en/products/berberine-patches` returns 308 to `/products/berberine-patches`. A production content-hashed CSS URL returns 200 with `CF-Cache-Status: HIT` and immutable one-year caching. External `/_vinext/static-cache/index.json` returns 404.
- The homepage includes a Google tag script, confirming GA4 build configuration is enabled in this production output. No measurement ID is recorded here.
- Cloudflare account settings, Worker version/traffic allocation, plan, runtime metrics, dashboard-only bindings/secrets, and custom-domain mapping were not inspected. Public HTTP responses confirm serving behavior, not those settings.

## Build and deployment

- [Workflow](../.github/workflows/cloudflare-workers.yml): PRs check and build stage without deploying; pushes to `main` check, build and deploy stage; eligible release branch creation/updates build with Vite and invoke the environment-checked wrapper and `vinext-cloudflare deploy --skip-build --env <mode>`, deploying using `cf` for this typed configuration. Transient retries use `--skip-build`. Standard `next build` output in `.next` is not the Workers deployment artifact.
- [Worker config](../apps/web/cloudflare.config.ts): `luvlae-web`, entrypoint `vinext/server/fetch-handler`, compatibility date `2026-10-02`, flag `nodejs_compat`, only declared binding `ASSETS`.
- [Vite config](../apps/web/vite.config.ts) enables prerendering and `staticAssetsAdapter()`. Output is `apps/web/.cloudflare/output/v0/workers/default/{bundle,assets}` plus `worker.config.json`; `dist/server/vinext-prerender.json` records prerender results.
- Reproduce without deploying: generate dictionaries, then run `vite build` in `apps/web` with Node 22. Local prerendering requires permission to listen on localhost. The sandboxed attempt failed with `listen EPERM`; the unrestricted local build completed. Docker emitted an unavailable-daemon diagnostic, but this build did not require it to succeed.

## Artifact measurements

Local build sizes below exclude `.vite` metadata and `.assetsignore`. They are filesystem totals, not Cloudflare upload sizes or runtime memory. The local build did not set the production GA4 variable, and build identities differ from production.

| Output | Files | Bytes |
| --- | ---: | ---: |
| Server bundle | 128 | 1,701,142 |
| Static Assets | 75 | 8,364,891 |
| Server JavaScript subset | 118 | 1,651,244 |
| Browser JavaScript subset | 13 | 529,654 |
| Prerendered HTML subset | 10 | 457,010 |
| Prerendered RSC subset | 9 | 242,035 |

- Sum of individually gzip-compressed server files: 408,648 bytes; this is an estimate, not a deployment size measurement.
- Nine public pages prerender: `/`, `/about`, `/about-product`, `/berberine-patch-safety`, `/faq`, `/how-to-use-berberine-patches`, `/ingredients`, `/products/berberine-patches`, `/science/berberine-patches`. `/404` also prerenders; `/:lang` is skipped because there are no non-default locale params. The cache index contains ten HTML and nine RSC entries.
- No public-path HTML aliases such as `assets/index.html` exist. All HTML files are under `assets/_vinext/static-cache/<hash>.html`. Page requests therefore enter vinext routing and read prebuilt HTML/RSC through `ASSETS.fetch`; static generation avoids rendering per request but does not itself bypass Worker execution. Images, CSS, JS, and fonts use asset-first routing when matched. The internal cache prefix uses Worker-first routing and is not externally exposed as a static directory.
- Bundle includes routing/proxy, server page/layout modules, bundled dictionaries, React RSC/SSR and client-component SSR support, and cache/framework code. Static Assets contain browser JS/CSS, public images/fonts, generated font assets, and prerendered responses. No sourcemaps were found. Full repository, development tooling, and `node_modules` are not uploaded wholesale.
- The four PNG assets total 6,118,033 bytes, roughly 73% of Static Assets bytes; image delivery is a more obvious size target than server code, although no optimization was made in this audit.

## Runtime boundary

- Only `ASSETS` is declared in code. D1, KV, R2, Durable Objects, Queues, image optimization bindings, cron triggers, and application runtime secrets are not configured here. Dashboard-only additions remain unknown.
- The Worker can handle dynamic requests, external `fetch`, cookies/headers, and future Route Handlers/SSR. No application API routes, checkout backend, or Server Actions are currently implemented. Framework action support in the bundle does not imply application actions exist.
- Static cache adapter `set()` and `revalidateTag()` are no-ops; this cache updates through deployment. It is not persistent writable ISR/data storage.
- Dictionaries are compiled from YAML into bundled JSON before the CI deployment via the typecheck step. No runtime access to repository YAML is needed.
- Cloudflare deployment credentials belong to the CI process; `passThroughEnv` does not itself create Worker runtime secrets. `NEXT_PUBLIC_GA_MEASUREMENT_ID` is a public build-time value.
- `nodejs_compat` provides supported Node APIs within Workers, not an OS/container. Current Cloudflare documentation describes a read-only `/bundle` VFS and request-local, memory-backed `/tmp`; neither exposes the repository or persistent disk. Static Assets are accessed through their binding.

References: [asset routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/), [Node compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/), [virtual filesystem](https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/), [runtime limits](https://developers.cloudflare.com/workers/platform/limits/). Check current documentation and the actual account plan before capacity decisions.

## Production release policy — 2026-10-18

- Workflow changes are local configuration, not yet verified by a GitHub Actions run. Production hosting, credentials and transient retries remain unchanged.
- `create` handles release branch creation (including creation via GitHub UI/API); `push` handles subsequent commits. Release-creation pushes are skipped to avoid duplicate deployment. Deleted branches do not deploy. PRs into `main` check/build without deploying; pushes to `main` deploy stage.
- Accepted names: `release/release-x.y.z`, where major, minor and patch are nonnegative integers without leading zeros. “Latest” is the highest numeric version among existing remote branches, comparing major first, then minor, then patch (for example, `1.0.0 > 0.99.99` and `1.10.0 > 1.9.99`). Prerelease/build suffixes are not accepted. Do not delete the highest release while older release branches remain writable: deleting it makes the next highest branch eligible again.
- `.github/scripts/production-release.mjs` queries live remote refs and requires both the highest release name and its current head SHA to match the event. Lookup errors fail closed. Selection is repeated before each deployment attempt; the build finishes before the final selection check; a branch/head change during the actual upload is only reflected in a subsequent run.
- All release runs share the `cloudflare-workers-production` concurrency group, without cancelling an active deployment. GitHub does not guarantee FIFO ordering and may replace pending runs; obsolete runs are skipped by the live branch/head check.
- Merge these workflow/script changes into `main` before creating the first release from that updated commit. Existing release branches need these changes before they can follow the new policy.
- Stage is configured: pushes to `main`, Worker `luvlae-web-stage`, and an automatic Cloudflare hostname (no custom domain). Its first remote deployment remains unverified. See [architecture](architecture.md#stage-deployment-2026-10-18) and [commands](../apps/web/README.md#cloudflare-environments).
- Guard checks: `node --test .github/scripts/production-release.test.mjs`.


## Stage implementation verification — 2026-10-18

- Stage and production Cloudflare builds pass with Node 22.22.2. ESLint, TypeScript and seven release/artifact guard tests pass.
- Local Workers preview: stage `/`, product page, robots, sitemap and missing-route 404 all carry `X-Robots-Tag: noindex, nofollow, noarchive`; CSS served by Static Assets does too. Homepage has no Google tag, robots disallows crawling, sitemap has no URL entries.
- After a stage build, a fresh production build and local preview passed: homepage/robots/sitemap return 200 without stage noindex, production robots allows crawling and sitemap lists production URLs.
- Stage uses a dedicated Worker wrapper because `next.config` headers did not cover prerender cache hits. Its generated `_headers` appends noindex while preserving vinext’s immutable asset cache rules. Builds clear prior output; the artifact guard rejects stage indexing directives in production and mismatched environment/Worker markers.
- No local Cloudflare credentials or auth profiles were available. No remote Worker was deployed and no live stage hostname was verified. After merging to `main`, Actions will deploy using existing repository secrets, provided the token permits the new Worker and the account has a `workers.dev` subdomain.
