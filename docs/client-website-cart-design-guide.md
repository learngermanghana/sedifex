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
7. Add product detail sticky purchase panel.
8. Improve order status page language.

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
