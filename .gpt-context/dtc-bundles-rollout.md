# DTC bundle catalog rollout

## Stage migration applied — 2026-11-10

At the user’s explicit request, the existing `apps/web/.env.local` connection was verified as `luvlae_stage` and the standard CLI `migrate` then `check` commands completed successfully under Node22. Remote `_migrations` confirms008-dtc-bundles and009-locked-shipping applied on2026-11-10; earlier001–007 markers were already present. No migration locks remain. No catalog provisioning, price/stock adjustment, deploy, provider operation or production migration was performed. Historical statements below about no remote migration describe the earlier implementation phase; this stage verification supersedes them.

This is an operator runbook for the additive schema and one-time catalog initialization. The provisioning command has not been run against a remote database. It never changes stock/reserved quantities, orders, checkout attempts, Stripe, email or any provider configuration.

## Preconditions

- Take and verify the normal database backup/snapshot first.
- Apply schema migrations separately using the documented `db:migrate` command. Provisioning requires `001-commerce`, `008-dtc-bundles` and `009-locked-shipping`; it does not run migrations.
- Deploy every pack-compatible reader and writer before activating offers: checkout/reservation, Stripe and mock paths, payment recovery/webhooks, cancellation/refunds/restock, order and guest projections, email snapshots/templates, admin, storefront/cart, analytics and SEO projections. Use the release acceptance matrix in [the implementation plan](dtc-bundles-implementation-plan.md).
- Confirm the offer prices and badge wording, `SALES_TERMS_POLICY_VERSION`, its effective timestamp, and applicability to new orders. Set both policy settings together before activating the new guarantee; a blank pair preserves legacy checkout behavior, while an invalid pair blocks new-order reservation. Do not invent an effective date in the release command.
- Verify supported delivery-address validation and tax calculation on the real Stripe sandbox, plus restricted-key permissions for customer creation, Checkout Session and tax. Local mock tests do not satisfy this gate.
- Confirm rollback will retain pack-compatible readers. After any pack order is created, do not roll back to code that cannot read pack snapshots.

## Dry run and apply

Run from `apps/web` with Node 22 and the installed `tsx` runtime. The command does not load `.env` files. Supply the database URI, username, password and exact database name explicitly through the process environment. It prints only the database name, target SKU, operation states and physical inventory counts; it does not print connection data or administrator identity.

```sh
node --conditions=react-server --import tsx scripts/db/provision-dtc-offers.ts
```

The default is read-only dry run. Inspect every operation state. Matching offers without this command's audit trail are reported as untracked and must be reconciled manually; the command will not adopt or duplicate them. An audit/action/entity conflict or any later catalog drift requires manual review.

After the dry run, repeat with `--apply --admin-id <active-admin-object-id>`, and set `DB_CONFIRM_NAME` to exactly the same database name as `NEXT_MONGODB_DB_NAME`. The script checks that the administrator is active. No apply has been performed as part of implementation or tests.

The stable operation IDs and audit entries make a partial run resumable. A completed step is skipped. If a step fails, rerun the command after reviewing the audit entries; do not change its operation IDs. Existing price equality does not bypass the initial audited base-price operation. Later administrator edits are reported as drift and are never reset by rerunning the command. Draft offer edits are checked before publishing; archived or missing offers stop with manual review.

The intended one-time catalog is standard USD 19.99, a 2-Pack USD 29.99, and a 3-Pack USD 39.99; all three appear on Home and the 2-Pack receives the `bestValue` badge. Local tests exercise the audited service operations; no remote database apply has been performed. The script does not seed physical inventory.

## Rollback

If activation fails before any pack orders, stop new checkout through the existing operational control, keep the schema migration in place, and deploy a compatible prior build or correct forward. Do not drop new fields/validators while pack-capable code or data exists. To hide a catalog offer, use the audited admin lifecycle/storefront controls; do not delete audit records or directly rewrite catalog arrays. Preserve payments, webhooks, reservations and order history for reconciliation.

After provisioning or activation, verify Home and PDP offer prices/counts, admin offers and stock, a non-payment local journey, real sandbox address/tax validation, webhook recovery and the policy snapshot on newly created orders. Any controlled live payment is a separate explicitly authorized operational action.
