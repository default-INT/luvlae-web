# Luvlae.com architecture and technology

## Status and agreed requirements

The initial monorepo and Next.js app were created on 2026-10-02. No product pages, backend, database, or deployment are implemented yet. The user selected these requirements:

- Next.js, using the latest suitable stable release **at implementation time**, App Router, and TypeScript.
- Static generation (SSG) and server rendering (SSR), chosen per route.
- Feature-Sliced Design (FSD) for application code.
- A Turborepo monorepo from the start.
- Room for a small backend for on-site payment and possibly a small admin area later.
- Named exports by default, single quotes, semicolons, and trailing commas in multiline structures; detailed conventions are in [fsd-rules.md](fsd-rules.md) and [eslint-rules.md](eslint-rules.md).
- SCSS Modules for component styles, with each module named `styles.module.scss`; shared design tokens use CSS custom properties.
- Internationalization uses English at the unprefixed URL (`/`, `/products`) and locale prefixes for future languages (`/fr`, `/fr/products`). Translation source files use YAML. See [i18n architecture](#internationalization) below.
- The new site will be built from scratch using the user-provided [Figma homepage](https://www.figma.com/design/GwBCFwQF7ScFBZ0ua5mzrg/Sandbox?node-id=154-6351) as its visual reference.

Initial pinned toolchain: Next.js and `eslint-config-next` 16.3.8, React 19.2.8, Turborepo 2.11.6, pnpm 9.15.0, and Node.js >=20.9.0. Check current release and security guidance before upgrades; these versions are the initial setup, not a policy to stay on them indefinitely. Payment provider, database, hosting service, and content system remain undecided.

## Planned shape

The workspace currently has one deployable app, `apps/web`, with root `turbo.json`, `pnpm-workspace.yaml`, and `pnpm-lock.yaml`. The package manager is pnpm. Reserve `packages/` for genuinely shared code or tooling; do not split a single-use domain into packages merely because this is a monorepo. `apps/api` or `apps/admin` may be added later if their size or deployment needs justify separate apps.

Keep the Next.js `apps/web/app/` directory focused on route entry points, layouts, metadata files, and Route Handlers. Place FSD code in `apps/web/src/` according to [fsd-rules.md](fsd-rules.md). Route files compose or re-export page code from FSD; route-specific Next.js exports remain easy to find in the route entry point. Packages outside `apps/web` are workspace packages, not automatically FSD layers.

## Development commands

- `pnpm dev` — run the Next.js development server through Turborepo.
- `pnpm build` — production build through Turborepo (Next.js default Turbopack builder).
- `pnpm lint` — ESLint for the workspace app.
- `pnpm typecheck` — TypeScript check for the workspace app.
- `pnpm start` — start the built app through Turborepo.

The app uses Next.js App Router, TypeScript, Sass, CSS Modules, and an ESLint flat config. Shared TypeScript defaults live in `tsconfig.base.json`; app aliases map `@/*` to `apps/web/src/*`.

## Rendering and content

- Prerender public, non-personalized content when its source and update workflow permit it: home, product, evidence, safety, instructions, and guides. Choose a deliberate revalidation or redeployment path when content changes.
- Use request-time rendering for future user-specific checkout, order, and admin views. Do not enable `output: 'export'` for an application expected to use SSR, Route Handlers, and payment callbacks.
- Keep Server Components by default. Introduce Client Components only around interactions or browser-only APIs. Keep secrets, privileged data access, and provider credentials on the server.
- Keep product facts separate from page presentation so a future CMS or admin workflow can replace the data source. The exact initial content format is undecided.

The current conversion is an outbound Amazon click. The URL map, content evidence rules, metadata, structured data, indexing, and analytics requirements are in [seo-requirements.md](seo-requirements.md). In particular, do not publish a consolidated ingredient list or wear time until the conflicting source records are resolved; see [the product note](products/luvlae-berberine-patches.md). Do not model Amazon price, availability, or reviews as on-site purchase data.

## Internationalization

- English is the default locale and has no URL prefix. Future non-default locales use a prefix, for example `/fr/products`.
- `apps/web/proxy.ts` rewrites unprefixed paths internally to the default locale segment and redirects explicit `/en/...` paths to their unprefixed canonical form. App Router pages use the single `app/[lang]/` route tree, which keeps the locale available to the root layout and avoids duplicating route files. The browser-visible English URLs remain unprefixed.
- Supported locales are enumerated in `src/shared/config/i18n/locales.ts`. The initial locale list contains only `en`; localized route params are generated at build time so public pages can be statically rendered.
- YAML source dictionaries live in `src/shared/config/i18n/messages/<locale>.yaml`. Server-only loading and parsing live in `src/shared/lib/i18n/`; dictionary shape is described in the adjacent TypeScript contract. Keep browser components from importing the YAML loader.
- Public pages load translations while rendering on the server. Static routes embed translated output during `next build`; future request-rendered routes read the YAML at runtime. `next.config.ts` includes dictionary files in output tracing for deployments that need runtime reads. Do not read request headers or cookies in public page/layout rendering just to select a language; that would opt routes into request-time rendering. Locale selection is explicit in the URL.
- When adding a locale, add its code and YAML file, validate it against the dictionary contract/key structure, generate its route params, and add locale-aware canonical/alternate metadata. The current default English canonical URL omits `/en`.

The route prefix behavior follows Next.js App Router's dynamic segment and Proxy model. See [internationalization](https://nextjs.org/docs/app/guides/internationalization), [Proxy](https://nextjs.org/docs/app/getting-started/proxy), and [output file tracing](https://nextjs.org/docs/app/api-reference/config/next-config-js/output).

## Future server boundary

If on-site payment is approved, begin with server-side operations and Route Handlers inside `apps/web` while the backend remains small. Keep order calculation and payment state on the server; treat callbacks/webhooks and Server Actions as public entry points that require validation and appropriate authorization. Add persistent storage, provider integration, and admin authentication only against concrete requirements. Reassess a separate `apps/api` or `apps/admin` when independent deployment or substantial backend logic makes it useful.

## Open decisions

- Exact shared tooling packages as packages are introduced.
- Hosting/runtime and deployment workflow.
- Content authoring workflow and whether a CMS is needed.
- Responsive breakpoints and mobile layouts from the Figma design, plus final design-token extraction. The initial visual/CSS recommendation is in [fsd-rules.md](fsd-rules.md).
- Scope, market, provider, data model, and operational requirements for on-site checkout.
- Admin users, roles, and whether the admin lives in `apps/web` or a separate app.

## References

- [Next.js App Router documentation](https://nextjs.org/docs/app)
- [Turborepo repository structure](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository)
- [FSD with Next.js](https://feature-sliced.design/docs/guides/tech/with-nextjs)
