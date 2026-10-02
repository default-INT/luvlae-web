# Project instructions

## Project context

- Before making project changes, read `.gpt-context/README.md` and the relevant notes it links to.
- For architecture, tooling, rendering, data flow, or deployment work, read `.gpt-context/architecture.md`.
- Before adding or reorganizing application code, read `.gpt-context/fsd-rules.md` and follow its FSD boundaries.
- When creating or changing lint configuration, read `.gpt-context/eslint-rules.md` and adapt its conventions to the actual Next.js/Turborepo stack.
- For work involving the Luvlae Berberine Patches product (ASIN `B0H6FQFJL8`), read `.gpt-context/products/luvlae-berberine-patches.md` before writing product copy, answering product questions, or changing related project content.
- For website structure, copy, SEO, metadata, structured data, indexing, or analytics work for Luvlae.com, read `.gpt-context/seo-requirements.md` and follow its verification and evidence rules.
- Keep durable project context in `.gpt-context/`: architecture, commands, conventions, important decisions, and operational constraints that are not obvious from the code.
- Treat product notes as source-grounded context: distinguish listing claims from customer feedback, preserve unknowns as unknown, and refresh time-sensitive marketplace details before presenting them as current.
- When discovering or changing durable project facts, update the relevant context note in the same change. Keep notes concise, factual, and current; link to source files when possible.
- Do not copy secrets, credentials, personal data, or large source-code excerpts into context notes.
- If a fact is uncertain or not yet established, label it as unknown instead of guessing.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
