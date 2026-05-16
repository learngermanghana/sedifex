# Sedifex Platform Updates 2026

This document summarizes the current Sedifex platform model after the recent marketplace, checkout, booking, dashboard, and engagement updates.

Sedifex is now the source of truth for:

- Product orders from Sedifex Market
- Product orders from merchant/client websites
- Pay-on-delivery orders
- Online paid orders
- Service bookings and registrations
- Product comments and favorites across platforms
- Merchant dashboard visibility and moderation

Use this document together with:

- `docs/integration-contract.md`
- `docs/integration-api-guide.md`
- `docs/engagement-cross-platform-integration-reference.md`

---

## 1. Source-of-truth mapping

Use this mapping everywhere in code, docs, integrations, and support workflows.

| Domain | Source-of-truth collection/API | Dashboard surface | Notes |
|---|---|---|---|
| Product orders from Sedifex Market | `integrationOrders` | Online Orders | Includes online paid and pay-on-delivery product orders. |
| Product orders from merchant/client websites | `integrationOrders` | Online Orders | Website must send `sourceChannel: client_website`. |
| Product pay-on-delivery orders | `integrationOrders` | Online Orders → Pay on Delivery | Free launch policy currently applies. |
| Service bookings from Sedifex Market | `integrationBookings` | Bookings + Online Orders | Service flow should create booking first. |
| Service bookings from merchant/client websites | `integrationBookings` | Bookings + Online Orders | Includes schools, travel, beauty appointments, registrations. |
| Lead-only enquiries | `checkoutRequests` | Leads/support workflow | Use only when no paid order or booking is created. |
| Payment/webhook logs | `integrationWebhookEvents` | Debug/audit only | Do not treat webhook logs as the canonical order record. |
| Product comments | `engagement_comments` | Product Engagement | Cross-platform comments from Sedifex Market and websites. |
| Product favorites/reactions | `engagement_favorites` | Product Engagement | Cross-platform favorites/reactions. |
| Engagement summary | `engagement_threads` | Product Engagement | Aggregated by canonical product key. |

Do not use `integrationBookings` for product purchases. Do not create a separate permanent order system on merchant websites. Sedifex should stay authoritative.

---

## 2. Dashboard route changes

The old marketplace-only dashboard view has been reframed as:

```txt
Online Orders
```

Primary route:

```txt
/online-orders
```

Legacy route:

```txt
/marketplace-orders → redirects to /online-orders
```

Online Orders reads from:

```txt
integrationOrders
integrationBookings
```

Tabs shown to merchants:

```txt
All Product Orders
Service Bookings
Sedifex Market
Client Website
Pay on Delivery
Manual Payment
Online Paid
```

During launch, stores can view and contact customers, but Sedifex support controls official marketplace/order confirmation to avoid uncontrolled status changes.

---

## 3. Required channel metadata

Every external order or booking should include source/channel metadata.

Recommended fields:

```ts
{
  sourceChannel: 'sedifex_market' | 'client_website' | 'sedifex_custom_page';
  source_channel: string;
  sourceLabel: string;
  source_label: string;
  orderType: 'product' | 'service';
  clientOrderId: string;
  client_order_id: string;
  sedifexOrderId: string;
  reference: string;
  storeId: string;
  merchantId: string;
}
```

Recommended labels:

```txt
Sedifex Market
Client Website
Sedifex Public Page
Hajia Slay Shop Website
```

The dashboard uses these fields to separate Sedifex Market orders from client website orders.

---

## 4. Product checkout model

### 4.1 Sedifex Market product checkout

```txt
Customer buys product on Sedifex Market
→ Sedifex creates integrationOrders
→ merchant sees it in Online Orders
→ Sedifex support follows up during launch
```

Online payment product order:

```txt
paymentCollectionMode: online_checkout
paymentStatus: pending | success | confirmed
orderStatus: processing | confirmed | delivered
sourceChannel: sedifex_market
```

Pay-on-delivery product order:

```txt
paymentCollectionMode: pay_on_delivery
paymentStatus: pending_cash_collection
orderStatus: pending_delivery
sourceChannel: sedifex_market
feePolicy.policyKey: sedifex_free_pay_on_delivery_v1
```

### 4.2 Client website product checkout

Recommended merchant website flow:

```txt
1. Fetch catalog from Sedifex server-side.
2. Render product page using Sedifex product id/sourceProductId.
3. Place checkout directly on the product page for simple storefronts.
4. Customer selects Online Payment or Pay on Delivery.
5. Website server submits checkout/order to Sedifex.
6. Sedifex creates integrationOrders.
7. Merchant sees it in Online Orders.
```

A separate `/checkout` page is only needed for a full multi-product cart. For small stores, inline product-page checkout is simpler and matches Sedifex Market.

### 4.3 Pay-on-delivery product endpoint

Use:

```http
POST /integration/orders/request
```

Example payload:

```json
{
  "merchantId": "STORE_ID",
  "storeId": "STORE_ID",
  "productId": "SEDIFEX_PRODUCT_ID",
  "productName": "Product name",
  "quantity": 1,
  "unitPrice": 70,
  "currency": "GHS",
  "sourceChannel": "client_website",
  "sourceLabel": "Client Website",
  "clientOrderId": "WEB-POD-1778870000000",
  "customer": {
    "name": "Buyer Name",
    "email": "buyer@example.com",
    "phone": "+233200000000"
  },
  "delivery": {
    "location": "Accra",
    "notes": "Call before delivery"
  }
}
```

Expected behavior:

```txt
Creates integrationOrders
Sets paymentCollectionMode = pay_on_delivery
Sets paymentStatus = pending_cash_collection
Sets orderStatus = pending_delivery
Shows in Online Orders → Pay on Delivery
```

---

## 5. Launch fee policy for pay on delivery

Pay on delivery is free during launch.

Current fee policy:

```ts
{
  policyKey: 'sedifex_free_pay_on_delivery_v1',
  customerProcessingFeeMajor: 0,
  sedifexCommissionMajor: 0,
  customerPaysProcessingFee: false,
  merchantPaysCommission: false,
  commissionCollectionMode: 'free_launch_period'
}
```

Future versions can introduce a Sedifex commission, store subscription rule, or customer service fee, but that is not active for launch.

---

## 6. Service booking model

Services, appointments, classes, registrations, consultations, travel packages, and school admissions should be treated as bookings.

Use:

```txt
integrationBookings
```

Service flow:

```txt
Customer selects service
→ create booking first
→ optional online checkout linked to bookingId/clientOrderId
→ webhook confirms payment
→ merchant sees booking in Bookings and Online Orders
```

Manual service booking:

```txt
bookingStatus: pending_store_confirmation
paymentCollectionMode: manual | manual_transfer | cash
paymentStatus: pending_manual | awaiting_verification
orderType: service
sourceChannel: sedifex_market | client_website
```

Online service booking:

```txt
bookingStatus: pending_store_confirmation
paymentCollectionMode: online_checkout
paymentStatus: pending | checkout_created | confirmed
orderType: service
reference: Sedifex/Paystack reference
```

Browser return from Paystack is not final payment proof. Final state must come from webhook verification or `GET /integration/orders/:reference`.

---

## 7. Customer-facing status labels

Customer UIs should display friendly labels instead of raw internal statuses.

| Internal status | Customer label |
|---|---|
| `pending_cash_collection` | Pay on delivery |
| `pending_delivery` | Waiting for store delivery |
| `pending_store_confirmation` | Waiting for store confirmation |
| `pending_manual` | Manual payment pending |
| `pending_payment` | Waiting for payment |
| `cash_collected` | Payment collected on delivery |
| `confirmed_by_store` | Confirmed by store |
| `delivered` | Delivered |
| `completed` | Completed |
| `cancelled_by_store` | Cancelled by store |

---

## 8. Cross-platform product engagement

Sedifex now supports product comments and favorites across:

```txt
Sedifex Market
Merchant websites
Sedifex custom/public pages
```

All platforms must resolve a product to the same canonical key:

```ts
canonicalProductKey = `${storeId}:${sourceProductId}`
```

Collections:

```txt
engagement_threads/{canonicalProductKey}
engagement_comments/{commentId}
engagement_favorites/{canonicalProductKey_userId}
```

### Comment fields

```ts
{
  canonicalProductKey: string;
  storeId: string;
  sourceProductId: string;
  publicProductId?: string | null;
  body: string;
  authorDisplayName: string;
  originPlatform: 'sedifexmarket' | 'storefront' | 'website_api';
  status: 'pending' | 'approved' | 'rejected';
  moderationStatus: 'pending' | 'approved' | 'rejected';
  visibility: 'public' | 'store_only';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Favorite fields

```ts
{
  canonicalProductKey: string;
  storeId: string;
  sourceProductId: string;
  userId: string;
  originPlatform: 'sedifexmarket' | 'storefront' | 'website_api';
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

## 9. Engagement API shape

Sedifex Market currently supports local fallback routes when the central engagement API is not configured:

```txt
GET  /api/engagement/comments
POST /api/engagement/comments
GET  /api/engagement/summary
POST /api/engagement/reactions
```

Recommended central Sedifex API names:

```txt
GET    /v1/engagement/comments
POST   /v1/engagement/comments
PATCH  /v1/engagement/comments/{id}
GET    /v1/engagement/summary
POST   /v1/engagement/favorites
DELETE /v1/engagement/favorites
POST   /v1/engagement/resolve
```

Comment write payload:

```json
{
  "public_product_id": "PUBLIC_PRODUCT_DOC_ID",
  "store_id": "STORE_ID",
  "source_product_id": "SEDIFEX_PRODUCT_ID",
  "text": "I like this product"
}
```

---

## 10. Product Engagement dashboard

New dashboard surface:

```txt
Product Engagement
/product-engagement
```

Actions:

```txt
Approve → status: approved, visibility: public
Hide    → status: rejected, visibility: store_only
Reject  → status: rejected, visibility: store_only
```

Approved public comments can be shown across Sedifex Market and merchant websites.

---

## 11. Firestore rules and indexes

Core repo includes Firestore rules/indexes for engagement and integrations:

```txt
firestore.rules
firestore.indexes.json
```

Important indexes:

```txt
engagement_comments: canonicalProductKey ASC, createdAt DESC
engagement_comments: storeId ASC, createdAt DESC
engagement_comments: storeId ASC, status ASC, createdAt DESC
engagement_favorites: canonicalProductKey ASC, active ASC
engagement_favorites: storeId ASC, updatedAt DESC
engagement_threads: storeId ASC, updatedAt DESC
```

Deploy:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

---

## 12. Public blog integration

Stores can publish blog posts in Sedifex and expose them to websites.

Public endpoint:

```txt
GET /api/public-blog?storeId=<storeId>
GET /api/public-blog?storeId=<storeId>&slug=<postSlug>
```

This returns only published posts.

---

## 13. Website integration checklist

Before launching a merchant website:

- Products load from Sedifex catalog, not a stale local array.
- API keys are server-side only.
- Product orders write to `integrationOrders`.
- Service bookings write to `integrationBookings`.
- Online payment uses `POST /integration/checkout/create`.
- Pay on delivery uses `POST /integration/orders/request`.
- Website sends `sourceChannel: client_website`.
- Website sends `clientOrderId` and stores Sedifex `reference`.
- Product checkout collects phone and delivery location.
- Comments/favorites resolve with `storeId + sourceProductId`.
- Merchant can see results in Sedifex dashboard:
  - Online Orders
  - Product Engagement
  - Bookings

---

## 14. Recommended status flow

Product pay on delivery:

```txt
pending_cash_collection + pending_delivery
→ Sedifex follow-up
→ delivered/cash_collected later
```

Product online payment:

```txt
pending_payment
→ payment webhook success
→ confirmed
→ delivered
```

Service booking:

```txt
pending_store_confirmation
→ confirmed_by_store or Sedifex follow-up
→ completed
```

During launch, Sedifex support should manage confirmation so merchants do not accidentally change official order state too early.
