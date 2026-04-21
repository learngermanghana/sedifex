# Public catalog backfill (`publicProducts` / `publicServices`)

Use this when older `products` documents were created before the `syncPublicProducts` trigger existed (or before `itemType` routing was added), and you need to populate:

- `publicProducts`
- `publicServices`

## Prerequisites

- Firebase Admin credentials available in your shell (`GOOGLE_APPLICATION_CREDENTIALS`), or run in an environment where `firebase-admin` can authenticate.
- Install functions dependencies:

```bash
cd functions
npm ci
```

## Run backfill

From repo root:

```bash
npm --prefix functions run backfill-public-catalog
```

The script will:

1. Read docs from `products`.
2. Write each record into:
   - `publicServices` when `itemType === "service"`
   - `publicProducts` for all other item types (`product`, `made_to_order`, missing/unknown)
3. Remove the same doc id from the opposite collection.
4. Backfill missing `publishedAt` values in both public collections.

## Run for one store only

You can scope by `storeId` in two equivalent ways:

```bash
npm --prefix functions run backfill-public-catalog -- --store-id=YOUR_STORE_ID
```

or:

```bash
node functions/scripts/backfillPublicProducts.js YOUR_STORE_ID
```

## Verify after backfill

Quick counts in Firestore console:

- `products` for a store
- `publicProducts` for same store
- `publicServices` for same store

Then verify a few sample product IDs:

- A `service` item should only exist in `publicServices/<productId>`.
- A non-service item should only exist in `publicProducts/<productId>`.

## Reconciliation mode (verify + repair)

Run reconciliation when you want to actively check for drift and repair it:

```bash
npm --prefix functions run backfill-public-catalog -- --mode=reconcile
```

Single-store reconciliation:

```bash
npm --prefix functions run backfill-public-catalog -- --mode=reconcile --store-id=YOUR_STORE_ID
```

Reconciliation validates published `products/<id>` documents map to exactly one target (`publicProducts` or `publicServices`), then repairs:

- wrong-collection drift after `itemType` changes,
- missing `publishedAt` / `updatedAt`,
- non-normalized `category` values (trimmed, single-spaced, lowercase),
- orphan public docs with no matching published source product.

It also emits a per-store summary report and refreshes store health fields:

- `publicCatalogLastSyncedAt`
- `publicCatalogDocCount.products`
- `publicCatalogDocCount.services`
- `publicCatalogOutOfSyncCount`
