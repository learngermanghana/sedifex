# Sedifex Integration API Guide (v1)

This guide explains how third-party clients (including Buy Sedifex) should authenticate, call endpoints, cache/deduplicate responses, and migrate safely as the API evolves.

## 1) Authentication and API keys

1. Choose one auth mode:
   - **Admin master key mode:** set Firebase Functions param `SEDIFEX_INTEGRATION_API_KEY` (can fetch all stores from integration products endpoints when `storeId` is omitted).
   - **Store key mode:** create a store integration key from Sedifex Account settings (must include that `storeId`; access is store-scoped).
2. Store keys server-side only (never in browser bundles).
3. Call authenticated endpoints with:
   - `x-api-key: <master_or_store_integration_key>`
   - `X-Sedifex-Contract-Version: 2026-04-13`
4. Rotate keys regularly (recommended quarterly or immediately on incident).

## 2) Versioning contract

- Current contract version: `2026-04-13`.
- Request header: `X-Sedifex-Contract-Version`.
- Response headers:
  - `x-sedifex-contract-version`
  - `x-sedifex-request-id`
- If versions mismatch, API returns `400`:

```json
{
  "error": "contract-version-mismatch",
  "expectedVersion": "2026-04-13",
  "receivedVersion": "2026-01-01"
}
```

## 3) Endpoint response shapes

### `GET /v1/products` (public marketplace feed)

Query parameters:

- `sort`: `store-diverse` | `newest` | `price` | `featured`
  - `store-diverse` groups products by `storeId`, sorts within each store by `featuredRank desc`, then `updatedAt desc`, and interleaves stores round-robin before pagination.
- `page`: 1-based page number (default `1`).
- `pageSize` or `limit`: products per page (default `24`, max `60`).
- `maxPerStore` (optional): cap how many products from the same store may appear on a single page.

```json
{
  "sort": "store-diverse",
  "page": 1,
  "pageSize": 24,
  "maxPerStore": 2,
  "total": 324,
  "products": [
    {
      "id": "product_1",
      "storeId": "store_123",
      "storeName": "Sedifex Store",
      "storeCity": "Accra",
      "name": "Item",
      "category": "Meals",
      "description": "Description",
      "price": 45,
      "stockCount": 10,
      "itemType": "product",
      "imageUrl": "https://...",
      "imageUrls": ["https://..."],
      "imageAlt": "Item image",
      "featuredRank": 12,
      "updatedAt": "2026-04-13T00:00:00.000Z"
    }
  ]
}
```

`storeName` and `storeCity` are included so marketplace consumers (e.g. Buy Sedifex) can render seller identity/location without making extra store lookup calls.

### `GET /v1IntegrationProducts?storeId=<storeId>` (authenticated)

- With a **store key**: `storeId` is required and only that store is returned.
- With the **admin master key**:
  - include `storeId` to get one store, or
  - omit `storeId` to fetch products across all stores (`scope: "all-stores"` in response).

```json
{
  "storeId": "store_123",
  "products": [
    {
      "id": "product_1",
      "storeId": "store_123",
      "name": "Item",
      "category": "Meals",
      "description": "Description",
      "price": 45,
      "stockCount": 10,
      "itemType": "product",
      "imageUrl": "https://...",
      "imageUrls": ["https://..."],
      "imageAlt": "Item image",
      "updatedAt": "2026-04-13T00:00:00.000Z"
    }
  ]
}
```

### `GET /v1IntegrationPromo?storeId=<storeId>` (authenticated) or `?slug=<promoSlug>` (public)

```json
{
  "storeId": "store_123",
  "promo": {
    "enabled": true,
    "slug": "my-store",
    "title": "Promo title",
    "summary": "Promo summary",
    "startDate": "2026-04-01",
    "endDate": "2026-04-30",
    "websiteUrl": "https://example.com",
    "youtubeUrl": null,
    "youtubeEmbedUrl": null,
    "youtubeChannelId": null,
    "youtubeVideos": [],
    "imageUrl": null,
    "imageAlt": null,
    "phone": "+233...",
    "storeName": "Sedifex Store",
    "updatedAt": "2026-04-13T00:00:00.000Z"
  }
}
```

## 4) Deduplication and caching

- Deduplicate by product `id` (and optionally `updatedAt` when merging data sources).
- Recommended cache policy:
  - Products/top-selling: 30s cache + 120s stale-while-revalidate.
  - Promo/gallery: 60s cache + 300s stale-while-revalidate.
- Always keep a small fallback dataset so storefront pages can render during transient failures.

## 5) Error handling

Common status codes:

- `400` malformed request (`missing-token-or-store`, `contract-version-mismatch`)
- `401` invalid integration token
- `404` unknown store/promo slug
- `405` unsupported method

Client guidance:

1. Retry idempotent GET failures with exponential backoff.
2. Include and log `x-sedifex-request-id` for support/tracing.
3. On `401`, rotate or re-issue key and retry.
4. On `contract-version-mismatch`, deploy client version compatible with `expectedVersion`.

## 6) Migration when fields are added

- Additive fields can appear at any time in the same contract version.
- Consumers should ignore unknown fields.
- For breaking changes, Sedifex will publish a new contract version and allow overlap during migration.

## 7) Shared types

Use `shared/integrationTypes.ts` as the shared source of truth for:

- `IntegrationProduct`
- `IntegrationPromo`
- `IntegrationProductsResponse`
- `IntegrationPromoResponse`
