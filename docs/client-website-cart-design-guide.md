# Client website cart and checkout design guide

Use this guide when building Sedifex-powered client websites such as beauty shops, fashion stores, restaurants, schools, travel agencies, or service businesses.

Most client website guides explain only the Sedifex integration path. This guide explains how to design the shopping experience so customers can add multiple items, review their cart, and check out without confusion.

## Goal

A client website should not feel like a static catalog with one `Buy now` button per item. It should feel like a modern store:

```text
Browse products -> Add to cart -> Continue shopping -> Review cart -> Checkout -> Pay -> Sedifex receives the order
```

This works well for websites like:

- `hajiaslayshop.com`
- beauty product shops
- food and drink ordering sites
- school/course registration sites
- service booking websites
- travel package websites

## Recommended site structure

For most client websites, use these pages/components:

```text
/
/products
/products/[slug]
/services
/services/[slug]
/cart or cart drawer
/checkout
/checkout/success
/checkout/failed
/order/[reference]
```

A very small site can avoid a separate `/cart` page and use a cart drawer only. A bigger shop can use both a cart drawer and a full `/checkout` page.

## Product card design

Each product card should show only the important buying information:

```text
[Product image]
Product name
Price
Short category/trust label
[Add to cart] [View details]
```

Recommended product card actions:

```text
Primary: Add to cart
Secondary: View details
```

Avoid making `Buy now` the only action on product cards. It forces customers to checkout too early and reduces multi-item purchases.

### Product card example

```tsx
<button onClick={() => addToCart(product)}>Add to cart</button>
<Link href={`/products/${product.slug}`}>View details</Link>
```

For services, change the wording:

```text
[Add service] [View details]
```

For courses/classes:

```text
[Add class] [View details]
```

## Header cart design

Every page should show a cart button in the header:

```text
Cart (0)
Cart (2)
Cart (2) · GH₵ 350.00
```

Rules:

- Keep the cart visible on desktop and mobile.
- Do not hide it inside a menu on shopping pages.
- Clicking the cart should open a drawer or go to `/cart`.
- Show item count immediately after `Add to cart`.

## Mobile floating cart button

On phone screens, show a floating cart button after the customer adds the first item.

Example:

```text
🛒 Cart 3 · GH₵ 450.00
```

Recommended behavior:

- Fixed near the bottom-right, or as a full-width bottom bar.
- Visible only when cart has at least one item.
- Opens cart drawer or `/cart` page.
- Should not cover WhatsApp, checkout, or form submit buttons.

## Product detail page design

Product detail pages should have a purchase panel. This is better than sending the customer straight to checkout.

Desktop layout:

```text
Product images and description       Purchase panel
                                     Price
                                     Quantity [-] 1 [+]
                                     [Add to cart]
                                     [Checkout now]
```

Mobile layout:

```text
Sticky bottom bar:
Price | Add to cart | Checkout
```

`Checkout now` should still add the current item to cart first, then open the cart/checkout review. This prevents lost carts and keeps the checkout flow consistent.

## Cart drawer design

The cart drawer should be quick and simple.

Recommended drawer sections:

```text
Your cart
2 items · GH₵ 350.00

Item 1
Store name
GH₵ 100.00 each
[-] 1 [+] Remove

Item 2
Store name
GH₵ 250.00 each
[-] 1 [+] Remove

Customer details
Full name
Email
Phone
Delivery location / landmark
Order note

[Checkout with Paystack]
```

Do not ask the customer for payment, delivery, and long personal details before they have reviewed the cart.

## Multi-cart data model

Use one cart array. Each cart item must include `merchantId` because a website may later support multiple Sedifex stores or split checkout by merchant.

```ts
export type CartItem = {
  productId: string
  merchantId: string
  productName: string
  quantity: number
  type: 'PRODUCT' | 'SERVICE'
  price?: number | null
  currency?: string
  imageUrl?: string
  storeName?: string
}
```

Recommended local cart key:

```ts
const CART_STORAGE_KEY = 'sedifex_cart_v1'
```

Recommended dedupe key:

```ts
const cartKey = `${merchantId}:${productId}:${type}`
```

When the same item is added twice, increase quantity instead of adding duplicate rows.

## Add-to-cart logic

Recommended helper:

```ts
function addToCart(nextItem: CartItem) {
  setCart(current => {
    const key = `${nextItem.merchantId}:${nextItem.productId}:${nextItem.type}`
    const existing = current.find(item => `${item.merchantId}:${item.productId}:${item.type}` === key)

    if (!existing) {
      return [...current, { ...nextItem, quantity: Math.max(1, nextItem.quantity || 1) }]
    }

    return current.map(item =>
      `${item.merchantId}:${item.productId}:${item.type}` === key
        ? { ...item, quantity: item.quantity + Math.max(1, nextItem.quantity || 1) }
        : item
    )
  })
}
```

## Cart persistence

For simple client websites, use `localStorage` first:

```ts
useEffect(() => {
  const saved = window.localStorage.getItem('sedifex_cart_v1')
  if (saved) setCart(JSON.parse(saved))
}, [])

useEffect(() => {
  window.localStorage.setItem('sedifex_cart_v1', JSON.stringify(cart))
}, [cart])
```

For signed-in customer accounts later, you can move cart storage to Firestore or your backend, but localStorage is enough for most public websites.

## Checkout payload

When the customer clicks checkout, send the full cart to your website API route. The API route should then call Sedifex checkout/create.

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
    "location": "Tema Community 25",
    "notes": "Call before delivery"
  }
}
```

The website should not calculate final trusted totals in the browser. Use the browser cart for display, but let the backend/Sedifex confirm prices, fees, payment split, and checkout total.

## Critical checkout path: match product IDs before payment

When a client website pulls products from Sedifex, product IDs can appear in one of two shapes:

```text
Raw Sedifex product ID:
draft-2b188221-828f-4229-8d7d-3ab6eea4448f

Store-prefixed website/marketplace ID:
rQYE4FQGVZPcUpdptdgeRo5A80G2_draft-2b188221-828f-4229-8d7d-3ab6eea4448f
```

Both can be useful in the website UI, but checkout must send the raw Sedifex item ID to Sedifex. If the website sends the prefixed ID, the product can show correctly in the website while checkout, order lookup, inventory update, or payment reconciliation can fail later.

Use this helper in the website API route before calling Sedifex checkout/create:

```ts
function normalizeSedifexItemId(rawId: string, storeId: string) {
  const id = rawId.trim()
  const storePrefix = `${storeId}_`

  if (storeId && id.startsWith(storePrefix)) {
    return id.slice(storePrefix.length)
  }

  return id
}
```

Then use the normalized ID in both `cart` and `items`:

```ts
cart: validatedItems.map(item => {
  const productId = normalizeSedifexItemId(item.product.id, storeId)

  return {
    productId,
    item_id: productId,
    originalProductId: item.product.id,
    merchantId: storeId,
    merchant_id: storeId,
    storeId,
    store_id: storeId,
    quantity: item.qty,
    qty: item.qty,
    type: 'PRODUCT',
    item_type: 'product',
  }
}),
items: validatedItems.map(item => {
  const productId = normalizeSedifexItemId(item.product.id, storeId)

  return {
    id: productId,
    item_id: productId,
    productId,
    originalProductId: item.product.id,
    name: item.product.name,
    unitPrice: item.product.price,
    price: item.product.price,
    qty: item.qty,
    quantity: item.qty,
    type: 'PRODUCT',
    item_type: 'product',
  }
})
```

Keep `originalProductId` for debugging, but do not rely on it for Sedifex checkout item matching.

### Why this matters

A site can successfully pull and display products with the same integration key, but payment/order matching can still break if the checkout route sends a different item ID shape than the product route. The checkout path must match the product path by using:

```text
storeId = Sedifex store ID
item_id/productId = raw Sedifex product or service ID without the store prefix
```

This is the same pattern used by Sedifex Market-style carts where the display ID may include the merchant/store prefix, but the backend checkout payload strips the prefix before sending the item to Sedifex.

## Client website API route pattern

The customer-facing website should never call Sedifex checkout directly from browser code. Use a server route such as:

```text
POST /api/sedifex/checkout/create
```

The route should:

1. Read cart/customer/delivery details from the browser request.
2. Load trusted product data from Sedifex or the website’s synced catalog.
3. Validate product existence and stock.
4. Strip `storeId_` from item IDs before sending to Sedifex.
5. Send `storeId`, `store_id`, `merchantId`, and `merchant_id` for compatibility.
6. Send `clientOrderId` and `client_order_id` using a clear reference such as `HAJ-PAY-<timestamp>`.
7. Send `returnUrl` pointing to `/checkout/success` and `cancelUrl` pointing to `/checkout/failed`.
8. Return `authorizationUrl`, `checkoutUrl`, `reference`, and `clientOrderId` to the browser.

Example server-side payload:

```ts
const payload = {
  storeId,
  store_id: storeId,
  merchantId: storeId,
  merchant_id: storeId,
  clientOrderId,
  client_order_id: clientOrderId,
  sourceChannel: 'client_website',
  source_channel: 'client_website',
  sourceLabel: 'Client Website',
  source_label: 'Client Website',
  orderType: 'product',
  currency: 'GHS',
  cart,
  items,
  amount,
  customer: {
    name: customerName,
    email: customerEmail,
    phone: customerPhone,
  },
  delivery: {
    location: deliveryLocation,
    notes,
  },
  returnUrl,
  cancelUrl,
  syncStatus: 'pending',
  syncRequestedAt: new Date().toISOString(),
}
```

For Firebase Functions URLs, the route may map cleanly to:

```text
https://us-central1-<project>.cloudfunctions.net/integrationCheckoutCreate
```

For proxy/API deployments, it may map to:

```text
/integration/checkout/create
```

The client website should hide this difference inside its own server API route.

## Paystack redirect snapshot and success fallback

After the website API route returns a Paystack URL, store a small checkout snapshot in `sessionStorage` before redirecting the customer to Paystack. This protects the success page if the order-status API or webhook reconciliation is delayed.

```ts
const checkoutUrl = data.authorizationUrl ?? data.checkoutUrl

if (checkoutUrl) {
  const reference = data.reference ?? data.paymentReference ?? data.payment_reference ?? data.clientOrderId
  const amountPaid = typeof data.amountPaid === 'number' ? data.amountPaid : subtotal

  sessionStorage.setItem('checkout:last_customer', JSON.stringify({
    name: name.trim(),
    email: email.trim(),
    phone: phone.trim(),
    deliveryLocation: deliveryLocation.trim(),
    reference,
    amountPaid,
    amount: amountPaid,
    currency,
    status: 'success',
  }))

  window.location.href = checkoutUrl
}
```

This snapshot is not the source of truth for Sedifex. It is a customer-facing fallback so the success page can show a good receipt immediately after Paystack redirects back.

## Success page retrieval pattern

On `/checkout/success`, read the Paystack query reference first:

```text
/checkout/success?trxref=HAJ-PAY-1779044041118&reference=HAJ-PAY-1779044041118
```

Then call your own website API route:

```text
GET /api/sedifex/orders/:reference
```

That API route should call Sedifex order status server-side using the store integration key. The browser should not receive the Sedifex key.

The success page should merge values in this order:

```text
1. Sedifex order-status response
2. Paystack URL reference
3. sessionStorage checkout snapshot
4. safe display fallback such as Pending or Syncing
```

Example display mapping:

```ts
const receiptReference = firstValue(
  details?.reference,
  details?.paymentReference,
  details?.payment_reference,
  details?.paystackReference,
  urlReference,
  customerSnapshot?.reference,
  'Pending'
)

const amountPaid = firstValue(
  details?.amountPaid,
  details?.amount_paid,
  details?.amount,
  customerSnapshot?.amountPaid,
  customerSnapshot?.amount
)

const status = firstValue(
  details?.status,
  details?.orderStatus,
  details?.order_status,
  details?.paymentStatus,
  details?.payment_status,
  details?.syncStatus,
  details?.sync_status,
  customerSnapshot?.status
)
```

Format friendly statuses for customers:

```ts
function formatStatus(value?: string) {
  if (!value) return 'Syncing'
  const normalized = value.trim().toLowerCase()
  if (['success', 'paid', 'confirmed', 'captured'].includes(normalized)) return 'Confirmed'
  if (['pending', 'pending_payment', 'syncing'].includes(normalized)) return 'Syncing'
  if (['failed', 'payment_failed'].includes(normalized)) return 'Payment failed'
  return value.replace(/_/g, ' ')
}
```

A good customer-facing success page should still look complete even if Sedifex order-status is slow for a few seconds:

```text
Payment successful 🎉

Thank you, Customer Name. Your order has been received.

Receipt: HAJ-PAY-1779044041118
Email: customer@example.com
Phone: 0245038473
Amount paid: GH₵120.00
Status: Confirmed
```

## Phone and delivery field validation

Always validate customer phone before redirecting to Paystack. Otherwise a customer can accidentally put the delivery location into the phone field and the success page will display the wrong value.

Recommended validation:

```ts
function isValidPhone(value: string) {
  const digits = value.replace(/\D/g, '')
  return digits.length >= 9 && digits.length <= 15
}
```

Block checkout if the phone is invalid:

```ts
if (!isValidPhone(phone)) {
  setStatus('Please enter a valid phone number, for example 024 000 0000 or +233 24 000 0000.')
  return
}
```

Also protect the success page:

```ts
function formatPhone(value?: string) {
  const phone = typeof value === 'string' ? value.trim() : ''
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 9 || digits.length > 15) return 'Pending'
  return phone
}
```

## Multi-merchant checkout

Even if a client website currently sells for only one store, build the cart with `merchantId` now. This makes the design future-proof.

Checkout backend should:

1. Group cart items by `merchantId`.
2. Create one checkout per merchant.
3. Save each order with clear references.
4. Return checkout URLs to the frontend.

Example response:

```json
{
  "ok": true,
  "merchantCheckouts": [
    {
      "merchantId": "store_123",
      "reference": "store_123_1778944353567_abcd",
      "checkoutUrl": "https://checkout.paystack.com/..."
    }
  ]
}
```

If the cart contains items from two stores, show two payment buttons or create a combined orchestration screen depending on the business model.

## Checkout page design

A professional checkout page should show:

```text
Checkout

Customer details
Full name
Email
Phone

Delivery details
Location / address
Notes

Order summary
Product A x2     GH₵ 200.00
Product B x1     GH₵ 150.00
Fees             GH₵ 6.83
Total            GH₵ 356.83

[Pay securely with Paystack]
```

Keep the checkout page clean. Do not show too many banners, animations, or unrelated products at the final payment step.

## Status page design

After payment, send customers to an order status page.

Recommended fields:

```text
Order confirmed
Payment successful
Reference: store_123_1778944353567_abcd
Amount: GH₵ 356.83

The store will contact you for delivery.
Keep this reference for support.
```

Use customer-friendly labels:

```text
Payment pending
Payment successful
Order confirmed
Waiting for delivery
Pay on delivery
Manual payment pending
Cancelled
```

Avoid raw technical names like:

```text
pending_cash_collection
pending_store_confirmation
pending_manual
pending_delivery
```

## Services and bookings

For services, the cart can still work, but the checkout form may need extra booking fields:

```text
Preferred date
Preferred time
Branch/location
Notes
```

For schools/classes, use:

```text
Student name
Phone
Program/class
Preferred start date
Parent/guardian contact if needed
```

For travel, use:

```text
Travel date
Number of travelers
Pickup location
Passport/visa note if needed
```

Put these vertical-specific fields inside `booking` or `attributes` when sending to Sedifex.

## Recommended component list for new websites

When building a new Sedifex-powered website, create these reusable components from the start:

```text
components/ProductCard.tsx
components/ProductGrid.tsx
components/CartProvider.tsx
components/CartButton.tsx
components/CartDrawer.tsx
components/ProductPurchasePanel.tsx
components/CheckoutSummary.tsx
components/OrderStatusCard.tsx
```

This prevents spending hours redesigning the checkout every time.

## Minimal implementation order

If you are starting from an existing website like `hajiaslayshop`, implement in this order:

1. Add `CartProvider` with localStorage.
2. Add `Add to cart` on product cards.
3. Add header cart count.
4. Add mobile floating cart button.
5. Add cart drawer with quantity controls.
6. Connect cart drawer to existing Sedifex checkout API route.
7. Strip `storeId_` from product/service IDs before sending checkout payloads to Sedifex.
8. Store Paystack redirect snapshot before leaving the website.
9. Add success page fallback display from order-status response, URL reference, and session snapshot.
10. Add product detail sticky purchase panel.
11. Improve order status page language.

## Visual design checklist

Before handoff, confirm:

- Product cards are not too tall.
- `Add to cart` is the strongest button.
- `View details` is secondary.
- Header cart is always visible.
- Mobile floating cart appears after adding an item.
- Cart drawer does not cover the whole mental flow with too many fields.
- Quantity controls are easy to tap.
- Checkout total is clear before Paystack opens.
- Paystack button says `Pay securely with Paystack` or `Checkout with Paystack`.
- Status page clearly says payment/order result.
- Success page shows reference, amount, phone, and friendly status.
- WhatsApp contact is secondary, not the main checkout path when online checkout is enabled.

## Copy examples

Use these labels:

```text
Add to cart
Added to cart
View details
Continue shopping
Checkout now
Checkout with Paystack
Pay securely
Order confirmed
Payment successful
Store will contact you for delivery
```

Avoid these labels as primary actions:

```text
Submit
Send
Request
Buy now only
Contact seller only
```

## Notes for Sedifex-powered sites

- The website is the customer shopping interface.
- Sedifex remains the source of truth for product data, checkout records, payment status, and merchant dashboard visibility.
- Keep integration keys on the server only.
- Do not expose Sedifex API keys in browser code.
- Browser cart can show estimated totals, but backend/Sedifex must confirm trusted totals.
- Product display IDs and checkout item IDs must be normalized before payment.
- The success page should use a short-lived browser snapshot only as a display fallback, not as permanent payment truth.
