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
