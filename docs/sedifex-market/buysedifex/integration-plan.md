# Sedifex Market → BuySedifex integration plan (store-scoped)

This guide is for integrating the dedicated **BuySedifex** storefront with Sedifex market data in a **store-scoped** way (no admin master key usage in this flow).

> Contract date for this plan: `2026-04-13` (sent in header, not in URL path).

## 1) Base URL and headers

Use the production Sedifex Functions base URL:

- `https://us-central1-sedifex-web.cloudfunctions.net`

Canonical environment variables:

- `SEDIFEX_API_BASE_URL=https://us-central1-sedifex-web.cloudfunctions.net`
- If another repo expects `SEDIFEX_INTEGRATION_API_BASE_URL`, set it to the same value.

Required headers for authenticated integration requests:

- `x-api-key: <store_integration_key>`
- `X-Sedifex-Contract-Version: 2026-04-13`

> Important: `2026-04-13` is a **header value**, not a route segment.

## 2) Required endpoints for BuySedifex

All endpoints are query-parameter scoped by `storeId`:

- `GET /v1IntegrationProducts?storeId=<storeId>`
- `GET /v1IntegrationPromo?storeId=<storeId>`
- `GET /integrationGallery?storeId=<storeId>`
- `GET /integrationCustomers?storeId=<storeId>`
- `GET /integrationTopSelling?storeId=<storeId>&days=30&limit=10`
- `GET /integrationTikTokVideos?storeId=<storeId>`

Public fallback feed (when needed):

- `GET /v1/products`

## 3) Common 404 prevention

Do **not** construct URLs like:

- `/<contractVersion>/products`
- Example wrong path: `/2026-04-13/products`

Correct pattern:

- Keep base URL fixed.
- Send contract date in `X-Sedifex-Contract-Version` header.
- Request endpoints directly (for example `/v1IntegrationProducts?storeId=<storeId>`).

## 4) Why and how to support "other stores pulling one store"

Some teams run multiple storefronts, partner sites, or white-label channels that all need to fetch data for one specific Sedifex store. To keep this safe and predictable, each integration should be configured in backend storage with explicit store-scoped settings.

### Why

- Prevent accidental cross-store data leakage.
- Make data ownership explicit for each integration connection.
- Support multiple downstream sites with different store mappings.
- Allow independent key rotation and revocation per integration.

### How (backend configuration model)

Persist one integration record per external site/channel:

- `baseUrl` (Sedifex API URL)
- `storeId` (the exact Sedifex store to read from)
- `integrationApiKey` (active store integration key)
- `contractVersion` (currently `2026-04-13`)
- optional metadata (`channelName`, `enabled`, `lastSyncAt`)

At runtime:

1. Load integration config from backend (never from browser-exposed secrets).
2. Build request URL using stored `baseUrl` + endpoint + `storeId` query param.
3. Attach stored `integrationApiKey` as `x-api-key`.
4. Attach stored `contractVersion` as `X-Sedifex-Contract-Version`.
5. Validate response shape, dedupe products, and apply fallback cache policy.

## 5) Data handling requirements in BuySedifex

- Deduplicate products before rendering.
- Render grouped menu/categories from product data.
- Return fallback data when external fetch fails.
- Use cache + stale-while-revalidate strategy to reduce downtime impact.

## 6) Shared types to avoid field drift

Use `shared/integrationTypes.ts` in both repos for:

- `IntegrationProduct`
- `IntegrationPromo`
- `IntegrationProductsResponse`
- `IntegrationPromoResponse`

If publishing shared types to npm, keep package version aligned with contract date (`2026-04-13`).
