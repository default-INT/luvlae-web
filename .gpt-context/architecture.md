# Luvlae.com architecture and technology

## Status and agreed requirements

The initial monorepo and Next.js app were created on 2026-10-02. Cloudflare Workers integration is configured and verified locally, and a GitHub Actions workflow is implemented. The account dashboard shows a configured `workers.dev` subdomain, but production deployment has not yet succeeded; verify that the GitHub `CLOUDFLARE_ACCOUNT_ID` secret points to this same account. A custom domain is not configured. The homepage and initial product/information routes are implemented; no backend or database exists. The user selected these requirements:

- Next.js, using the latest suitable stable release **at implementation time**, App Router, and TypeScript.
- Static generation (SSG) and server rendering (SSR), chosen per route.
- Feature-Sliced Design (FSD) for application code.
- A Turborepo monorepo from the start.
- Room for a small backend for on-site payment and possibly a small admin area later.
- Named exports by default, single quotes, semicolons, and trailing commas in multiline structures; detailed conventions are in [fsd-rules.md](fsd-rules.md) and [eslint-rules.md](eslint-rules.md).
- SCSS Modules for component styles, with each module named `styles.module.scss`; shared design tokens use CSS custom properties.
- Internationalization uses English at the unprefixed URL (`/`, `/products`) and locale prefixes for future languages (`/fr`, `/fr/products`). Translation source files use YAML. See [i18n architecture](#internationalization) below.
- The new site will be built from scratch using the user-provided [Figma homepage](https://www.figma.com/design/GwBCFwQF7ScFBZ0ua5mzrg/Sandbox?node-id=154-6351) as its visual reference.

Initial pinned toolchain: Next.js and `eslint-config-next` 16.3.8, React 19.2.8, Turborepo 2.11.6, pnpm 9.15.0, and Node.js >=22.0.0. Node 22 is required by the selected vinext toolchain. Check current release and security guidance before upgrades; these versions are the initial setup, not a policy to stay on them indefinitely. Payment provider, database, and content system remain undecided.

## Cloudflare deployment

- Cloudflare Workers is the selected hosting platform. The app uses Cloudflare's recommended vinext adapter, currently pinned at 1.0.1. vinext is in beta; run `vinext check` and review compatibility when upgrading it or Next.js.
- The app keeps the standard Next.js `dev`, `build`, and `start` commands. Cloudflare commands are `pnpm build:cloudflare`, `pnpm preview:cloudflare`, and `pnpm deploy:cloudflare` from the repository root. Cloudflare deploy requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; these credentials belong in the local environment or GitHub Secrets, never in tracked files.
- Public routes opt into build-time prerendering and Cloudflare Static Assets. Routes without static generation can run in the Worker at request time. The root English homepage is statically served at `/`; future non-default locales live under `app/(localized)/[lang]`. `app/(default)` provides unprefixed English routes, and Proxy redirects explicit `/en/...` URLs to their unprefixed canonical paths.
- YAML files in `src/shared/config/i18n/messages/` remain the translation source. `scripts/generate-dictionaries.mjs` parses them into the committed `src/shared/config/i18n/dictionary-sources.json` bundle input before Next.js and vinext development, builds, and type checks. This avoids runtime filesystem reads in Workers while retaining YAML authoring.
- `apps/web/cloudflare.config.ts` currently names the Worker `luvlae-web`; `.github/workflows/cloudflare-workers.yml` runs lint and type checks, builds on pull requests, and deploys pushes to `main`. The required `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` GitHub Actions secrets are configured. `turbo.json` passes them through only for the uncached deploy task, since Turborepo's strict environment mode otherwise filters them out. A custom domain and persistent ISR/data cache are not configured yet. The initial Static Assets cache is read-only and updates on deployment.

## Planned shape

The workspace currently has one deployable app, `apps/web`, with root `turbo.json`, `pnpm-workspace.yaml`, and `pnpm-lock.yaml`. The package manager is pnpm. Reserve `packages/` for genuinely shared code or tooling; do not split a single-use domain into packages merely because this is a monorepo. `apps/api` or `apps/admin` may be added later if their size or deployment needs justify separate apps.

Keep the Next.js `apps/web/app/` directory focused on route entry points, layouts, metadata files, and Route Handlers. Place FSD code in `apps/web/src/` according to [fsd-rules.md](fsd-rules.md). Route files compose or re-export page code from FSD; route-specific Next.js exports remain easy to find in the route entry point. Packages outside `apps/web` are workspace packages, not automatically FSD layers.

## Development commands

- `pnpm dev` — run the Next.js development server through Turborepo.
- `pnpm build` — production build through Turborepo (Next.js Webpack builder). The default Turbopack build stalled locally during the 2026-10-06 implementation; the Webpack build completed successfully.
- `pnpm lint` — ESLint for the workspace app.
- `pnpm typecheck` — generate current Next.js route types and run the TypeScript check for the workspace app.
- `pnpm start` — start the built app through Turborepo.
- `pnpm build:cloudflare` — build the Workers output through Turborepo.
- `pnpm preview:cloudflare` — build and preview in the local Workers runtime.
- `pnpm deploy:cloudflare` — build and deploy the Worker; requires Cloudflare credentials.

The app uses Next.js App Router, TypeScript, Sass, CSS Modules, and an ESLint flat config. Shared TypeScript defaults live in `tsconfig.base.json`; app aliases map `@/*` to `apps/web/src/*`.

## Rendering and content

- Prerender public, non-personalized content when its source and update workflow permit it: home, product, evidence, safety, instructions, and guides. Choose a deliberate revalidation or redeployment path when content changes.
- Use request-time rendering for future user-specific checkout, order, and admin views. Do not enable `output: 'export'` for an application expected to use SSR, Route Handlers, and payment callbacks.
- Keep Server Components by default. Introduce Client Components only around interactions or browser-only APIs. Keep secrets, privileged data access, and provider credentials on the server.
- Keep product facts separate from page presentation so a future CMS or admin workflow can replace the data source. The exact initial content format is undecided.

The initial Figma-based homepage lives in `src/_pages/home/`, with reusable navigation, footer, links, and reveal motion in `src/widgets/` and `src/shared/ui/`. Product and lifestyle images live in `public/images/` with descriptive filenames; reusable SVG icons live in `public/images/icons/`. The Manrope font is self-hosted in `public/fonts/`. English homepage copy is authored in `src/shared/config/i18n/messages/en.yaml`. The indexable product route uses `src/_pages/product/`. The Ingredients route has its own `src/_pages/ingredients/` composition with copy in the YAML dictionary; other preliminary educational routes use `src/_pages/information/model/pages.ts` and explicit static entry points in `app/(default)/`. Those information routes remain `noindex` until current label and evidence details are verified. `app/sitemap.ts` lists only indexable routes. Motion uses CSS and a small IntersectionObserver wrapper, with reduced-motion support. The product gallery uses native radio controls and CSS image transitions; its FAQ uses native `details` with CSS `::details-content` animation so basic interaction does not depend on hydration. The Figma file supplied a desktop homepage; exact mobile frames were not verified, so responsive layouts are implementation decisions.

The current conversion is an outbound Amazon click. The URL map, content evidence rules, metadata, structured data, indexing, and analytics requirements are in [seo-requirements.md](seo-requirements.md). In particular, do not publish a consolidated ingredient list or wear time until the conflicting source records are resolved; see [the product note](products/luvlae-berberine-patches.md). Do not model Amazon price, availability, or reviews as on-site purchase data.

Optional GA4 wiring lives in `src/_app/analytics/`. It is disabled unless `NEXT_PUBLIC_GA_MEASUREMENT_ID` is supplied at build time. GitHub Actions reads this as a repository Actions variable; the Cloudflare workflow passes it to the build, and Turborepo accounts for it in build/deploy tasks. Amazon links carry explicit event/location attributes; the client tracker sends `amazon_outbound_click` when GA4 is configured. See `apps/web/README.md` for setup.

## Internationalization

- English is the default locale and has no URL prefix. Future non-default locales use a prefix, for example `/fr/products`.
- `apps/web/proxy.ts` redirects explicit `/en/...` paths to unprefixed canonical URLs. The `(default)` App Router group serves English routes without a URL prefix, and `(localized)/[lang]` serves future non-default locales at prefixed URLs. This keeps the root page statically addressable as `/` for Cloudflare Static Assets.
- Supported locales are enumerated in `src/shared/config/i18n/locales.ts`. The initial locale list contains only `en`; future non-default locale params are generated at build time.
- YAML source dictionaries live in `src/shared/config/i18n/messages/<locale>.yaml`. Shared site navigation, footer, and informational UI copy belong in the dictionary; `src/shared/lib/i18n/interpolate.ts` replaces `{{name}}` placeholders with supplied text or numeric values. `scripts/generate-dictionaries.mjs` validates and compiles dictionaries into `src/shared/config/i18n/dictionary-sources.json`; server-only loading and shape validation live in `src/shared/lib/i18n/`. Keep browser components from importing the server loader.
- Public pages load translations while rendering on the server, then static routes embed translated output at build time. Future request-rendered routes use the bundled dictionary data at runtime without filesystem reads. Do not read request headers or cookies in public page/layout rendering just to select a language. Locale selection is explicit in the URL.
- When adding a locale, add its code and YAML file, validate it against the dictionary contract/key structure, generate its route params, and add locale-aware canonical/alternate metadata. The current default English canonical URL omits `/en`.

The route prefix behavior follows Next.js App Router's dynamic segment and Proxy model. See [internationalization](https://nextjs.org/docs/app/guides/internationalization), [Proxy](https://nextjs.org/docs/app/getting-started/proxy), and [output file tracing](https://nextjs.org/docs/app/api-reference/config/next-config-js/output).

## Future server boundary

If on-site payment is approved, begin with server-side operations and Route Handlers inside `apps/web` while the backend remains small. Keep order calculation and payment state on the server; treat callbacks/webhooks and Server Actions as public entry points that require validation and appropriate authorization. Add persistent storage, provider integration, and admin authentication only against concrete requirements. Reassess a separate `apps/api` or `apps/admin` when independent deployment or substantial backend logic makes it useful.

## Open decisions

- Exact shared tooling packages as packages are introduced.
- Custom domain and persistent ISR/data cache, if needed.
- Content authoring workflow and whether a CMS is needed.
- Exact mobile layouts from the Figma design and final design-token extraction. Current responsive breakpoints are implementation decisions in the component SCSS Modules.
- Scope, market, provider, data model, and operational requirements for on-site checkout.
- Admin users, roles, and whether the admin lives in `apps/web` or a separate app.

## References

- [Next.js App Router documentation](https://nextjs.org/docs/app)
- [Turborepo repository structure](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository)
- [FSD with Next.js](https://feature-sliced.design/docs/guides/tech/with-nextjs)
