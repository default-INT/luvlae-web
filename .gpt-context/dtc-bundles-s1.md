# DTC bundles — Stage 1 schema compatibility

Stage 1 adds optional catalog and pack snapshot fields with additive migration `008-dtc-bundles`. The migration backfills only missing `products.offers` as `[]` and `products.inventory.version` as `1`; it preserves inventory counts, base prices, orders, checkout attempts, and frozen Stripe requests. New pack item snapshots must include all of `offerId`, `unitsPerPack`, and `inventoryQuantity`; their physical quantity and line subtotal are validated. Legacy rows with all three fields absent remain valid.

`normalizePackSnapshot` is a client-safe read adapter. It maps an unmodified legacy row to virtual `standard` only when every pack field is absent, and rejects partial, malformed, or inconsistent snapshots. Callers must perform legacy request fingerprint/replay checks before applying this adapter.

This stage does not create or activate offers, change checkout/reservation/refund behavior, or apply the migration to a remote database. Focused migration tests run with the app's `mongodb-memory-server` replica set; use Node 22 and loopback binding when sandbox permissions require it.
