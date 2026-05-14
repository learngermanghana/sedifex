# Sedifex Integration API Guide (v1)

This guide explains how third-party clients (including Buy Sedifex) should authenticate, call endpoints, cache/deduplicate responses, and migrate safely as the API evolves.

## 1) Authentication and API keys

### Required integration secrets/config

Set these values in your website/server environment before calling Sedifex integration endpoints:

- `SEDIFEX_INTEGRATION_API_KEY` (or legacy alias `SEDIFEX_INTEGRATION_KEY`) → your integration key.
- `SEDIFEX_API_BASE_URL` (or legacy alias `SEDIFEX_INTEGRATION_API_BASE_URL`) → API base URL, typically `https://us-central1-sedifex-web.cloudfunctions.net`.
- `SEDIFEX_STORE_ID` → store id to query in `?storeId=<storeId>`.

Example server-side env:

```bash
SEDIFEX_API_BASE_URL=https://us-central1-sedifex-web.cloudfunctions.net
SEDIFEX_STORE_ID=store_123
SEDIFEX_INTEGRATION_API_KEY=sk_live_xxx
```

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
  ],
  "publicProducts": [],
  "publicServices": []
}
```

`publicProducts` and `publicServices` are convenience buckets derived from `itemType` so storefronts can render physical products and services in separate sections without extra client-side sorting.

#### Which endpoint should other websites use?

1. **Server-to-server (recommended):** `GET /v1IntegrationProducts?storeId=<storeId>` with `x-api-key`.
2. Render from `publicProducts` and `publicServices` when you want separate sections for non-service and service items.


### `GET /api/public-blog?storeId=<storeId>[&slug=<postSlug>]` (public, no API key)

Use this endpoint when a store wants its website to **pull published blog posts** from Sedifex.

- `storeId` is required.
- `slug` is optional. If provided, Sedifex filters to one post slug.
- Returns only posts with `status = "published"`.

Example list response:

```json
{
  "items": [
    {
      "id": "post_123",
      "title": "How to choose the right product",
      "slug": "how-to-choose-the-right-product",
      "content": "<p>...</p>",
      "linkUrl": "https://example.com/more-details",
      "imageUrl": "https://storage.googleapis.com/.../blog-image.jpg",
      "publishedAt": "2026-05-12T10:00:00.000Z"
    }
  ]
}
```

#### Blog pull integration steps (website)

1. Save the store's `storeId` in your website backend config.
2. Fetch posts server-side:
   - `GET ${SEDIFEX_SITE_BASE_URL}/api/public-blog?storeId=<storeId>`
3. Cache response for 30-120 seconds to reduce repeated fetches.
4. Render list cards (title, image, excerpt from content) and optionally deep-link by slug.
5. For one post page, call:
   - `GET ${SEDIFEX_SITE_BASE_URL}/api/public-blog?storeId=<storeId>&slug=<postSlug>`

#### Minimal Node/Next.js server example

```ts
const base = process.env.SEDIFEX_SITE_BASE_URL ?? 'https://www.sedifex.com'
const storeId = process.env.SEDIFEX_STORE_ID ?? ''

const res = await fetch(`${base}/api/public-blog?storeId=${encodeURIComponent(storeId)}`, {
  // next.js cache hint (optional)
  next: { revalidate: 60 },
})

if (!res.ok) throw new Error(`Blog pull failed: ${res.status}`)
const payload = await res.json()
const items = Array.isArray(payload.items) ? payload.items : []
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

### `GET /v1IntegrationAvailability?storeId=<storeId>&serviceId=<serviceId>&from=<ISO>&to=<ISO>` (authenticated)

- Returns session/class slots for service-type offerings.
- `serviceId`, `from`, and `to` are optional filters.
- `attributes` is a flexible object for industry-specific fields (for example: school grade level or travel pickup point).

```json
{
  "storeId": "store_123",
  "serviceId": "service_abc",
  "from": "2026-04-20T00:00:00.000Z",
  "to": "2026-04-30T23:59:59.000Z",
  "slots": [
    {
      "id": "slot_1",
      "storeId": "store_123",
      "serviceId": "service_abc",
      "startAt": "2026-04-22T10:00:00.000Z",
      "endAt": "2026-04-22T11:00:00.000Z",
      "timezone": "Africa/Accra",
      "capacity": 20,
      "seatsBooked": 8,
      "seatsRemaining": 12,
      "status": "open",
      "attributes": {
        "level": "Beginner"
      },
      "updatedAt": "2026-04-13T00:00:00.000Z"
    }
  ]
}
```

### `GET /integrationGallery?storeId=<storeId>` (public via store/slug resolution)

- Returns published gallery images sorted by `sortOrder asc`.
- Useful for `/integrationGallery` page sections on partner websites.

```json
{
  "storeId": "store_123",
  "gallery": [
    {
      "id": "gallery_1",
      "url": "https://...",
      "alt": "Front store display",
      "caption": "Grand opening",
      "sortOrder": 1,
      "isPublished": true,
      "createdAt": "2026-04-13T00:00:00.000Z",
      "updatedAt": "2026-04-13T00:00:00.000Z"
    }
  ]
}
```

### `GET /integrationCustomers?storeId=<storeId>` (authenticated)

- Returns up to 500 customers for the store, sorted by latest update.
- Useful for `/integrationCustomers` sync/import views.

```json
{
  "storeId": "store_123",
  "customers": [
    {
      "id": "cust_1",
      "storeId": "store_123",
      "name": "Ada Mensah",
      "displayName": "Ada",
      "phone": "+233201234567",
      "email": "ada@example.com",
      "notes": null,
      "tags": ["vip"],
      "birthdate": null,
      "createdAt": "2026-04-01T10:00:00.000Z",
      "updatedAt": "2026-04-13T10:00:00.000Z",
      "debt": {
        "outstandingCents": 5000,
        "dueDate": "2026-04-20T00:00:00.000Z",
        "lastReminderAt": null
      }
    }
  ]
}
```

### `GET /integrationTopSelling?storeId=<storeId>&days=30&limit=10` (authenticated)

- Aggregates `saleItems` over a rolling window (`days`, min 1 max 365).
- `limit` is clamped between 1 and 50.
- Useful for `/integrationTopSelling` widgets and merchandising blocks.

```json
{
  "storeId": "store_123",
  "windowDays": 30,
  "generatedAt": "2026-04-13T00:00:00.000Z",
  "topSelling": [
    {
      "productId": "product_1",
      "name": "Item",
      "category": "Meals",
      "imageUrl": "https://...",
      "imageUrls": ["https://..."],
      "imageAlt": "Item image",
      "itemType": "product",
      "qtySold": 42,
      "grossSales": 1890,
      "lastSoldAt": "2026-04-12T18:00:00.000Z"
    }
  ]
}
```

## 3.1) Integration page steps for `/integrationGallery`, `/integrationCustomers`, `/integrationTopSelling`

Use this sequence when wiring those integration pages/widgets in external websites:

1. Load env config (`SEDIFEX_API_BASE_URL`, `SEDIFEX_STORE_ID`, `SEDIFEX_INTEGRATION_API_KEY`).
2. Build headers:
   - `x-api-key: <integration_key>`
   - `X-Sedifex-Contract-Version: 2026-04-13`
   - `Accept: application/json`
3. Issue GET requests with `?storeId=<storeId>`:
   - `/integrationGallery`
   - `/integrationCustomers`
   - `/integrationTopSelling?days=30&limit=10` (adjust as needed)
4. Normalize and cache:
   - Gallery/videos: preserve `sortOrder`; filter to published records only.
   - Customers/top-selling: dedupe by `id`/`productId`; sort by latest `updatedAt`/`lastSoldAt`.
5. Fallback safely:
   - Keep local fallback data for UI continuity.
   - Retry idempotent GET failures with backoff and log `x-sedifex-request-id`.

### `GET /v1IntegrationBookings?storeId=<storeId>&status=<status>&serviceId=<serviceId>` (authenticated)

- Lists website-originated bookings/registrations.
- `status` and `serviceId` filters are optional.

### `POST /v1IntegrationBookings?storeId=<storeId>` (authenticated)

- Creates a booking/registration from a website form submission.
- Request body supports:
  - `serviceId` (recommended; if omitted, Sedifex tries to resolve from `slotId` or `BOOKING_DEFAULT_SERVICE_ID`)
  - `slotId` (optional; when supplied, capacity is validated; aliases `slotID` and `slot_id` are also accepted)
  - `customer` (`name` / `phone` / `email`, at least one required)
  - `quantity` (optional, defaults to `1`)
  - `notes` (optional)
  - `attributes` (optional flexible object for vertical-specific fields)
- Service resolution order:
  1. Explicit `serviceId` from request payload
  2. `serviceId` inferred from the selected `slotId`
  3. Firebase param `BOOKING_DEFAULT_SERVICE_ID`
- If service cannot be resolved, API returns:
  - `400` with `error: "service-not-resolved"`
  - message: `"Service could not be resolved. Configure BOOKING_DEFAULT_SERVICE_ID or provide serviceId."`
- Customer auto-mapping:
  - When `customer.phone` or `customer.email` is provided, Sedifex automatically upserts the contact into the store `customers` collection.
  - Existing customer records are matched by `storeId + phone` first, then `storeId + email`.
  - New customer records are tagged with `source: "integrationBooking"` for later segmentation.

#### Booking canonical field map (for website developers)

To prevent sync mismatches between different form builders, use these canonical keys in booking payloads and/or map your website labels to them in **Settings → Integrations → Booking Mapping**.

| Canonical key | Purpose | Common website aliases |
|---|---|---|
| `customerName` | Booker full name | `name`, `fullName`, `clientName` |
| `customerPhone` | Booker phone | `phone`, `phoneNumber`, `mobile`, `whatsapp` |
| `customerEmail` | Booker email | `email`, `emailAddress` |
| `serviceName` | Product/service selected | `productName`, `service_note_name` |
| `bookingDate` | Booking date | `date` |
| `bookingTime` | Booking time | `time` |
| `branchLocationId` | Internal branch/store location id | `branchId`, `locationId`, `storeBranchId` |
| `branchLocationName` | Human-readable branch name | `branchName`, `storeBranch`, `locationName` |
| `eventLocation` | Where event takes place | `eventVenue`, `venue`, `eventAddress` |
| `customerStayLocation` | Where customer is staying | `stayLocation`, `hotelLocation`, `guestLocation` |
| `paymentMethod` | How customer pays | `payment_method`, `paymentType` |
| `paymentAmount` | Amount charged/paid | `amount`, `total`, `price` |

**Legacy compatibility:** `preferredBranch` and `depositAmount` are still supported, but new implementations should prefer `branchLocationId`/`branchLocationName` and `paymentAmount`.

#### Example request body (recommended shape)

```json
{
  "serviceId": "svc_event_001",
  "slotId": "slot_2026_08_01_10_00",
  "customer": {
    "name": "Ada Mensah",
    "phone": "+233201234567",
    "email": "ada@example.com"
  },
  "quantity": 2,
  "notes": "Need projector setup",
  "paymentMethod": "bank_transfer",
  "paymentAmount": 250,
  "branchLocationId": "branch_accra_airport",
  "branchLocationName": "Airport Branch",
  "eventLocation": "National Theatre, Accra",
  "customerStayLocation": "Labadi Beach Hotel",
  "attributes": {
    "source": "wordpress_booking_form",
    "campaign": "summer_launch"
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


## 8) Client website communication contract (Partner Spec v1)

For partner websites, keep checkout communication limited to three endpoints and one webhook contract.

This contract supports both **product sales** and **service bookings**. Set `orderType` accordingly (`product` or `service`) and consume `bookingStatus` when the transaction represents a booking.

### Canonical IDs (required on every transaction)

Persist all three IDs together for reconciliation and support:

- `reference`: Paystack/Sedifex payment reference (authoritative payment lookup key).
- `sedifexOrderId`: internal Sedifex order/booking id.
- `clientOrderId`: partner website order id.

For service bookings, include your booking identifier in `clientOrderId` (or in `metadata.bookingId`) so customer support can reconcile website bookings to Sedifex records.

## 9) Checkout pricing + fulfillment contract (Website ↔ Sedifex)

Use this section when wiring storefront checkout so Sedifex remains the source of truth for totals.

### MVP decisions (current)

- Refunds are out of scope for this version.
- Paystack processing fee is recovered from the customer by adding `processing_fee_to_add` at checkout.
- Delivery fee is conditional:
  - `PICKUP` → no delivery fee.
  - `DELIVERY` → delivery fee is calculated and added as a separate charge.
- Tax is read from inventory/service item configuration where set.

### Canonical checkout fields (use these exact names)

- `fulfillment_type` (`PICKUP` | `DELIVERY`)
- `subtotal`
- `tax_total`
- `delivery_fee`
- `pre_processing_total`
- `processing_fee_to_add`
- `final_total`
- `pricing_snapshot`
- `payment_reference`
- `payment_status`
- `order_status`

All monetary fields must be integers in minor units (for example, NGN kobo).

### Required endpoint sequence

1. `POST /checkout/preview`
   - Website sends cart, fulfillment choice, and delivery context.
   - Sedifex calculates and returns full pricing breakdown.
2. `POST /checkout/create`
   - Sedifex recalculates server-side, stores immutable `pricing_snapshot`, and initializes Paystack with `final_total`.
3. `POST /payments/paystack/webhook`
   - Sedifex verifies signature/reference/amount and marks order paid.
4. `GET /orders/{order_id}`
   - Website fetches latest order/payment status for confirmation page.

### Request/response reference

`POST /checkout/preview` request:

```json
{
  "merchant_id": "m_123",
  "currency": "NGN",
  "fulfillment_type": "PICKUP",
  "delivery_address_id": null,
  "items": [
    { "type": "PRODUCT", "item_id": "p_1", "qty": 2 },
    { "type": "SERVICE", "item_id": "s_7", "qty": 1 }
  ]
}
```

`POST /checkout/preview` response:

```json
{
  "pricing_version": "2026-05-12-v1",
  "subtotal": 2500000,
  "tax_total": 187500,
  "delivery_fee": 0,
  "pre_processing_total": 2687500,
  "processing_fee_to_add": 45000,
  "final_total": 2732500,
  "breakdown": [
    { "code": "SUBTOTAL", "amount": 2500000 },
    { "code": "TAX", "amount": 187500 },
    { "code": "DELIVERY", "amount": 0 },
    { "code": "PROCESSING_FEE", "amount": 45000 }
  ]
}
```

### Calculation order (authoritative)

1. Resolve line prices and quantities → `subtotal`.
2. Apply item tax rules from inventory/services → `tax_total`.
3. Apply fulfillment:
   - `PICKUP` → `delivery_fee = 0`.
   - `DELIVERY` → compute delivery fee from configured rules.
4. Compute:
   - `pre_processing_total = subtotal + tax_total + delivery_fee`
5. Compute processor recovery:
   - `processing_fee_to_add = estimate_processing_fee(pre_processing_total)`
6. Compute:
   - `final_total = pre_processing_total + processing_fee_to_add`

Sedifex must recompute these values on `checkout/create`; website-provided totals are never trusted.

### Website rendering rules

- Always render values returned from Sedifex (no client-side fee math).
- Show delivery line only when `fulfillment_type = DELIVERY`.
- Always show processing fee line when `processing_fee_to_add > 0`.
- Re-run preview when cart, fulfillment type, or delivery address changes.

### Validation and error contract

- `DELIVERY_ADDRESS_REQUIRED` when delivery is selected without required address fields.
- `INVALID_FULFILLMENT_TYPE` for unsupported fulfillment values.
- `PRICE_CHANGED_REVIEW_CART` when catalog prices changed between preview and create.
- `PAYMENT_AMOUNT_MISMATCH` when webhook paid amount differs from stored `final_total`.

### Implementation checklist for integration teams

1. Store merchant config (`storeId`, API key, contract version).
2. Build server-side adapter for preview/create/order-status calls.
3. Add checkout UI toggle for pickup vs delivery.
4. Bind UI totals to Sedifex response fields (`subtotal`, `tax_total`, `delivery_fee`, `processing_fee_to_add`, `final_total`).
5. Persist IDs for reconciliation:
   - `payment_reference`
   - `sedifexOrderId`
   - `clientOrderId`
6. Handle webhook-driven paid state before showing final success.
7. Log `x-sedifex-request-id` on failures for support.

### `POST /integration/checkout/create` (authenticated)

Purpose: client website server asks Sedifex to create a hosted checkout session.

Headers:

- `x-api-key: <integration_key>`
- `X-Sedifex-Contract-Version: 2026-04-13`
- `Content-Type: application/json`

Request body:

```json
{
  "storeId": "store_123",
  "clientOrderId": "WEB-98452",
  "orderType": "product",
  "currency": "GHS",
  "items": [
    {
      "id": "product_1",
      "name": "Item A",
      "unitPrice": 45,
      "qty": 2
    }
  ],
  "amount": 90,
  "customer": {
    "email": "buyer@example.com",
    "phone": "+233200000000",
    "name": "Buyer Name"
  },
  "returnUrl": "https://clientsite.com/payment/return",
  "metadata": {
    "channel": "client-website",
    "clientWebsiteId": "site_01"
  }
}
```

Success response:

```json
{
  "ok": true,
  "reference": "store_123_1746880000000",
  "sedifexOrderId": "ord_01JV...",
  "authorizationUrl": "https://checkout.paystack.com/...",
  "expiresAt": "2026-05-10T12:45:00Z"
}
```

### `GET /integration/orders/:reference` (authenticated)

Purpose: partner poll endpoint to verify outcome when webhook is delayed/unavailable.

Success response:

```json
{
  "ok": true,
  "reference": "store_123_1746880000000",
  "sedifexOrderId": "ord_01JV...",
  "storeId": "store_123",
  "clientOrderId": "WEB-98452",
  "orderType": "product",
  "paymentStatus": "success",
  "orderStatus": "confirmed",
  "bookingStatus": null,
  "amount": 90,
  "currency": "GHS",
  "updatedAt": "2026-05-10T12:51:10Z"
}
```
### Booking + checkout sequencing notes (service flows)

For website bookings using Sedifex checkout, standardize state transitions like this:

1. **When booking is first created**
   - `bookingStatus = "booked"`
   - `paymentCollectionMode = "online_checkout"`
   - `paymentStatus = "checkout_created"` (or `pending`)
   - Write `syncStatus: "pending"` and `syncRequestedAt` on create/update of `integrationBookings` docs.
2. **After customer lands on `returnUrl`**
   - Do **not** mark payment as confirmed from browser return alone.
3. **After Sedifex receives confirmed payment webhook**
   - Set `paymentStatus = "confirmed"`
   - Set `paymentConfirmedAt = <server_timestamp>`
   - Store `reference`, `sedifexOrderId`, and `clientOrderId` for reconciliation.

Important naming rule:

- Before checkout returns an order id, treat the local identifier as `bookingId` (not `sedifexOrderId`).
- Only persist/use `sedifexOrderId` after `POST /integration/checkout/create` returns it.

Support note:

- Confirm your `returnUrl` is reachable and renders a clear “payment processing/verification” state.
- For integration help, include your team contact details (for example support email and/or WhatsApp line) in your website support section.

### `POST /integration/webhooks/payment-status` (Sedifex outbound webhook)

Purpose: Sedifex sends final payment/order state updates to partner websites.

Delivery headers:

- `Content-Type: application/json`
- `X-Sedifex-Event: payment.succeeded | payment.failed | order.confirmed | booking.confirmed`
- `X-Sedifex-Delivery-Id: <uuid>`
- `X-Sedifex-Timestamp: <unix-ms>`
- `X-Sedifex-Signature: sha256=<hmac_of_raw_body>`
- `X-Sedifex-Contract-Version: 2026-04-13`

Webhook payload:

```json
{
  "event": "payment.succeeded",
  "deliveryId": "d_01JV....",
  "sentAt": "2026-05-10T12:51:04Z",
  "storeId": "store_123",
  "reference": "store_123_1746880000000",
  "sedifexOrderId": "ord_01JV...",
  "clientOrderId": "WEB-98452",
  "orderType": "product",
  "amount": 90,
  "currency": "GHS",
  "paymentStatus": "success",
  "paidAt": "2026-05-10T12:50:31Z",
  "fees": 1.2,
  "netAmount": 88.8
}
```

Partner receiver requirements:

1. Return `2xx` in under 5 seconds.
2. Process idempotently on `reference + event` (or `deliveryId`).
3. Verify HMAC signature using the shared webhook secret.

Retry policy (when non-2xx or timeout): `1m`, `5m`, `30m`, `2h`, `12h`.

### Golden path sequence

1. Partner website fetches catalog via `/v1IntegrationProducts` (server-side).
2. Buyer selects product/service.
3. Partner server calls `POST /integration/checkout/create`.
4. Buyer completes payment on returned Paystack `authorizationUrl`.
5. Paystack webhook updates Sedifex internal payment state.
6. Sedifex emits `POST /integration/webhooks/payment-status` to partner website.
7. Partner website updates local order status and storefront UI.
8. If webhook is delayed, partner polls `GET /integration/orders/:reference`.

### Service booking integration flow

Use this exact flow when the website is selling **services** (`orderType: "service"`).

**Step 1: Create the booking**

`POST /v1IntegrationBookings?storeId=store_123`

```json
{
  "serviceId": "svc_travel_001",
  "customer": {
    "name": "Ada Mensah",
    "phone": "+233201234567",
    "email": "ada@example.com"
  },
  "bookingDate": "2026-08-01",
  "bookingTime": "10:00 AM",
  "notes": "Schengen support",
  "paymentMethod": "paystack",
  "paymentAmount": 250,
  "attributes": {
    "source": "website_booking_form"
  }
}
```

Store the returned `bookingId`.

**Step 2: Create hosted checkout**

`POST /integration/checkout/create`

```json
{
  "storeId": "store_123",
  "clientOrderId": "BOOKING-bk_001",
  "orderType": "service",
  "currency": "GHS",
  "amount": 250,
  "customer": {
    "email": "ada@example.com",
    "phone": "+233201234567",
    "name": "Ada Mensah"
  },
  "returnUrl": "https://clientsite.com/payment/return",
  "metadata": {
    "bookingId": "bk_001",
    "channel": "client-website"
  }
}
```

Redirect the customer to the returned `authorizationUrl`.

**Step 3: Confirm final status**

Do **not** trust browser return alone. Confirm with:

- Sedifex payment webhook (`POST /integration/webhooks/payment-status` delivery), or
- `GET /integration/orders/:reference`

**Step 4: Update website UI**

Render booking/payment state from Sedifex values:

- `pending`
- `awaiting_verification`
- `partial`
- `confirmed`
- `cancelled`

### Security and go-live checklist

- Keep Sedifex API key server-side only (never in browser code).
- Persist `bookingId`, `reference`, and `clientOrderId` before redirecting checkout.
- Persist `sedifexOrderId` immediately after checkout creation returns successfully.
- Treat Sedifex webhook events as authoritative final state.
- Validate webhook signature and timestamp tolerance.
- Force-test retry path by returning `500` once from webhook receiver.
- Validate reconciliation export includes `reference`, amounts, and final status.

## Booking + Payment state model (service bookings)

Sedifex now tracks **independent** booking and payment states:
- `bookingStatus`: `booked | cancelled | rescheduled`
- `paymentCollectionMode`: `online_checkout | manual_transfer | momo_manual | cash | free | unknown`
- `paymentStatus`: `not_required | pending | checkout_created | awaiting_verification | partial | confirmed | failed | expired | rejected | refunded`
- `customerPaymentClaim`: `not_claimed | claimed_paid | claimed_partial | not_paid`

### Security rules
- Website/public booking submissions are **never** allowed to self-set `paymentStatus=confirmed`.
- A customer claim like “I paid” is stored as `customerPaymentClaim=claimed_paid` and `paymentStatus=awaiting_verification`.
- Checkout `returnUrl` only means redirect completed; it is **not** payment proof.
- Authoritative payment truth is from webhook confirmation and/or `GET /integration/orders/:reference`.

### Service checkout linkage
`POST /integration/checkout/create` supports `orderType=service` and metadata (`bookingId`, `clientOrderId`). Sedifex stores and reconciles: `bookingId`, `reference`, `sedifexOrderId`, `clientOrderId`.

### Manual verification
Use `POST /integration/booking/payment/verify` from trusted server/admin flows:
- `action=confirm` -> sets `paymentStatus=confirmed` (or `partial` when outstanding remains)
- `action=partial` -> sets `paymentStatus=partial`
- `action=reject` -> sets `paymentStatus=rejected`

### Flat Apps Script payload additions
Apps Script webhook targets continue receiving **flat payloads** and now include:
`bookingStatus`, `paymentCollectionMode`, `paymentStatus`, `customerPaymentClaim`, `paymentReference`, `manualPaymentReference`, `sedifexOrderId`, `clientOrderId`, `paymentConfirmedAt`, `paymentVerifiedAt`, `depositAmount`, `paymentAmount`, `amountOutstanding`, etc.

### Example Apps Script payloads

```json
{"eventType":"payment_pending","bookingStatus":"booked","paymentCollectionMode":"online_checkout","paymentStatus":"pending"}
{"eventType":"payment_awaiting_verification","bookingStatus":"booked","paymentCollectionMode":"manual_transfer","paymentStatus":"awaiting_verification","customerPaymentClaim":"claimed_paid"}
{"eventType":"payment_confirmed","bookingStatus":"booked","paymentCollectionMode":"online_checkout","paymentStatus":"confirmed"}
{"eventType":"payment_partial","bookingStatus":"booked","paymentCollectionMode":"manual_transfer","paymentStatus":"partial","depositAmount":50,"paymentAmount":100,"amountOutstanding":50}
```
