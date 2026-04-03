# Sedifex Integration Quickstart

Use this guide to auto-load products from Sedifex into another website ("Website A").

This quickstart follows the current Sedifex downstream contract based on the callable `listStoreProducts` function and product shape documented in the root README.

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

1. Sedifex Firebase project configured (Auth + Firestore + Functions).
2. The website integration user exists and belongs to the target `storeId`.
3. Your website can run Firebase client SDK (browser or Node runtime).

## Integration flow

1. Sign in an authorized user (staff/owner) for the target store.
2. Call `listStoreProducts` via Firebase callable Functions SDK.
3. Normalize and render the returned product list.
4. Refresh on an interval (for example every 60 seconds) or on page focus.

---

## Example: JavaScript (Website A)

```js
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { getFunctions, httpsCallable } from 'firebase/functions'

// 1) Initialize Firebase for the Sedifex project
const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  appId: process.env.VITE_FB_APP_ID,
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const functions = getFunctions(app)

// 2) Authenticate integration user
await signInWithEmailAndPassword(
  auth,
  process.env.SEDIFEX_INTEGRATION_EMAIL,
  process.env.SEDIFEX_INTEGRATION_PASSWORD
)

// 3) Call tenant-safe product reader
const listStoreProducts = httpsCallable(functions, 'listStoreProducts')
const response = await listStoreProducts({
  // Keep payload minimal unless function requires additional filters.
})

const products = Array.isArray(response?.data) ? response.data : []

// 4) Render or map for your site
const websiteProducts = products.map((p) => ({
  id: p.id,
  title: p.name,
  price: p.price,
  stock: p.stockCount,
  imageUrl: p.imageUrl || null,
  imageAlt: p.imageAlt || p.name,
  updatedAt: p.updatedAt,
}))

console.log('Synced products:', websiteProducts)
```

## Recommended UI behavior

- Show "Last synced at" timestamp.
- Hide/label out-of-stock products when `stockCount <= 0`.
- Always provide image fallbacks if `imageUrl` is null.
- Surface sync errors with retry action.

## Security checklist

- Do not embed admin credentials in Website A.
- Use least-privilege user account tied to the correct store.
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
