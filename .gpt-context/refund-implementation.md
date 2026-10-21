# Refunds and admin interaction work

Implemented locally, 2026-10-21. This note records the agreed requirements, work boundaries and verification evidence. Remote rollout remains separate.

## Confirmed behavior

- `/admin` offers full remaining refunds only. The data model and Stripe ingestion support partial refunds made externally.
- Unfulfilled/processing orders use **Cancel order**: persist intent and immediately block shipping; refund paid funds; restore remaining un-restocked quantities only after refund success. Pending/failed/ambiguous refund results keep shipping blocked.
- Shipped/delivered orders use **Refund**: return money, preserve shipment and stock. Completed orders remain eligible when refundable funds exist.
- Refunds made directly in Stripe update financial state/history only, without automatic cancellation or inventory changes.
- Both actions require a free-text reason. Keep local text separate from Stripe's nullable reason enum; Dashboard notes are not assumed available through the Refund API.
- Unpaid cancellation reconciles/expires the provider checkout before releasing stock reservations. Mock orders use isolated local test behavior without fake Stripe observations.
- Replays must neither refund nor restock twice. Resolve uncertain network outcomes and expired provider idempotency windows before creating replacement operations.
- Email delivery is outside this change. Preserve stable operation/transition identities for a future sender.
- Replace visible admin Loading text with skeletons/spinners. Preserve loaded content on background refresh.
- Share a presentational Drawer between order and cart. Animate opening/closing, unmount content after exit, retain cart state independently, honor reduced motion, native focus/modal behavior and saving locks.

## Work packages

1. Server: refund operation model/migration, cancellation/refund commands, Stripe event ingestion and recovery, authorized API/DTOs, financial/inventory integration tests.
2. Admin: action eligibility, full-refund confirmation/reason, operation recovery and refund history, translations and client tests.
3. Shared interactions: accessible Drawer presence/exit lifecycle, order/cart integration, admin skeleton/spinner states and interaction verification.
4. Integration: verify contracts, run repository checks, check browser behavior, update runbooks/context.
5. Independent review: examine final changes for correctness, concurrency, security, maintainability and missing tests; fix findings and verify again.

## Implementation boundaries

- Server code is split into refund command orchestration, provider access, transactional persistence, DTO, schema migration and bounded recovery modules under `apps/web/src/_app/commerce/`. Thin authorized Route Handlers reuse the existing admin protocol.
- Migration005 creates refund validation/indexes and adds cancellation intent to orders. Refund reads/writes fail closed before that migration. Apply it explicitly to the intended environment before enabling the UI/API there.
- `stripe:reconcile --refunds [limit] [cursor]` processes bounded order batches and durable failed inbox events. It fetches the account event feed once per batch, rather than once per order. No scheduler or email worker is added.
- Local request IDs remain stable across uncertain retries and admin-session changes. Stripe metadata is used for initial request correlation; once the immutable provider ID is bound, subsequent metadata edits do not break status ingestion.
- Legacy paid orders cancelled before this feature can use a money-only Refund without changing their stock/restock history.
- Old ambiguous provider calls outside the safe idempotency window remain held for operator investigation. Do not clear that hold or retry a new key without verifying the provider outcome; the application deliberately cannot infer non-payment from a timeout.

No remote migration, deployment or real payment action is implied by local verification. Runtime/provider checks must be reported separately from local synthetic tests.

## Verification — 2026-10-21

- All five work packages completed: server, admin UI, shared interactions, integration and independent review. Review findings were corrected and reviewed again; no unresolved actionable code findings remained.
- Node24: `pnpm lint`, `pnpm typecheck`, full `pnpm test:server` **89/89**, `pnpm build` (Next.js production), and `DEPLOY_ENV=stage pnpm build:vinext` (Cloudflare stage artifact) passed from `apps/web`. Mongo integration tests use temporary local replica sets and synthetic Stripe transport stubs, including idempotency cache/parameter checks; they do not call Stripe or Atlas.
- Chromium on the existing local Next dev server with every `/api/**` request intercepted by synthetic fixtures: admin order skeleton, cancellation confirmation/request, save dismissal lock, pending history, shipped/completed refund eligibility, animated exit retaining content then unmount, focus/scroll restoration, backdrop drag protection, 390px viewport, reduced motion and cart close/reopen passed. No browser runtime errors were observed. These are UI checks, not end-to-end evidence of a real Stripe refund.
- Independent reviewer additionally ran the focused refund/adversarial/client-recovery suites **20/20** and verified schema guards, provider execution lease, atomic event processing, mutable-metadata handling, legacy paid cancelled refunds and FSD boundaries.
- Initial implementation verification did not perform remote rollout. Migration005 was subsequently applied to stage as recorded below. Remaining rollout steps: migrate other intended environments explicitly, subscribe Stripe endpoints to refund events, perform sandbox end-to-end verification from the [runbook](../apps/web/docs/commerce-api.md#admin-refunds-and-cancellation--2026-10-21), and verify target-runtime credentials/delivery.

## Stage migration — 2026-10-21

- On the user's explicit request, the configured Atlas database `luvlae_stage` was inspected: migrations001–004 were present and no migration lock existed. No production target was selected.
- `DB_CONFIRM_NAME=luvlae_stage pnpm db:migrate` succeeded; `005-refunds` is recorded at `2026-10-21T15:28:48.777Z`. Existing migrations were skipped by their completion markers.
- Post-migration verification confirmed the orders cancellation-request validator, strict/error refunds validation, all five named refund indexes (three unique, including the partial active-operation constraint), and zero remaining migration locks.
- `DB_CONFIRM_NAME=luvlae_stage pnpm db:check` succeeded, including its aborted-write rollback probe. No order/payment mutations, Stripe calls, webhook subscription changes or deployment were executed.
