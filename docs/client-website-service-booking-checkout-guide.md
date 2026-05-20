# Client Website Service Booking + Checkout Guide

Use this guide when a store website sells services and wants Sedifex to handle the booking record, customer record, checkout payment, payment verification, and optional Google Sheet sync.

This guide is based on real integration fixes from Glittering Med Spa, Pirus Consultancy, and Kwaku Asamoah Lottery/consultation sites. The main lesson is simple: create the booking first, then create checkout with the same store id and the same store-authorized integration key.

## Production base URL

```txt
https://us-central1-sedifex-web.cloudfunctions.net
```

Do not put the contract version in the URL path. The contract version is a request header.

## Required website environment variables

Use these names in the website backend, especially on Vercel/Next.js.

```env
SEDIFEX_API_BASE_URL=https://us-central1-sedifex-web.cloudfunctions.net
SEDIFEX_INTEGRATION_API_BASE_URL=https://us-central1-sedifex-web.cloudfunctions.net
SEDIFEX_BOOKING_TARGET_STORE_ID=store_123
SEDIFEX_BOOKING_API_KEY=sedx_store_key_here
SEDIFEX_CHECKOUT_API_KEY=sedx_store_key_here
SEDIFEX_INTEGRATION_CHECKOUT_CREATE_URL=https://us-central1-sedifex-web.cloudfunctions.net/integrationCheckoutCreate
SEDIFEX_CHECKOUT_RETURN_URL=https://clientsite.com/payment/return
SEDIFEX_CONTRACT_VERSION=2026-04-13
```

Recommended key reading order in client websites:

```ts
const apiKey =
  process.env.SEDIFEX_BOOKING_API_KEY ||
  process.env.SEDIFEX_CHECKOUT_API_KEY ||
  process.env.SEDIFEX_INTEGRATION_API_KEY ||
  process.env.SEDIFEX_INTEGRATION_KEY ||
  ''
```

Recommended store id reading order:

```ts
const storeId =
  process.env.SEDIFEX_BOOKING_TARGET_STORE_ID ||
  process.env.SEDIFEX_STORE_ID ||
  ''
```

Keep all keys server-side. Never expose these variables with `NEXT_PUBLIC_`.

## How a developer gets keys without Firebase access

Developers should not need access to the Sedifex Firebase project. The store owner or store admin should use the Sedifex UI to create the key and save the website setup.

Recommended owner/admin flow inside Sedifex:

1. Sign in to Sedifex.
2. Select the correct store/workspace.
3. Open **Integrations**.
4. Open **Website + checkout**.
5. Enter the website domain, checkout return URL, checkout cancel URL, API base URL, checkout create URL, and contract version.
6. Click **Save website setup**.
7. This writes the website/checkout config to both:

```txt
stores/{storeId}
storeSettings/{storeId}
```

8. Open **API keys**.
9. Click **Create and copy key**.
10. Copy the key immediately. The full key is shown once.
11. Send the developer only:

```txt
storeId
SEDIFEX_API_BASE_URL
SEDIFEX_INTEGRATION_CHECKOUT_CREATE_URL
SEDIFEX_BOOKING_TARGET_STORE_ID
SEDIFEX_BOOKING_API_KEY
SEDIFEX_CHECKOUT_API_KEY
SEDIFEX_CHECKOUT_RETURN_URL
SEDIFEX_CONTRACT_VERSION
```

Security rule: the raw API key should not be manually stored in plain text inside `storeSettings`. Sedifex should store key metadata/preview/hash internally, and the store owner should copy the generated key into the website host environment such as Vercel. If the key is lost, generate a new key from the UI and replace the website env vars.

What the developer does:

1. Add the copied values to the website backend environment variables.
2. Keep the key server-side only.
3. Deploy/redeploy the website.
4. Test service loading, booking creation, checkout redirect, and payment return.

## Store id and key rule

The integration key must be allowed for the same store id being used for booking and checkout.

Correct:

```txt
SEDIFEX_BOOKING_TARGET_STORE_ID=store_A
SEDIFEX_BOOKING_API_KEY=key_allowed_for_store_A
SEDIFEX_CHECKOUT_API_KEY=key_allowed_for_store_A
```

Wrong:

```txt
SEDIFEX_BOOKING_TARGET_STORE_ID=store_A
SEDIFEX_CHECKOUT_API_KEY=key_allowed_for_store_B
```

That mismatch returns `unauthorized`.

If a website has branches, the frontend may allow clients to select a branch store id for filtering services. The final booking/checkout can still be recorded under the main store, but this must be intentional:

```txt
selectedBranchStoreId = branch selected by client for service availability
SEDIFEX_BOOKING_TARGET_STORE_ID = store where final booking/payment should be saved
```

If all payments must go to the main store, use the main store id for `SEDIFEX_BOOKING_TARGET_STORE_ID`, and keep the selected branch in `attributes`.

## Required headers

Every server-to-server booking and checkout request should include:

```ts
const headers = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'X-Sedifex-Contract-Version': process.env.SEDIFEX_CONTRACT_VERSION || '2026-04-13',
  'x-api-key': apiKey,
  Authorization: `Bearer ${apiKey}`,
}
```

Using both `x-api-key` and `Authorization: Bearer` is recommended for compatibility across existing Sedifex integration functions.

## Correct service booking flow

### Step 1: Load services for the store or branch

Server-side request:

```http
GET /v1IntegrationProducts?storeId=store_123
```

Use the `publicServices` array for services. The selected service id should be the raw Sedifex id, not a display id with a store prefix.

### Step 2: Create the booking first

Endpoint:

```http
POST /v1IntegrationBookings?storeId=store_123
```

Example request:

```json
{
  "serviceId": "svc_001",
  "serviceName": "Pathway Clarity Session",
  "customer": {
    "name": "Ada Mensah",
    "phone": "+233201234567",
    "email": "ada@example.com"
  },
  "bookingDate": "2026-08-01",
  "bookingTime": "10:00",
  "notes": "Schengen support",
  "paymentMethod": "paystack_checkout",
  "paymentAmount": 250,
  "bookingStatus": "booked",
  "paymentCollectionMode": "online_checkout",
  "paymentStatus": "checkout_created",
  "syncStatus": "pending",
  "syncRequestedAt": "2026-08-01T08:00:00.000Z",
  "attributes": {
    "source": "website_booking_form",
    "channel": "client-website",
    "orderType": "service",
    "selectedBranchStoreId": "store_123",
    "selectedBranchServiceId": "svc_001"
  }
}
```

Store the returned `bookingId`. Before checkout returns an order id, treat the local identifier as `bookingId`, not `sedifexOrderId`.

### Step 3: Create hosted checkout

Endpoint:

```http
POST /integrationCheckoutCreate
```

Do not call old paths such as `/integration/checkout/create` unless that route is explicitly supported in the deployed backend. Prefer the direct deployed function URL:

```txt
https://us-central1-sedifex-web.cloudfunctions.net/integrationCheckoutCreate
```

Example request:

```json
{
  "storeId": "store_123",
  "merchantId": "store_123",
  "clientOrderId": "BOOKING-bk_001",
  "orderType": "service",
  "sourceChannel": "client_website",
  "sourceLabel": "Client Website",
  "currency": "GHS",
  "amount": 250,
  "customer": {
    "name": "Ada Mensah",
    "phone": "+233201234567",
    "email": "ada@example.com"
  },
  "items": [
    {
      "id": "svc_001",
      "item_id": "svc_001",
      "serviceId": "svc_001",
      "name": "Pathway Clarity Session",
      "serviceName": "Pathway Clarity Session",
      "unitPrice": 250,
      "price": 250,
      "qty": 1,
      "quantity": 1,
      "type": "SERVICE",
      "item_type": "service"
    }
  ],
  "returnUrl": "https://clientsite.com/payment/return",
  "metadata": {
    "bookingId": "bk_001",
    "clientOrderId": "BOOKING-bk_001",
    "channel": "client-website"
  }
}
```

Redirect the customer to the returned `authorizationUrl` or `checkoutUrl`.

### Step 4: Return page must not mark payment confirmed

The browser return page should show a friendly processing message only:

```txt
Payment is being verified. We have received your checkout return and Sedifex will confirm the final payment status.
```

Do not mark the booking as paid only because the customer reached `returnUrl`. Payment is confirmed by the Sedifex payment webhook or by checking order status.

### Step 5: Payment confirmation

Final confirmation should come from one of these:

```http
POST /integration/webhooks/payment-status
GET /integration/orders/:reference
```

After Sedifex confirms payment, the booking/order should store:

```txt
paymentStatus=confirmed or paid
paymentConfirmedAt=<server timestamp>
paymentReference=<provider reference>
sedifexOrderId=<order id, when available>
clientOrderId=BOOKING-<bookingId>
```

## Google Sheet / Apps Script sync

If a store wants booking confirmations to update a Google Sheet:

1. Deploy the Apps Script as a Web App.
2. Save the Web App URL in the store record or store settings.
3. Confirm/Cancel/Complete actions in Sedifex should set:

```txt
syncStatus=pending
syncReason=booking_confirmed | booking_cancelled | booking_completed
syncRequestedAt=<timestamp>
```

Example Firestore config that the admin UI can detect:

```txt
stores/{storeId}.bookingSync.enabled=true
stores/{storeId}.bookingSync.webAppUrl=https://script.google.com/macros/s/.../exec
stores/{storeId}.appScriptBookingSyncEnabled=true
```

The Apps Script does not pull from Sedifex automatically. It only updates when Sedifex POSTs booking data to the Web App URL, or when a backend worker processes `syncStatus=pending` and posts the payload.

## Customer auto-save behavior

`POST /v1IntegrationBookings` saves or updates the customer under:

```txt
stores/{storeId}/customers
```

Sedifex searches by phone first, then email, and links the booking with `customerId`. This only happens when the website creates the booking through `v1IntegrationBookings` before checkout.

## Common errors and fixes

### `unauthorized`

Most common causes:

- Missing `x-api-key` header.
- Website uses `SEDIFEX_BOOKING_API_KEY`, but code only reads `SEDIFEX_INTEGRATION_API_KEY`.
- The key belongs to a different store than `storeId`.
- Checkout uses one store id while booking uses another store id.
- Website calls the old checkout route instead of `integrationCheckoutCreate`.
- Vercel env vars were changed but the site was not redeployed.

Fix checklist:

```txt
1. Confirm storeId copied from the Sedifex UI, not typed manually.
2. Confirm the integration key was generated from the same store workspace.
3. Add both headers: x-api-key and Authorization: Bearer.
4. Use /v1IntegrationBookings first.
5. Use /integrationCheckoutCreate second.
6. Redeploy the website after env changes.
```

### Booking email sent but booking not visible in Sedifex UI

Likely cause: checkout was created directly without first creating a booking in `v1IntegrationBookings`.

Fix: create the booking first, then pass `bookingId` into checkout metadata.

### Booking appears in Sedifex but customer not saved

Likely cause: the website is not using `v1IntegrationBookings`, or the payload lacks `customer.name`, `customer.phone`, and `customer.email`.

### Return page crashes

Add a route like `/payment/return` that safely reads `reference` and `trxref`, then shows a processing/verification message.

## Minimal Next.js backend example

```ts
const baseUrl = process.env.SEDIFEX_API_BASE_URL || 'https://us-central1-sedifex-web.cloudfunctions.net'
const storeId = process.env.SEDIFEX_BOOKING_TARGET_STORE_ID || process.env.SEDIFEX_STORE_ID || ''
const apiKey = process.env.SEDIFEX_BOOKING_API_KEY || process.env.SEDIFEX_CHECKOUT_API_KEY || process.env.SEDIFEX_INTEGRATION_API_KEY || ''

const headers = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'X-Sedifex-Contract-Version': '2026-04-13',
  'x-api-key': apiKey,
  Authorization: `Bearer ${apiKey}`,
}

const bookingRes = await fetch(`${baseUrl}/v1IntegrationBookings?storeId=${encodeURIComponent(storeId)}`, {
  method: 'POST',
  headers,
  body: JSON.stringify(bookingPayload),
})

const bookingData = await bookingRes.json()
const bookingId = bookingData.bookingId || bookingData.id || bookingData.data?.bookingId

const checkoutRes = await fetch(process.env.SEDIFEX_INTEGRATION_CHECKOUT_CREATE_URL || `${baseUrl}/integrationCheckoutCreate`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    ...checkoutPayload,
    storeId,
    merchantId: storeId,
    clientOrderId: `BOOKING-${bookingId}`,
    metadata: { bookingId },
  }),
})

const checkoutData = await checkoutRes.json()
const redirectUrl = checkoutData.authorizationUrl || checkoutData.checkoutUrl
```

## Deployment checklist for a new store

- [ ] Store owner/admin selects the correct store/workspace in Sedifex.
- [ ] Store owner/admin saves Website + checkout settings in the Sedifex Integrations UI.
- [ ] Store owner/admin generates a store integration key in the Sedifex API keys tab.
- [ ] Developer receives Store ID, env block, and API key from the store owner/admin, not from Firebase.
- [ ] Add website env vars on Vercel.
- [ ] Redeploy the website after adding env vars.
- [ ] Test service list loading.
- [ ] Test booking creation.
- [ ] Confirm booking appears in Sedifex Bookings.
- [ ] Confirm customer appears in Sedifex Customers.
- [ ] Test checkout redirect.
- [ ] Confirm `/payment/return` does not crash.
- [ ] Confirm payment webhook/order status updates final payment status.
- [ ] If using Sheets, configure Apps Script Web App URL and test Confirm booking sync.
