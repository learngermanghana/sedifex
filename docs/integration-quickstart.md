# Sedifex Integration Quickstart

Use this guide to auto-load products from Sedifex into another website ("Website A").

This quickstart follows the current Sedifex downstream contract based on the `integrationProducts` HTTP endpoint and product shape documented in the root README.

## What you get

After setup, Website A can fetch a store's product catalog from Sedifex and render:

- `id`
- `storeId`
- `name`
- `price`
- `stockCount`
- `itemType`
- `imageUrl`
- `imageAlt`
- `updatedAt`

## Prerequisites

1. Sedifex Firebase project configured (Firestore + Functions).
2. A workspace owner has created an integration API key for the target `storeId`.
3. Your website runtime can make HTTPS requests.

## Integration flow

1. Create an integration API key in **Account overview → Workspace → Integration keys**.
2. Call the HTTP endpoint `GET /integrationProducts?storeId=<storeId>` with `Authorization: Bearer <integration_key>`.
3. Normalize and render the returned product list.
4. Refresh on an interval (for example every 60 seconds) or on page focus.

---

## Example: JavaScript (Website A)

```js
const response = await fetch(
  `${process.env.SEDIFEX_API_BASE_URL}/integrationProducts?storeId=${encodeURIComponent(
    process.env.SEDIFEX_STORE_ID
  )}`,
  {
    headers: {
      Authorization: `Bearer ${process.env.SEDIFEX_INTEGRATION_KEY}`,
      Accept: 'application/json',
    },
  }
)

if (!response.ok) {
  throw new Error(`Sedifex sync failed with status ${response.status}`)
}

const payload = await response.json()
const products = Array.isArray(payload?.products) ? payload.products : []

// 4) Render or map for your site
const websiteProducts = products.map((p) => ({
  id: p.id,
  title: p.name,
  price: p.price,
  stock: p.stockCount,
  imageUrl: p.imageUrl || null,
  imageAlt: p.imageAlt || p.name,
  updatedAt: p.updatedAt,
})
)

console.log('Synced products:', websiteProducts)
```

## Recommended UI behavior

- Show "Last synced at" timestamp.
- Hide/label out-of-stock products when `stockCount <= 0`.
- Always provide image fallbacks if `imageUrl` is null.
- Surface sync errors with retry action.

## Security checklist

- Do not embed admin credentials in Website A.
- Use per-integration keys and rotate/revoke on owner transitions.
- Keep store membership (`teamMembers`) and `storeId` assignments accurate.
- Keep Firestore rules aligned with tenant boundaries.

## Operational checklist

- Verify initial sync in staging before production.
- Log sync success/failure counts.
- Add alerting for repeated failures.
- Document rollback path if products fail to load.

## FAQ

### Can Website A read products for multiple stores?

Yes, but each authenticated context must only access stores that user is authorized for.

### How often should we sync?

Start with 30-120 second polling. Move to event-driven updates (webhooks/pub-sub) when scale requires lower latency.

### What if an old product has no image fields?

Sedifex supports nullable image fields and provides a backfill script for old records.

---

If you need this in another format (REST proxy endpoint, WordPress plugin, or server-side Node worker), keep the same product contract and tenant-scoped authorization model.
