# Luvlae.com architecture and technology

## Status and agreed requirements

Planning only as of 2026-10-02. No application, workspace, backend, database, or deployment is implemented. The user has selected these requirements for the future application:

- Next.js, using the latest suitable stable release **at implementation time**, App Router, and TypeScript.
- Static generation (SSG) and server rendering (SSR), chosen per route.
- Feature-Sliced Design (FSD) for application code.
- A Turborepo monorepo from the start.
- Room for a small backend for on-site payment and possibly a small admin area later.
- Named exports by default, single quotes, semicolons, and trailing commas in multiline structures; detailed conventions are in [fsd-rules.md](fsd-rules.md) and [eslint-rules.md](eslint-rules.md).
- SCSS Modules for component styles, with each module named `styles.module.scss`; shared design tokens use CSS custom properties.
- The new site will be built from scratch using the user-provided [Figma homepage](https://www.figma.com/design/GwBCFwQF7ScFBZ0ua5mzrg/Sandbox?node-id=154-6351) as its visual reference.

Do not treat a version number, payment provider, database, hosting service, or content system as selected until separately confirmed. Check current release and security guidance when initializing or upgrading Next.js.

## Planned shape

Start with one deployable app, `apps/web`, in a workspace with root `turbo.json` and a lockfile. Reserve `packages/` for genuinely shared code or tooling; do not split a single-use domain into packages merely because this is a monorepo. The proposed package manager is pnpm, pending confirmation when the workspace is created. `apps/api` or `apps/admin` may be added later if their size or deployment needs justify separate apps.

Keep the Next.js `apps/web/app/` directory focused on route entry points, layouts, metadata files, and Route Handlers. Place FSD code in `apps/web/src/` according to [fsd-rules.md](fsd-rules.md). Route files compose or re-export page code from FSD; route-specific Next.js exports remain easy to find in the route entry point. Packages outside `apps/web` are workspace packages, not automatically FSD layers.

## Rendering and content

- Prerender public, non-personalized content when its source and update workflow permit it: home, product, evidence, safety, instructions, and guides. Choose a deliberate revalidation or redeployment path when content changes.
- Use request-time rendering for future user-specific checkout, order, and admin views. Do not enable `output: 'export'` for an application expected to use SSR, Route Handlers, and payment callbacks.
- Keep Server Components by default. Introduce Client Components only around interactions or browser-only APIs. Keep secrets, privileged data access, and provider credentials on the server.
- Keep product facts separate from page presentation so a future CMS or admin workflow can replace the data source. The exact initial content format is undecided.

The current conversion is an outbound Amazon click. The URL map, content evidence rules, metadata, structured data, indexing, and analytics requirements are in [seo-requirements.md](seo-requirements.md). In particular, do not publish a consolidated ingredient list or wear time until the conflicting source records are resolved; see [the product note](products/luvlae-berberine-patches.md). Do not model Amazon price, availability, or reviews as on-site purchase data.

## Future server boundary

If on-site payment is approved, begin with server-side operations and Route Handlers inside `apps/web` while the backend remains small. Keep order calculation and payment state on the server; treat callbacks/webhooks and Server Actions as public entry points that require validation and appropriate authorization. Add persistent storage, provider integration, and admin authentication only against concrete requirements. Reassess a separate `apps/api` or `apps/admin` when independent deployment or substantial backend logic makes it useful.

## Open decisions

- Package manager and exact shared tooling packages.
- Hosting/runtime and deployment workflow.
- Content authoring workflow and whether a CMS is needed.
- Responsive breakpoints and mobile layouts from the Figma design, plus final design-token extraction. The initial visual/CSS recommendation is in [fsd-rules.md](fsd-rules.md).
- Scope, market, provider, data model, and operational requirements for on-site checkout.
- Admin users, roles, and whether the admin lives in `apps/web` or a separate app.

## References

- [Next.js App Router documentation](https://nextjs.org/docs/app)
- [Turborepo repository structure](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository)
- [FSD with Next.js](https://feature-sliced.design/docs/guides/tech/with-nextjs)
