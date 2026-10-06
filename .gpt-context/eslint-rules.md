# ESLint and formatting conventions

These conventions are distilled from the user's example at `ai-slots-app-git/eslint.config.mjs`. The example is a source of lint preferences, not a project instruction file. Apply relevant rules when creating the future Next.js ESLint flat config. The sample uses Nx presets and `@nx/enforce-module-boundaries`; this project is planned for Turborepo, so implement architectural checks with FSD-aware rules and the actual workspace layout instead of adding Nx solely to copy those settings.

## Formatting

- Indent with 2 spaces; do not use tabs.
- Use single quotes in JavaScript/TypeScript strings, except when escaping would be worse; use single quotes in JSX attributes.
- Always use semicolons.
- Require trailing commas in multiline structures.
- Use spaces inside object braces, no spaces inside array brackets or computed property brackets, and one space after object colons.
- Keep spaces around infix operators, before blocks, and inside block braces. Use no spaces inside template substitutions; use spaces after comment markers.
- Do not leave trailing whitespace. End files with a newline. Allow at most one consecutive blank line and no blank lines at end of file.
- Set a 130-character maximum line length, allowing the linter's normal exceptions/configuration where appropriate.
- Keep multiline object braces consistent and put a blank line between imports and following code. Import statements are separated by one blank line after the import block.

## JavaScript and TypeScript

- Do not use `var`; prefer `const` when a binding is not reassigned.
- Prefer `const` arrow functions for utilities and React components. Use named exports for public functions, for example, `export const myUtil = () => { ... };` and `export const MyComponent = (props: Props) => { ... };`. Use another declaration form when a framework contract or a concrete technical need requires it.
- Use strict equality except in the limited cases allowed by the sample's `eqeqeq: smart` rule.
- Avoid nested ternaries, useless concatenation/returns, `new` for side effects, and reassignment of function parameters.
- Prefer object shorthand, object spread, template strings, and radix-free `parseInt` when applicable.
- Require a final `default` branch in switches and put it last. Require curly braces for multiline control-flow bodies.
- Use an appropriate TypeScript-aware unused-variable rule in the real TS config. The reference disables core `no-unused-vars`; do not interpret that as allowing arbitrary unused code.
- For component props, use an `interface Props` local to the component, or export `interface <ComponentName>Props` when consumers need the type. Destructure from a `props` argument inside the component body, not in the parameter list. Re-export a public props interface from the component's `index.ts`.

## Imports and workspace boundaries

- Put imports first, remove duplicate imports and useless path segments, and prohibit self-imports and absolute filesystem paths.
- Do not include file extensions for JS/JSX/TS/TSX imports. Validate imports through a TypeScript-aware resolver configured for the actual app and package tsconfigs.
- Order import groups as: Node built-ins, external packages, internal aliases, parent paths, sibling paths, index imports, object imports, then type imports. Do not add extra alphabetical sorting unless separately selected.
- Preserve FSD layer/slice boundaries described in [fsd-rules.md](fsd-rules.md). The reference Nx tag rule is not a reason to add Nx to this Turborepo repository.

## React, hooks, and JSX

- Put React components in `.tsx` files and define no more than one React component per file.
- Enable duplicate JSX prop checks, React Hooks rules-of-hooks, and exhaustive-deps.
- Prefer shorthand boolean props, omit unnecessary curly braces around string props and text children, and use self-closing tags for components/elements with no children.
- Use two-space JSX indentation. Keep imports compatible with the automatic JSX runtime.
- TypeScript replaces PropTypes; avoid adding PropTypes to TSX components.
- Use JSX accessibility linting. The sample disables several checks (`label-has-associated-control`, `control-has-associated-label`, `click-events-have-key-events`, and `no-autofocus`); do not copy those accessibility suppressions without a concrete reason and an accessible alternative.

## Adaptation notes

- Use the ESLint flat-config format from the reference only if compatible with the Next.js release selected at project setup. Confirm current Next.js ESLint guidance and plugin compatibility then.
- The reference's Nx preset names, Nx tags, Vite/Vitest generated-file ignores, and `apps/*/tsconfig.app.json` resolver globs are specific to that other repository. Adapt ignores and TypeScript project paths to this repository's actual structure.
- Several sample rules are explicitly disabled, including JSX prop spreading, React-in-JSX-scope, and PropTypes. The user's arrow-function preference above takes precedence over the sample's disabled function component declaration style rule. Don't copy its entire rule object mechanically.

## Source

- User-provided example: `/Users/trofimov.e/WebstormProjects/ai-slots-app-git/eslint.config.mjs` (read 2026-10-02).
