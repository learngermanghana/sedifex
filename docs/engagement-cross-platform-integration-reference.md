# Cross-Platform Engagement Integration Reference

This document defines how comments and favorites should work across:
- Sedifex (core platform)
- SedifexMarket (public catalog/feed)
- Merchant websites (e.g., hajiaslay.com)

---

## 1) Coding to be done on Sedifex (core/source of truth)

Sedifex should own the engagement engine (comments + favorites). Everything writes here first.

### A. Canonical identity layer

Create helper:

```ts
canonicalProductKey = `${storeId}:${sourceProductId}`
```

Add resolver methods:

- `resolveFromPublicProduct(publicProductId) -> { storeId, sourceProductId }`
- `resolveFromStoreProduct(storeId, productId) -> { storeId, sourceProductId }`

### B. New data structures

#### `engagement_threads/{canonicalProductKey}`
- `storeId`
- `sourceProductId`
- `commentsCount`
- `favoritesCount`
- `lastActivityAt`
- `createdAt`
- `updatedAt`

#### `engagement_comments/{commentId}`
- `canonicalProductKey`
- `storeId`
- `sourceProductId`
- `body`
- `rating` (optional)
- `authorUserId`
- `authorDisplayName`
- `originPlatform` (`sedifexmarket | storefront | website_api`)
- `status` (`pending | approved | rejected`)
- `visibility` (`public | store_only`)
- `createdAt`
- `updatedAt`

#### `engagement_favorites/{canonicalProductKey_userId}`
- `canonicalProductKey`
- `storeId`
- `sourceProductId`
- `userId`
- `originPlatform`
- `createdAt`

### C. APIs to build (Sedifex API)

- `POST /v1/engagement/comments`
- `GET /v1/engagement/comments`
- `PATCH /v1/engagement/comments/{id}` (moderation/admin)
- `POST /v1/engagement/favorites`
- `DELETE /v1/engagement/favorites`
- `GET /v1/engagement/summary`
- `POST /v1/engagement/resolve` (publicProductId -> canonical mapping)

Support input options:

- `{ storeId, sourceProductId }`
- OR `{ publicProductId }`

### D. Event/Webhook layer

Emit events on write:

- `comment.created`
- `comment.updated`
- `comment.deleted`
- `favorite.changed`
- `moderation.changed`

Webhook payload includes:

- `eventId`
- `occurredAt`
- `canonicalProductKey`
- `storeId`
- `sourceProductId`
- `platformOrigin`

### E. Security / tenancy

- JWT auth for user actions.
- API key or OAuth client credentials for server-to-server integrations.
- Tenant check: a store can only act on its own `storeId`.
- HMAC signature verification for webhooks.

---

## 2) Coding to be done in SedifexMarket (public feed consumer)

SedifexMarket should not own comments as a source of truth. It should consume Sedifex engagement APIs.

### A. Public product page load flow

When loading `/publicProducts/{id}`:

1. Fetch public product doc.
2. Read `storeId + sourceProductId`.
3. Call `GET /v1/engagement/comments` and `GET /v1/engagement/summary`.
4. Render comments/favorite state.

### B. Write flow from public page

When user comments/favorites:

- `POST` directly to Sedifex engagement API with:
  - `publicProductId` (or mapped `storeId + sourceProductId`)
  - user token
  - text/reaction

Do not write comments into SedifexMarket DB as source of truth.

### C. Realtime sync

Choose one:

- WebSocket/SSE from Sedifex
- Poll every 15-30 seconds
- Webhook-to-cache invalidation if SSR

### D. UI behavior rules

- If `isPublished=false`, decide display policy:
  - hide interaction publicly, or
  - show historical comments read-only
- Always filter by moderation status returned from Sedifex API.

---

## 3) Coding websites can use in 3 different architectures

### Architecture A — Direct API (simplest)

Website frontend/backend calls Sedifex engagement APIs directly.

Best for: fast rollout, low infrastructure.

- Read: `GET /comments?storeId&sourceProductId`
- Write: submit comment/favorite via API
- Auth: user JWT + integration API key

Pros: simple.
Cons: runtime dependency on Sedifex API availability.

### Architecture B — Mirror DB via Webhooks

Website keeps local `comments_cache` and `favorites_cache`; Sedifex pushes updates by webhook.

Best for: high-speed pages, custom analytics.

- Initial sync via pull API
- Ongoing updates via webhook events
- Local read for display; writes still go Sedifex first

Pros: very fast local reads.
Cons: more infrastructure complexity (retry/idempotency handling).

### Architecture C — Widget/SDK Embed (lowest engineering effort)

Sedifex provides JS SDK/widget:

```html
<div id="sedifex-comments"></div>
<script src="https://cdn.sedifex.com/engagement-widget.js"></script>
<script>
  SedifexComments.mount({
    elementId: "sedifex-comments",
    storeId: "...",
    sourceProductId: "...",
    apiKey: "...",
  });
</script>
```

Best for: non-technical merchants / quick adoption.

Pros: lowest effort.
Cons: less UI control unless the SDK supports deep theming.

---

## 4) Environment variables needed (SedifexMarket + websites)

Use these names consistently.

### A. Sedifex (core API service)

- `ENGAGEMENT_API_BASE_URL=https://api.sedifex.com`
- `ENGAGEMENT_DB_COLLECTION_THREADS=engagement_threads`
- `ENGAGEMENT_DB_COLLECTION_COMMENTS=engagement_comments`
- `ENGAGEMENT_DB_COLLECTION_FAVORITES=engagement_favorites`
- `WEBHOOK_SIGNING_SECRET=...`
- `JWT_PUBLIC_KEY=...`
- `CORS_ALLOWED_ORIGINS=https://www.sedifexmarket.com,https://*.merchantdomain.com`

### B. SedifexMarket app env

- `NEXT_PUBLIC_ENGAGEMENT_API_BASE_URL=https://api.sedifex.com`
- `SEDIFEXMARKET_INTEGRATION_CLIENT_ID=...`
- `SEDIFEXMARKET_INTEGRATION_CLIENT_SECRET=...` (server-only)
- `NEXT_PUBLIC_SEDIFEXMARKET_PLATFORM=sedifexmarket`
- `ENGAGEMENT_WRITE_ENABLED=true`
- `ENGAGEMENT_READ_ENABLED=true`

If server-side rendering:

- `SEDIFEX_SERVICE_TOKEN=...` (server-only)

### C. Merchant website env (any client website)

- `SEDIFEX_ENGAGEMENT_API_BASE_URL=https://api.sedifex.com`
- `SEDIFEX_STORE_ID=<merchant_store_id>`
- `SEDIFEX_WEBSITE_CLIENT_ID=...`
- `SEDIFEX_WEBSITE_CLIENT_SECRET=...` (server-only)
- `SEDIFEX_WEBHOOK_SECRET=...` (if webhook architecture)
- `SEDIFEX_PLATFORM_NAME=website_api`
- `SEDIFEX_ENABLE_COMMENT_WRITE=true`
- `SEDIFEX_ENABLE_COMMENT_READ=true`
- `SEDIFEX_ENABLE_FAVORITES_WRITE=true`
- `SEDIFEX_ENABLE_FAVORITES_READ=true`

Frontend-safe vars (if needed):

- `NEXT_PUBLIC_SEDIFEX_STORE_ID=...`
- `NEXT_PUBLIC_SEDIFEX_ENGAGEMENT_READONLY=false`

---

## 5) How to get `SEDIFEXMARKET_INTEGRATION_CLIENT_ID` and `SEDIFEXMARKET_INTEGRATION_CLIENT_SECRET`

You issue these credentials from Sedifex (they are not discovered automatically).

### Option A: Via Integration Admin UI (recommended)

In Sedifex admin, create an integration app:

- Name: `sedifexmarket`
- Type: `first_party`
- Scopes:
  - `engagement:read`
  - `engagement:write`
  - `products:resolve` (optional)
- Allowed origins:
  - `https://www.sedifexmarket.com`

On create, return:

- `client_id` -> use as `SEDIFEXMARKET_INTEGRATION_CLIENT_ID`
- `client_secret` -> use as `SEDIFEXMARKET_INTEGRATION_CLIENT_SECRET` (display once)

### Option B: Via backend seed/admin script

If no admin UI exists yet, create an `integration_clients` record with:

- `client_id`
- `client_secret_hash`
- `name`
- `scopes[]`
- `allowed_origins[]`
- `active`
- `created_at`

Return raw secret once at creation and store only the hash.

### Token usage flow

SedifexMarket server uses client credentials to request short-lived access tokens:

- `POST /oauth/token`
- `grant_type=client_credentials`
- `client_id`
- `client_secret`
- `scope=engagement:read engagement:write`

Use bearer token for engagement API calls.

---

## Final rule to enforce everywhere

Any platform can read/write, but every operation must resolve to:

- `storeId`
- `sourceProductId`
- `canonicalProductKey`

This guarantees:

- a comment made on SedifexMarket public product appears on client website
- a comment made on website appears on SedifexMarket
- no cross-store data leakage
