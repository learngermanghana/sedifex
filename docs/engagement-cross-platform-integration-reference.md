# Cross-Platform Engagement Integration Reference

This document defines the standard way product comments and favorites work across:

- Sedifex core dashboard
- Sedifex Market
- Merchant websites, for example Hajia Shop

Sedifex is the source of truth. Sedifex Market and merchant websites should read/write through the shared engagement API shape and must resolve every product to the same canonical product identity.

---

## 1) Final source-of-truth rule

Every engagement operation must resolve to:

```ts
canonicalProductKey = `${storeId}:${sourceProductId}`
```

The same product may appear in different places:

```txt
Sedifex product document
Sedifex Market publicProducts document
Merchant website product page
```

But all comments/favorites must save under the same identity:

```txt
storeId
sourceProductId
canonicalProductKey
```

This guarantees:

```txt
Comment on Sedifex Market → visible on merchant website
Comment on merchant website → visible on Sedifex Market
Store dashboard → can moderate both
```

---

## 2) Data structures

### `engagement_threads/{canonicalProductKey}`

```ts
{
  canonicalProductKey: string;
  storeId: string;
  sourceProductId: string;
  publicProductId?: string | null;
  commentsCount: number;
  favoritesCount: number;
  lastActivityAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### `engagement_comments/{commentId}`

```ts
{
  canonicalProductKey: string;
  storeId: string;
  sourceProductId: string;
  publicProductId?: string | null;
  body: string;
  text?: string;
  rating?: number | null;
  authorUserId?: string | null;
  authorDisplayName: string;
  authorName?: string;
  originPlatform: 'sedifexmarket' | 'storefront' | 'website_api';
  status: 'pending' | 'approved' | 'rejected';
  moderationStatus: 'pending' | 'approved' | 'rejected';
  visibility: 'public' | 'store_only';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### `engagement_favorites/{canonicalProductKey_userId}`

```ts
{
  canonicalProductKey: string;
  storeId: string;
  sourceProductId: string;
  publicProductId?: string | null;
  userId: string;
  originPlatform: 'sedifexmarket' | 'storefront' | 'website_api';
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

## 3) Current implementation status

### Sedifex Market

Sedifex Market has a local fallback API when `NEXT_PUBLIC_SEDIFEX_ENGAGEMENT_API_BASE_URL` or `SEDIFEX_ENGAGEMENT_API_BASE_URL` is not configured:

```txt
GET  /api/engagement/comments
POST /api/engagement/comments
GET  /api/engagement/summary
POST /api/engagement/reactions
```

The fallback writes to the same source-of-truth Firestore collections:

```txt
engagement_threads
engagement_comments
engagement_favorites
```

When the central Sedifex engagement API is ready, set the API base URL and the frontend can call Sedifex core instead.

### Sedifex dashboard

Sedifex dashboard includes:

```txt
/product-engagement
```

This page lets stores view and moderate comments for their own `storeId`:

```txt
Approve
Hide
Reject
```

Approved/public comments can be shown across Sedifex Market and connected websites.

---

## 4) API contract

The API must support either identity style:

```ts
{ publicProductId: 'publicProductsDocId' }
```

or:

```ts
{ storeId: 'STORE_ID', sourceProductId: 'SEDIFEX_PRODUCT_ID' }
```

Recommended external API names for Sedifex core:

```txt
POST   /v1/engagement/comments
GET    /v1/engagement/comments
PATCH  /v1/engagement/comments/{id}
POST   /v1/engagement/favorites
DELETE /v1/engagement/favorites
GET    /v1/engagement/summary
POST   /v1/engagement/resolve
```

Sedifex Market local fallback currently uses:

```txt
GET  /api/engagement/comments?public_product_id=...&store_id=...&source_product_id=...
POST /api/engagement/comments
GET  /api/engagement/summary?public_product_id=...&store_id=...&source_product_id=...
POST /api/engagement/reactions
```

---

## 5) Sedifex Market product page flow

When loading a product page:

```txt
1. Load publicProducts/{publicProductId}
2. Read storeId and sourceProductId
3. Request comments and summary using public_product_id, store_id, source_product_id
4. Render approved/public comments
5. Allow signed-in customers to comment/favorite
```

Write payload example:

```json
{
  "public_product_id": "PUBLIC_PRODUCT_DOC_ID",
  "store_id": "STORE_ID",
  "source_product_id": "SOURCE_PRODUCT_ID",
  "text": "I like this product"
}
```

---

## 6) Merchant website integration flow

Merchant websites should not create their own permanent comment system as the source of truth.

Recommended website flow:

```txt
1. Website loads product from Sedifex catalog
2. Website keeps the Sedifex product ID as sourceProductId
3. Website calls engagement API using storeId + sourceProductId
4. Website displays approved/public comments
5. Website writes new comments/favorites to Sedifex engagement API
```

For example, Hajia Shop should use:

```txt
storeId = SEDIFEX_STORE_ID
sourceProductId = product.id from Sedifex catalog
originPlatform = website_api
```

---

## 7) Firestore security and indexes

The core repo includes Firestore rules and indexes for engagement:

```txt
firestore.rules
firestore.indexes.json
```

Required indexes include:

```txt
engagement_comments: canonicalProductKey ASC, createdAt DESC
engagement_comments: storeId ASC, createdAt DESC
engagement_comments: storeId ASC, status ASC, createdAt DESC
engagement_favorites: canonicalProductKey ASC, active ASC
engagement_favorites: storeId ASC, updatedAt DESC
engagement_threads: storeId ASC, updatedAt DESC
```

Deploy with:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

---

## 8) Moderation behavior

Recommended status behavior:

```txt
approved + public     → visible publicly
pending + public      → optional; usually hide until approved if strict moderation is enabled
rejected + store_only → hidden publicly, visible only in dashboard
```

Dashboard actions:

```txt
Approve → status approved, visibility public
Hide    → status rejected, visibility store_only
Reject  → status rejected, visibility store_only
```

---

## 9) Environment variables

### Sedifex Market

```txt
NEXT_PUBLIC_SEDIFEX_ENGAGEMENT_API_BASE_URL=https://api.sedifex.com/v1/engagement
SEDIFEX_ENGAGEMENT_API_BASE_URL=https://api.sedifex.com/v1/engagement
```

If these are not configured, Sedifex Market uses its local fallback:

```txt
/api/engagement
```

### Merchant websites

```txt
SEDIFEX_ENGAGEMENT_API_BASE_URL=https://api.sedifex.com/v1/engagement
SEDIFEX_STORE_ID=<merchant_store_id>
SEDIFEX_WEBSITE_CLIENT_ID=...
SEDIFEX_WEBSITE_CLIENT_SECRET=...
SEDIFEX_PLATFORM_NAME=website_api
SEDIFEX_ENABLE_COMMENT_WRITE=true
SEDIFEX_ENABLE_COMMENT_READ=true
SEDIFEX_ENABLE_FAVORITES_WRITE=true
SEDIFEX_ENABLE_FAVORITES_READ=true
```

---

## 10) Related checkout/source-of-truth rule

Engagement should follow the same source-of-truth thinking as checkout:

```txt
Product orders from Sedifex Market or websites → integrationOrders
Service bookings from Sedifex Market or websites → integrationBookings
Product comments/favorites from Sedifex Market or websites → engagement_* collections/API
```

Do not split one domain across multiple unconnected systems.
