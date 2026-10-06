# FSD rules for the future web application

These are project conventions for `apps/web` once code exists. Apply them to new and changed code without creating empty layers, slices, or packages in advance. The planned folder names avoid conflicts with Next.js App Router:

```text
apps/web/
  app/             # Next.js route entry points and special files
  src/
    _app/          # FSD app layer: providers, global styles, analytics, API route composition
    _pages/        # page-level composition
    widgets/       # reusable, self-contained page blocks when useful
    features/      # meaningful user interactions when extraction helps
    entities/      # reusable business concepts when needed
    shared/        # UI primitives, focused libraries, config, external adapters
```

## Placement

- Keep `apps/web/app/` thin. Use it for `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, metadata, and `route.ts` as Next.js requires. Put substantial page composition in `src/_pages/<page>/`; keep framework exports and routing behavior clear at the entry point.
- `_app` holds application-wide wiring. `_pages` owns a page's composition and page-local code. A block used on only one page may remain in that page slice.
- Add `widgets` for large independent or reused page sections; add `features` for meaningful interactions; add `entities` for business concepts with useful shared models or UI. Do not create one slice for every component, section, button, or data type.
- `shared` has no product-specific business rules. Organize `shared/lib` by a narrow purpose, not as a general `utils` dump. Keep product evidence and claim rules in the relevant domain or page code, under the requirements in `seo-requirements.md`.
- Keep locale codes and translation contracts in `shared/config/i18n`; put YAML message sources under `shared/config/i18n/messages/` and expose server-only loading from `shared/lib/i18n`. Route locale resolution and Next-specific rewrites stay in `app/`/`proxy.ts`.
- Segments such as `ui`, `model`, `api`, `lib`, and `config` are created inside a slice only when needed. Route Handlers may delegate to `_app/api-routes`; do not force a growing backend into frontend FSD layers.

## Component structure and exports

Use a folder for a component that owns its implementation and any component-specific UI or utilities. Keep the component's main file at the slice root; place nested UI components in `ui/` and focused helpers in `utils/`:

```text
MyComponent/
  ui/
    SomeUIComp/
      SomeUIComp.tsx
      styles.module.scss
      index.ts
  utils/
    someUtil.ts
  MyComponent.tsx
  styles.module.scss
  index.ts              # re-exports MyComponent
```

- Define one React component per `.tsx` file. The component directory name, component name, and implementation filename must match exactly in UpperCamelCase: `MyComponent/MyComponent.tsx`. Apply the same rule to nested UI components: `SomeUIComp/SomeUIComp.tsx`. Supporting non-component functions can share a file when they form one focused utility.
- Keep each component inside its own same-named folder and expose it to consumers through that folder's `index.ts`. The root component's `index.ts` re-exports the root component; nested UI components have their own `index.ts` as shown.
- If a component needs props, declare a `Props` interface next to the component. If consumers need the props type, name it `<ComponentName>Props` (for example, `HomePageProps`) and re-export it from the component's `index.ts`; also re-export it from any higher-level slice public API that exposes the component.
- Receive component props as one `props` argument and destructure inside the function body, rather than in the parameter list. This keeps the component signature compact:

  ```tsx
  interface Props {
    title: string;
  }

  export const MyComponent = (props: Props) => {
    const { title } = props;

    return <h1>{title}</h1>;
  };
  ```

- Use SCSS Modules for component styles. Name each component's SCSS module exactly `styles.module.scss`, colocated in that component's folder. Use CSS custom properties for shared design tokens; global reset/token styles belong in the app-level global stylesheet.
- Keep `index.ts` files for explicit re-exports only. Do not put component implementations in barrel files.
- Prefer named exports for components and other modules. Use a default export when a framework or lazy-loading integration specifically benefits from it; keep the slice's named public API where practical.
- Follow the formatting conventions in [eslint-rules.md](eslint-rules.md): single quotes, semicolons, and trailing commas in multiline structures.

## TypeScript enum naming

When an enum is appropriate, use UpperCamelCase for both the enum name and its members:

```ts
enum UpperCamelCase {
  UpperCamelName,
}
```

Prefer this style consistently; do not use all-uppercase enum members unless an established external contract requires those exact names.

## Styling recommendation

The user-provided [Figma homepage](https://www.figma.com/design/GwBCFwQF7ScFBZ0ua5mzrg/Sandbox?node-id=154-6351) is the visual reference for the new site, which will be built from scratch. It shows a Manrope-led type system, deep navy headings and controls, blue accents, pale cool backgrounds, rounded cards, soft shadows, and a spacious multi-section layout with a max-width content grid. Use the Figma design as the visual source when implementation begins; do not base the new site on the current live page.

Chosen styling approach: **SCSS Modules plus shared CSS custom properties**. Keep component styles in `styles.module.scss` beside each component and define global design tokens for the Figma palette, Manrope typography, spacing, radii, shadows, and content widths in app-level styles. This fits the custom card and section layouts while keeping styles scoped to FSD components. Avoid adding a component library or styling framework until the design needs justify one.

The Figma content is a visual reference, not an independent source of product facts or approved health claims. Verify ingredient amounts, wear directions, delivery mechanisms, and efficacy claims against the product and SEO notes before implementation. Responsive breakpoints and mobile layouts remain to be confirmed from the Figma file.

## Dependencies and public interfaces

- Dependencies flow downward: `_app` → `_pages` → `widgets` → `features` → `entities` → `shared`. A slice may import from lower layers and from within itself, but not from another slice on the same layer. `_app` and `shared` are layer-wide exceptions in the FSD specification.
- Import another slice through its explicit public API. Do not deep-import its internal files or use wildcard barrel exports. Export only what consumers need.
- Keep server-only and client-safe exports separate when a slice contains both. Use a server-specific public entry point such as `index.server.ts` where necessary, and mark privileged modules with `server-only`. Do not pull server modules into a `use client` graph.
- For a genuinely necessary relationship between entity slices, make the exception explicit with FSD's `@x` public API. Avoid cross-imports between feature, widget, or page slices.
- Keep workspace package boundaries explicit. A package's public exports are a separate contract from an FSD slice's public API.

## Review checklist for new code

1. Does this code belong to one page or slice? Keep it local until reuse or responsibility warrants extraction.
2. Does every import respect layer direction and slice boundaries?
3. Are server-only data and client components separated?
4. Is the public API narrow, with no deep imports by consumers?
5. Does any product content follow the evidence and verification rules in `seo-requirements.md` and the product note?
6. Does each React component have its own file and a folder-level `index.ts` export?
7. Are components and utilities declared with `const` arrow functions where practical, component exports named by default, and TypeScript/TSX strings written with single quotes and semicolons?
8. Do the component folder and `.tsx` implementation filename exactly match the component name, and is its SCSS file named `styles.module.scss`?

## References

- [FSD layers](https://feature-sliced.design/docs/reference/layers)
- [FSD public API](https://feature-sliced.design/docs/reference/public-api)
- [FSD with Next.js](https://feature-sliced.design/docs/guides/tech/with-nextjs)
