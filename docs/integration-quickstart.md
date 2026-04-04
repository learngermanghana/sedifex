# Sedifex Integration Quickstart (Next.js + WordPress)

Use this guide to auto-load products from Sedifex into either:

- a **WordPress** site, or
- a **Next.js site hosted on Vercel**.

This quickstart follows the current Sedifex downstream contract based on the `integrationProducts` HTTP endpoint and related integration endpoints (`integrationPromo` and `integrationCustomers`), plus the product shape documented in the root README.

## What you get

After setup, Website A can fetch and render:

- `id`
- `storeId`
- `name`
- `category`
- `description`
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

1. Create an integration API key in **Account overview → Integrations → Website integrations**.
2. Call `GET /integrationProducts?storeId=<storeId>` with `Authorization: Bearer <integration_key>`.
   - Promo data: `GET /integrationPromo?storeId=<storeId>`
   - Customer data: `GET /integrationCustomers?storeId=<storeId>`
3. Deduplicate products (important when combining multiple sources).
4. Return fallback data when external fetch fails.
5. Render a grouped menu UI by category.
6. Apply an appropriate cache strategy.

---

## Next.js on Vercel tutorial (recommended)

### 1) Server fetch with dedupe + fallback

```ts
// app/menu/page.tsx (server component)

type Product = {
  id: string
  storeId: string
  name: string
  category?: string | null
  description?: string | null
  price: number
  stockCount?: number
  imageUrl?: string | null
}

const FALLBACK_PRODUCTS: Product[] = [
  {
    id: 'fallback-1',
    storeId: 'fallback',
    name: 'Sample Jollof Rice',
    category: 'Meals',
    description: 'Classic Ghana-style rice with tomato stew and spices.',
    price: 45,
    stockCount: 10,
  },
  {
    id: 'fallback-2',
    storeId: 'fallback',
    name: 'Sample Orange Juice',
    category: 'Drinks',
    description: 'Freshly squeezed orange juice served chilled.',
    price: 12,
    stockCount: 25,
  },
]

function dedupeProducts(products: Product[]): Product[] {
  const seen = new Set<string>()
  const unique: Product[] = []

  for (const p of products) {
    const key = `${p.id}|${p.storeId}|${p.name}|${p.price}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(p)
  }

  return unique
}

async function fetchSedifexProducts(): Promise<Product[]> {
  try {
    const response = await fetch(
      `${process.env.SEDIFEX_API_BASE_URL}/integrationProducts?storeId=${encodeURIComponent(
        process.env.SEDIFEX_STORE_ID ?? ''
      )}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.SEDIFEX_INTEGRATION_KEY}`,
          Accept: 'application/json',
        },
        // ISR cache strategy (choose based on your catalog behavior)
        next: { revalidate: 60 },
      }
    )

    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const payload = await response.json()
    const products = Array.isArray(payload?.products) ? payload.products : []
    return dedupeProducts(products)
  } catch {
    return FALLBACK_PRODUCTS
  }
}

function groupByCategory(products: Product[]) {
  return products.reduce<Record<string, Product[]>>((acc, product) => {
    const category = product.category?.trim() || 'Uncategorized'
    if (!acc[category]) acc[category] = []
    acc[category].push(product)
    return acc
  }, {})
}

export default async function MenuPage() {
  const products = await fetchSedifexProducts()
  const grouped = groupByCategory(products)

  return (
    <main>
      <h1>Menu</h1>
      {Object.entries(grouped).map(([category, items]) => (
        <section key={category}>
          <h2>{category}</h2>
          <ul>
            {items.map(item => (
              <li key={`${item.id}-${item.storeId}`}>
                <strong>{item.name}</strong> — {item.price}
                {item.description ? <p>{item.description}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  )
}
```

### 2) Cache strategy (important)

- **Frequently changing price/stock:** `revalidate: 30-120` seconds.
- **Mostly static catalog:** `revalidate: 3600` (1 hour) or longer.
- **Truly live stock:** keep ISR for initial render, then use client polling/SWR for live updates.

### 3) Optional live refresh with SWR

Use SWR on top of server-rendered data for near-live stock while preserving fast first paint.

---

## WordPress tutorial

If your storefront is WordPress, continue with:

- `docs/wordpress-install-guide.md`
- `docs/wordpress-plugin/sedifex-sync.php`

Use the same dedupe key, fallback data pattern, and cache guidance from this quickstart.

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

### What if external fetch fails?

Return static fallback products so your UI keeps rendering instead of crashing.

### Why deduplicate by `id|storeId|name|price`?

It removes repeated rows when multiple sources return the same product representation.

---

If you need this in another format (REST proxy endpoint, WordPress plugin, or server-side Node worker), keep the same product contract and tenant-scoped authorization model.
