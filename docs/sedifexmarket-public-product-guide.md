# SedifexMarket public product integration guide

This document is the dedicated reference for **SedifexMarket** (public marketplace) and any **public product** data usage.

## Use this document when

- You are building or updating SedifexMarket (`buysedifex`) flows.
- You need public catalog reads for products/services.
- You need market-specific webhook/cache behavior.

## Primary references

- Cross-repo coordination and rollout plan:
  - `docs/sedifex-buysedifex-integration-plan.md`
- Public + integration API behavior:
  - `docs/integration-api-guide.md`
- Cross-platform engagement mapping with public product IDs:
  - `docs/engagement-cross-platform-integration-reference.md`

## Public product data sources

For SedifexMarket or other public clients, use:

1. `GET /v1/products` for marketplace-style feed reads.
2. `GET /integrationPublicCatalog?storeId=<storeId>` (or `?slug=<promoSlug>`) for store-level public reads without API key storage.
3. Response buckets:
   - `publicProducts` for non-service item types.
   - `publicServices` for service item types.

## Boundary from store/private integration docs

- Keep SedifexMarket and public-product implementation details in this dedicated document set.
- Keep partner/store authenticated integration setup in:
  - `docs/integration-quickstart.md`

## Recommended operating model for SedifexMarket reliability and full-catalog access

If SedifexMarket must reliably display products from many stores (and avoid one store dominating reads), run it as a **first-party privileged consumer** with server-side fan-out and strict write boundaries.

### 1) Access model

- Treat SedifexMarket backend as a **trusted internal client** with elevated read scope for store catalogs.
- Keep external partner sites on the existing per-store integration path.
- Do **not** expose elevated credentials to browsers; keep privileged reads on backend only.

### 2) Data access pattern

- Maintain one normalized catalog index that pulls from each store's public products/services.
- Use weighted/fair fetch scheduling so each store is refreshed within an SLA window.
- Cache per-store snapshots and serve market pages from cache first; refresh asynchronously.
- Add circuit breakers + retry with jitter for stores that intermittently fail.

### 3) Checkout/payment ownership

- SedifexMarket should be merchant-of-record for marketplace checkout only if settlement, tax, and refunds are centrally managed.
- Keep store-level direct checkout available for partner websites and per-store integration users.
- Persist order routing metadata (`storeId`, payout split, fulfillment owner, reconciliation status) on each order.

### 4) Product + services + comments sync

- Sync both product and service catalogs into a common schema (same identity and versioning rules).
- Use webhook-first updates for near-real-time changes; run scheduled backfill for missed events.
- Sync customer comments/reviews with idempotent upserts and moderation status fields.

### 5) Controls and observability

- Track freshness metrics per store (age of last successful sync, item counts, error rates).
- Alert when a store exceeds freshness/error thresholds.
- Add audit logs for privileged catalog reads and administrative actions.

### 6) Rollout sequence

1. Enable privileged backend reader for SedifexMarket only.
2. Add per-store cache + fair scheduler.
3. Add unified order routing and payout metadata.
4. Enable webhook + nightly reconciliation for products/services/comments.
5. Turn on monitoring dashboards and SLA alerts.

This model gives SedifexMarket full marketplace coverage while preserving partner compatibility with per-store integrations.


## Verified-store visibility policy (SedifexMarket)

For SedifexMarket marketplace display, use this rule:

- **If a store is verified, show all products and services for that store**.
- Do not require extra marketplace visibility flags such as `isPublished` for SedifexMarket internal aggregation.
- Keep this policy scoped to SedifexMarket first-party backend reads only.
- External integrations can continue to apply their own per-store publication filters.

### Implementation blueprint (Sedifex)

1. **Define one eligibility gate** in backend aggregation code:
   - `eligibleForSedifexMarket = store.isVerified === true`
2. **Remove product-level publish gate** from SedifexMarket ingestion path:
   - Stop filtering by product `isPublished`/equivalent in the SedifexMarket reader.
3. **Fetch full verified-store catalog**:
   - Ingest all product/service records for eligible stores into the market index.
4. **Tag source and policy in index records**:
   - Write `visibilityPolicy: "verified_store_full_catalog"` for traceability.
5. **Add fallback behavior**:
   - If store verification becomes false, remove/de-rank the store catalog from SedifexMarket index on next sync.
6. **Protect scope with auth boundary**:
   - Enforce this logic only in trusted backend jobs/functions; never in public browser clients.

### Suggested step-by-step rollout

1. Create a feature flag: `SEDFX_MARKET_VERIFIED_FULL_CATALOG=true`.
2. Update ingestion query/service to use verified-store-only gate.
3. Run a one-time backfill to repopulate index for all currently verified stores.
4. Validate with sample stores that previously hidden items now appear.
5. Turn on progressive rollout (10% -> 50% -> 100% traffic or store cohorts).
6. Monitor errors, item-count deltas, and checkout conversion before finalizing.

### Environment/config Sedifex will need

Minimum environment/config variables for reliable deployment:

- `SEDFX_MARKET_VERIFIED_FULL_CATALOG=true`
- `SEDFX_MARKET_SYNC_BATCH_SIZE=100` (tune per workload)
- `SEDFX_MARKET_SYNC_INTERVAL_SECONDS=300`
- `SEDFX_MARKET_CACHE_TTL_SECONDS=120`
- `SEDFX_MARKET_RETRY_MAX_ATTEMPTS=5`
- `SEDFX_MARKET_RETRY_BASE_MS=500`
- `SEDFX_MARKET_CIRCUIT_BREAKER_FAIL_THRESHOLD=10`
- `SEDFX_MARKET_CIRCUIT_BREAKER_RESET_SECONDS=60`
- `SEDFX_MARKET_AUDIT_LOG_ENABLED=true`

### Data fields required

- Store-level:
  - `storeId`
  - `isVerified` (authoritative)
  - `verificationUpdatedAt`
- Product/service-level:
  - `productId`/`serviceId`
  - `storeId`
  - canonical name, price, inventory/status metadata
  - last update timestamp for incremental sync

This policy ensures verified stores are fully represented on SedifexMarket while preserving compatibility for other integration consumers.
