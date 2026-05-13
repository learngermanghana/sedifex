# Sedifex ↔ BuySedifex communication plan

This document aligns `sedifexbiz` (source-of-truth inventory/POS backend) with the `buysedifex` market frontend so both repos can evolve without breaking each other.

> Note: this plan is written from the current `sedifexbiz` codebase contract and is intended to be implemented in both repositories.

## 1) Decide the integration boundaries

Use **two lanes** of communication:

1. **Pull lane (read APIs)** for catalog, promo, and discovery pages.
2. **Push lane (webhooks)** for near-real-time invalidation and product updates.

This maps directly to already-available Sedifex endpoints and product webhooks.

## 2) Canonical API contract to consume from BuySedifex

### Required authenticated endpoints (server-to-server)

- `GET /integrationProducts?storeId=<storeId>`
- `GET /integrationCustomers?storeId=<storeId>` (if customer import/sync is needed)
- `GET /integrationTopSelling?storeId=<storeId>&days=30&limit=10`

Headers:

- `Authorization: Bearer <integration_api_key>`

### Required public/read endpoints (promo pages)

- `GET /integrationPromo?storeId=<storeId>`
- `GET /integrationGallery?storeId=<storeId>`
- `GET /integrationGoogleMerchantFeed?storeId=<storeId>`
- `GET /integrationPublicCatalog?storeId=<storeId>` (optional public fallback)

## 3) Webhook contract to consume from BuySedifex

Sedifex already emits:

- `product.created`
- `product.updated`
- `product.deleted`

Headers sent by Sedifex:

- `x-sedifex-signature`
- `x-sedifex-event`
- `x-sedifex-event-id`

Payload shape:

```json
{
  "id": "evt_<eventId>",
  "type": "product.updated",
  "occurredAt": "2026-04-13T00:00:00.000Z",
  "storeId": "store_123",
  "data": {
    "productId": "abc",
    "before": {},
    "after": {}
  }
}
```

### BuySedifex webhook handler requirements

1. Verify signature (`HMAC-SHA256`) with shared webhook secret.
2. Enforce idempotency by storing `x-sedifex-event-id` for 24h+.
3. Respond with `2xx` quickly (under 3s), then process async.
4. On `product.deleted`, remove from local cache/search index immediately.
5. On create/update, trigger selective revalidation by `storeId` + `productId`.

## 4) Shared versioning rules (critical)

To avoid silent breakage between repos:

1. Add and require `X-Sedifex-Contract-Version` request header from BuySedifex.
2. Return the same `X-Sedifex-Contract-Version` response header from Sedifex.
3. Start at `2026-04-01` format (date-based versioning).
4. Only additive changes on same version; breaking changes require a new version and a 30-day overlap window.

## 5) Reliability improvements to implement next

### In `sedifexbiz`

- Add explicit `Cache-Control` per endpoint:
  - products/top-selling: `public, max-age=30, stale-while-revalidate=120`
  - promo/gallery: `public, max-age=60, stale-while-revalidate=300`
- Include `requestId` in all JSON responses for cross-repo tracing.
- Add optional `updatedAfter=<ISO>` filter for incremental sync on:
  - `integrationProducts`
  - `integrationCustomers`
- Add webhook retry with exponential backoff + dead-letter status after final failure.

### In `buysedifex`

- Build a single Sedifex client module (no ad hoc fetches).
- Use stale cache + background refresh fallback when Sedifex API times out.
- Use webhook events to invalidate specific cached pages/queries only.
- Add health checks that fail deployment if Sedifex auth/token handshake fails.

## 6) Security checklist

- Keep integration API keys server-side only (never expose in browser bundles).
- Rotate integration keys quarterly (or on incident).
- Restrict webhook endpoint to POST + JSON only.
- Verify `x-sedifex-signature` on raw request body.
- Log only hashed/truncated tokens and secrets.

## 7) Rollout plan (fastest safe sequence)

1. **Day 1:** BuySedifex consumes only `integrationProducts` with robust fallback.
2. **Day 2:** Add webhook endpoint + signature verification + idempotency table.
3. **Day 3:** Turn on selective cache invalidation from webhooks.
4. **Day 4:** Add promo/gallery/top-selling endpoints.
5. **Day 5:** Add observability dashboards and contract-version enforcement.

## 8) Definition of done

Integration is considered healthy when all are true:

- 99%+ of webhook deliveries return `2xx`.
- Product update appears on BuySedifex within 60 seconds median.
- BuySedifex can fully rebuild catalog from pull APIs alone.
- Contract version mismatches are visible in logs/alerts.
