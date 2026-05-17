# SedifexMarket public product integration guide

This document is the dedicated reference for **SedifexMarket** (public marketplace) and any **public product** data usage.

## Use this document when

- You are building or updating SedifexMarket (`buysedifex`) flows.
- You need public catalog reads for products/services.
- You need market-specific webhook/cache behavior.
- You are designing marketplace/storefront cart, checkout, and product-detail user experiences.

## Primary references

- Cross-repo coordination and rollout plan:
  - `docs/sedifex-buysedifex-integration-plan.md`
- Public + integration API behavior:
  - `docs/integration-api-guide.md`
- Cross-platform engagement mapping with public product IDs:
  - `docs/engagement-cross-platform-integration-reference.md`

## Public naming policy

Use the current marketplace name everywhere:

- Preferred: **Sedifex Market**
- Preferred marketplace domain: **sedifexmarket.com**
- Avoid outdated wording such as `stores.sedifex.com`, `Buy on Sedifex`, or old standalone storefront language.

When writing UI copy for customers, use clear phrases such as:

- `Shop on Sedifex Market`
- `Add to cart`
- `Checkout securely`
- `Pay with Paystack`
- `Verified store`
- `Store will contact you for delivery`

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

## Professional cart and checkout design guidance

Sedifex Market and Sedifex-powered client websites should use a **cart-first shopping model** instead of forcing customers into checkout from every product card. The goal is to make shopping feel closer to a modern marketplace experience: customers can browse, add multiple items, review their cart, and then checkout confidently.

### Recommended shopping flow

Use this default flow for product shopping:

1. Customer opens marketplace, store page, category page, or search result.
2. Product card shows `Add to cart` and `View details`.
3. Customer can add multiple products without leaving the page.
4. A cart count is always visible in the header.
5. On mobile, a floating cart button remains visible near the bottom of the screen.
6. Customer opens cart drawer/page to review items.
7. Customer enters contact and delivery details once.
8. Checkout groups items by `merchantId` and creates one checkout per merchant where needed.
9. Paystack handles online payment.
10. Sedifex receives webhook confirmation and updates the marketplace/customer/dashboard order status.

Avoid this older flow for products:

```text
Product card -> Buy now -> immediate checkout form
```

Use this instead:

```text
Product card -> Add to cart -> Continue shopping -> Cart drawer -> Checkout
```

### Product card UI

Product cards should stay simple and fast. Recommended fields:

- Product image
- Product name
- Price
- Store/verified badge when helpful
- Category or trust chip
- Primary action: `Add to cart`
- Secondary action: `View details`

Recommended button layout:

```text
[ Add to cart ] [ View details ]
```

For services, use service-specific wording:

```text
[ Add service ] [ View details ]
```

Do not overload product cards with full checkout forms, long contact forms, or too many payment explanations.

### Header cart

Every Sedifex Market page should expose a visible cart affordance in the header:

```text
Cart (0)
Cart (3)
Cart (3) · GH₵ 245.00
```

Guidelines:

- Keep cart count visible on desktop and mobile.
- Make the header cart open a cart drawer, not a new full checkout page immediately.
- Do not hide cart behind a menu on mobile if the customer is shopping.

### Mobile floating cart button

On mobile, add a floating cart button once the customer has at least one item in cart:

```text
🛒 Cart 3 · GH₵ 245.00
```

Placement:

- Fixed bottom-right or full-width bottom bar.
- Keep it above browser safe areas and sticky product action bars.
- Avoid covering form submit buttons.

Purpose:

- Customer can continue browsing and still know their cart is active.
- Customer can return to checkout without scrolling to the top.

### Product detail page sticky action

On individual product pages, use a dedicated purchase panel.

Desktop layout:

```text
Product image/details      Sticky purchase panel
                           Price
                           Quantity - 1 +
                           [Add to cart]
                           [Checkout now]
```

Mobile layout:

```text
Fixed bottom bar:
Price | Add to cart | Checkout
```

Rules:

- Product detail pages can offer `Checkout now`, but it should still add the item to cart and open cart review.
- Quantity selector should be easy to use.
- The customer should never lose their cart when navigating between pages.

### Cart drawer design

Use a drawer or slide-over panel for quick review. Recommended sections:

1. Cart header:
   - `Your cart`
   - Item count
   - Subtotal if available
2. Item list:
   - Product/service name
   - Store name
   - Quantity `- / +`
   - Unit price
   - Remove button
3. Customer details:
   - Full name
   - Email
   - Phone
   - Delivery location / landmark
   - Notes
4. Checkout action:
   - `Checkout with Paystack`
5. Checkout result:
   - Payment link(s) per merchant
   - Clear confirmation message

The drawer should support multi-merchant cart grouping because one customer may add products from different verified stores.

### Checkout payload shape

Use a cart payload that can carry multiple items:

```json
{
  "cart": [
    {
      "productId": "product_123",
      "merchantId": "store_123",
      "quantity": 2,
      "type": "PRODUCT"
    },
    {
      "productId": "service_456",
      "merchantId": "store_123",
      "quantity": 1,
      "type": "SERVICE"
    }
  ],
  "customer": {
    "name": "Customer Name",
    "email": "customer@example.com",
    "phone": "+233..."
  },
  "delivery": {
    "location": "Town / suburb / landmark",
    "notes": "Optional customer note"
  }
}
```

The checkout backend should:

- Validate each item.
- Group cart lines by `merchantId`.
- Create one merchant checkout per merchant.
- Store order records with `sourceChannel: sedifex_market`.
- Preserve `clientOrderId`, `sedifexOrderId`, `paymentReference`, and order item snapshots.

### Status language for customers

Customer-facing order statuses should be plain, not technical.

Use:

```text
Payment pending
Payment successful
Order confirmed
Waiting for store delivery
Pay on delivery
Manual payment pending
Cancelled
```

Avoid showing raw internal status names such as:

```text
pending_cash_collection
pending_store_confirmation
pending_manual
pending_delivery
```

### Merchant dashboard language

For store owners, keep statuses operational:

```text
Online paid
Pay on delivery
Manual payment pending
Waiting for delivery
Completed
Cancelled
```

Marketplace order tables should clearly separate:

- Marketplace Orders
- Marketplace Bookings
- Online Paid Orders
- Pay on Delivery Orders

### Trust and safety copy

Use short trust hints around checkout:

- `Payment is confirmed after Paystack verification.`
- `Sedifex Market records your order reference automatically.`
- `The store will contact you for delivery.`
- `Keep your reference number for support.`

Do not make unsupported claims such as instant delivery, guaranteed refund, or same-day fulfillment unless the store has configured that policy.

### Design checklist before release

Before shipping a Sedifex Market or client website cart experience, verify:

- Header cart count works.
- Mobile floating cart appears after adding an item.
- Product cards use `Add to cart`, not only `Buy now`.
- Product detail page has quantity and sticky mobile action.
- Cart persists with `localStorage` or a signed-in customer cart.
- Cart can handle multiple products from the same store.
- Cart can handle products from different stores by creating separate merchant checkouts.
- Paystack checkout opens successfully.
- After Paystack webhook, customer status page shows `Payment successful` and `Order confirmed`.
- Merchant dashboard shows paid orders under online/marketplace orders.
- Old `stores.sedifex.com` copy is removed.

## Recommended operating model for SedifexMarket reliability and full-catalog access

If SedifexMarket must reliably display products from many stores (and avoid one store dominating reads), run it as a **first-party privileged consumer** with server-side fan-out and strict write boundaries.

### 1) Access model

- Treat SedifexMarket backend as a **trusted internal client** with elevated read scope for store catalogs.
- Keep external partner sites on the existing per-store integration path.
- Do **not** expose elevated credentials to browsers; keep privileged reads on backend only.

### 2) Data access pattern

- Maintain one normalized catalog index that pulls from each store's public products/services.
- Use weighted/fair fetch scheduling so each store is refreshed within an SLA window.
- Cache per-store snapshots and serve market pages from cache first; refresh asynchronously.
- Add circuit breakers + retry with jitter for stores that intermittently fail.

### 3) Checkout/payment ownership

- SedifexMarket should be merchant-of-record for marketplace checkout only if settlement, tax, and refunds are centrally managed.
- Keep store-level direct checkout available for partner websites and per-store integration users.
- Persist order routing metadata (`storeId`, payout split, fulfillment owner, reconciliation status) on each order.

### 4) Product + services + comments sync

- Sync both product and service catalogs into a common schema (same identity and versioning rules).
- Use webhook-first updates for near-real-time changes; run scheduled backfill for missed events.
- Sync customer comments/reviews with idempotent upserts and moderation status fields.

### 5) Controls and observability

- Track freshness metrics per store (age of last successful sync, item counts, error rates).
- Alert when a store exceeds freshness/error thresholds.
- Add audit logs for privileged catalog reads and administrative actions.

### 6) Rollout sequence

1. Enable privileged backend reader for SedifexMarket only.
2. Add per-store cache + fair scheduler.
3. Add unified order routing and payout metadata.
4. Enable webhook + nightly reconciliation for products/services/comments.
5. Turn on monitoring dashboards and SLA alerts.

This model gives SedifexMarket full marketplace coverage while preserving partner compatibility with per-store integrations.


## Verified-store visibility policy (SedifexMarket)

For SedifexMarket marketplace display, use this rule:

- **If a store is verified, show all products and services for that store**.
- Do not require extra marketplace visibility flags such as `isPublished` for SedifexMarket internal aggregation.
- Keep this policy scoped to SedifexMarket first-party backend reads only.
- External integrations can continue to apply their own per-store publication filters.

### Implementation blueprint (Sedifex)

1. **Define one eligibility gate** in backend aggregation code:
   - `eligibleForSedifexMarket = store.isVerified === true`
2. **Remove product-level publish gate** from SedifexMarket ingestion path:
   - Stop filtering by product `isPublished`/equivalent in the SedifexMarket reader.
3. **Fetch full verified-store catalog**:
   - Ingest all product/service records for eligible stores into the market index.
4. **Tag source and policy in index records**:
   - Write `visibilityPolicy: "verified_store_full_catalog"` for traceability.
5. **Add fallback behavior**:
   - If store verification becomes false, remove/de-rank the store catalog from SedifexMarket index on next sync.
6. **Protect scope with auth boundary**:
   - Enforce this logic only in trusted backend jobs/functions; never in public browser clients.

### Suggested step-by-step rollout

1. Create a feature flag: `SEDFX_MARKET_VERIFIED_FULL_CATALOG=true`.
2. Update ingestion query/service to use verified-store-only gate.
3. Run a one-time backfill to repopulate index for all currently verified stores.
4. Validate with sample stores that previously hidden items now appear.
5. Turn on progressive rollout (10% -> 50% -> 100% traffic or store cohorts).
6. Monitor errors, item-count deltas, and checkout conversion before finalizing.

### Environment/config Sedifex will need

Minimum environment/config variables for reliable deployment:

- `SEDFX_MARKET_VERIFIED_FULL_CATALOG=true`
- `SEDFX_MARKET_SYNC_BATCH_SIZE=100` (tune per workload)
- `SEDFX_MARKET_SYNC_INTERVAL_SECONDS=300`
- `SEDFX_MARKET_CACHE_TTL_SECONDS=120`
- `SEDFX_MARKET_RETRY_MAX_ATTEMPTS=5`
- `SEDFX_MARKET_RETRY_BASE_MS=500`
- `SEDFX_MARKET_CIRCUIT_BREAKER_FAIL_THRESHOLD=10`
- `SEDFX_MARKET_CIRCUIT_BREAKER_RESET_SECONDS=60`
- `SEDFX_MARKET_AUDIT_LOG_ENABLED=true`

### Data fields required

- Store-level:
  - `storeId`
  - `isVerified` (authoritative)
  - `verificationUpdatedAt`
- Product/service-level:
  - `productId`/`serviceId`
  - `storeId`
  - canonical name, price, inventory/status metadata
  - last update timestamp for incremental sync

This policy ensures verified stores are fully represented on SedifexMarket while preserving compatibility for other integration consumers.