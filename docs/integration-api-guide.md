# Sedifex Integration API Guide

This guide explains how a partner website connects to Sedifex for **products/services**, **bookings**, and **website builder public content** such as hero slides and social/contact profile data.

The most important rule is simple:

> Use **one Website Integration API key** for the whole website. The same key can load products/services, create bookings, check availability, open checkout, read booking records, and fetch Website Builder hero slides and public profile/social settings.

Sedifex remains the source of truth for catalog data, bookings, checkout, payment status, customer records, reporting, and public website hero/profile/contact/social content.

---

## 1. Source-of-truth model

Use this mapping when building client websites:

| Website action | Sedifex record | Dashboard page |
|---|---|---|
| Show products/services on a website | `products`, `services`, `publicListings`, `v1IntegrationProducts` | Products / Services |
| Create a service booking | `integrationBookings` | Bookings |
| Read booking status | `integrationBookings` | Bookings |
| Create product checkout/order | `integrationOrders` | Online Orders |
| Pay-on-delivery product order | `integrationOrders` | Online Orders / Pay on Delivery |
| Read gallery images | Gallery integration endpoint | Website / Gallery |
| Read promo/banner content | Promo integration endpoint | Website / Promo |
| Read homepage hero slides | `stores/{storeId}/websiteHeroSlides` via `/v1IntegrationHeroSlides` | Website / Hero page |
| Read public profile/contact/social content | `stores/{storeId}.publicProfile`, `stores/{storeId}.socialLinks`, `storeSettings/{storeId}.websiteBuilder` via `/v1IntegrationSocialSettings` | Website / Social settings |

Do not use `integrationBookings` for product purchases. Product purchases should become orders. Bookings are for appointments, services, consultations, courses, training, travel support, and other scheduled requests.

---

## 2. Required environment variables

Set these in the website backend or server environment.

```bash
SEDIFEX_API_BASE_URL=https://us-central1-sedifex-web.cloudfunctions.net
SEDIFEX_INTEGRATION_API_BASE_URL=https://us-central1-sedifex-web.cloudfunctions.net
SEDIFEX_STORE_ID=<store_id>
NEXT_PUBLIC_SEDIFEX_STORE_ID=<store_id>
SEDIFEX_BOOKING_TARGET_STORE_ID=<store_id>
SEDIFEX_INTEGRATION_API_KEY=<website_integration_key>
SEDIFEX_PRODUCTS_API_KEY=<same_website_integration_key>
SEDIFEX_BOOKING_API_KEY=<same_website_integration_key>
SEDIFEX_CONTRACT_VERSION=2026-04-13
```

### Key rule

Use the same Website Integration API key for these values:

```bash
SEDIFEX_INTEGRATION_API_KEY=<same_key>
SEDIFEX_PRODUCTS_API_KEY=<same_key>
SEDIFEX_BOOKING_API_KEY=<same_key>
```

The extra names are kept for older websites and templates. New integrations only need one real Sedifex key.

### Security rule

Do not expose the API key in browser code. Never put the API key in `NEXT_PUBLIC_*` variables. Only the store ID may be public.

---

## 3. Authentication headers

Authenticated Sedifex integration endpoints should receive these headers:

```http
x-api-key: <website_integration_key>
Authorization: Bearer <website_integration_key>
X-Sedifex-Contract-Version: 2026-04-13
Accept: application/json
```

`Authorization` is optional for most endpoints, but sending both `x-api-key` and `Authorization` is recommended for compatibility.

Sedifex responses may include:

```http
x-sedifex-contract-version: 2026-04-13
x-sedifex-request-id: <request_id>
```

Log `x-sedifex-request-id` when debugging errors.

---

## 4. Product and service catalog

### Endpoint

```http
GET /v1IntegrationProducts?storeId=<storeId>
```

Full URL example:

```txt
https://us-central1-sedifex-web.cloudfunctions.net/v1IntegrationProducts?storeId=<storeId>
```

Use this endpoint when a client website needs to show Sedifex products or services.

### PowerShell test

```powershell
$baseUrl = "https://us-central1-sedifex-web.cloudfunctions.net"
$storeId = "YOUR_STORE_ID"
$apiKey = "YOUR_WEBSITE_INTEGRATION_KEY"

$headers = @{
  "x-api-key" = $apiKey
  "Authorization" = "Bearer $apiKey"
  "X-Sedifex-Contract-Version" = "2026-04-13"
  "Accept" = "application/json"
}

$url = "$baseUrl/v1IntegrationProducts?storeId=$storeId"
Invoke-RestMethod -Uri $url -Headers $headers -Method GET | ConvertTo-Json -Depth 20
```

### Response shape

```json
{
  "ok": true,
  "storeId": "store_123",
  "count": 7,
  "products": [
    {
      "id": "service-schengen-travel-assistance-a65e6f",
      "storeId": "store_123",
      "name": "Schengen Travel Assistance",
      "category": "Professional Services",
      "description": "Service description",
      "price": 600,
      "priceMinor": 60000,
      "stockCount": null,
      "itemType": "service",
      "type": "SERVICE",
      "imageUrl": "https://...",
      "imageUrls": ["https://..."],
      "imageAlt": "Schengen Travel Assistance",
      "updatedAt": "2026-05-23T12:00:00.000Z"
    }
  ],
  "publicProducts": [],
  "publicServices": []
}
```

For service pages, filter by either:

```ts
item.itemType === 'service'
```

or:

```ts
item.type === 'SERVICE'
```

Public fallback:

```http
GET /publicQuickPayCatalog?storeId=<storeId>
```

This public endpoint is useful for public storefront fallback displays, but the recommended authenticated endpoint is `/v1IntegrationProducts`.

---

## 5. Booking API

Use bookings for appointments, consultations, services, classes, course enrolment, travel assistance, document review, and similar scheduled requests.

### Create booking

```http
POST /v1IntegrationBookings?storeId=<storeId>
```

### Read bookings

```http
GET /v1IntegrationBookings?storeId=<storeId>
GET /v1IntegrationBookings?storeId=<storeId>&status=pending
GET /v1IntegrationBookings?storeId=<storeId>&serviceId=<serviceId>
```

### Create booking request

```json
{
  "serviceId": "service-schengen-travel-assistance-a65e6f",
  "serviceName": "Schengen Travel Assistance",
  "bookingDate": "2026-05-25",
  "bookingTime": "09:00",
  "quantity": 1,
  "notes": "Customer wants help with documents.",
  "customer": {
    "name": "Customer Name",
    "email": "customer@example.com",
    "phone": "+233200000000"
  },
  "paymentMethod": "paystack_checkout",
  "paymentAmount": 600,
  "sourceChannel": "client_website",
  "attributes": {
    "source": "website_booking_form",
    "sourceLabel": "Client website",
    "pageUrl": "https://clientsite.com/book",
    "timezone": "Africa/Accra",
    "locale": "en-GB"
  }
}
```

Minimum fields:

```json
{
  "serviceId": "service_123",
  "bookingDate": "2026-05-25",
  "bookingTime": "09:00",
  "customer": {
    "name": "Customer Name",
    "phone": "+233200000000"
  }
}
```

Recommended fields:

| Field | Why it matters |
|---|---|
| `serviceId` | Links the booking to a Sedifex service |
| `serviceName` | Keeps the record readable even if the service changes later |
| `bookingDate` | Customer requested date |
| `bookingTime` | Customer requested time |
| `customer.name` | Customer identity |
| `customer.email` | Confirmation and follow-up email |
| `customer.phone` | WhatsApp/call follow-up |
| `paymentAmount` | Amount expected or paid |
| `paymentMethod` | Example: `paystack_checkout`, `manual`, `cash`, `momo` |
| `notes` | Customer request details |
| `sourceChannel` | Example: `client_website` |
| `attributes.pageUrl` | Helps staff know where the booking came from |

### PowerShell booking test

```powershell
$baseUrl = "https://us-central1-sedifex-web.cloudfunctions.net"
$storeId = "YOUR_STORE_ID"
$apiKey = "YOUR_WEBSITE_INTEGRATION_KEY"

$headers = @{
  "x-api-key" = $apiKey
  "Authorization" = "Bearer $apiKey"
  "X-Sedifex-Contract-Version" = "2026-04-13"
  "Accept" = "application/json"
  "Content-Type" = "application/json"
}

$body = @{
  serviceId = "service_123"
  serviceName = "Document Review Service"
  bookingDate = "2026-05-25"
  bookingTime = "09:00"
  quantity = 1
  notes = "Customer needs support."
  customer = @{
    name = "Customer Name"
    email = "customer@example.com"
    phone = "+233200000000"
  }
  paymentMethod = "manual"
  paymentAmount = 600
  sourceChannel = "client_website"
  attributes = @{
    source = "website_booking_form"
    pageUrl = "https://clientsite.com/book"
    timezone = "Africa/Accra"
    locale = "en-GB"
  }
} | ConvertTo-Json -Depth 20

$url = "$baseUrl/v1IntegrationBookings?storeId=$storeId"
Invoke-RestMethod -Uri $url -Headers $headers -Method POST -Body $body | ConvertTo-Json -Depth 20
```

Successful booking response:

```json
{
  "ok": true,
  "storeId": "store_123",
  "bookingId": "abc123",
  "reference": "IB-ABC123",
  "status": "pending",
  "bookingStatus": "pending_approval"
}
```

---

## 6. Availability API

Use this when a website needs to show appointment times before creating a booking.

```http
GET /v1IntegrationAvailability?storeId=<storeId>&serviceId=<serviceId>&from=<fromIso>&to=<toIso>
```

Use the same Website Integration API key headers.

### Rendering Upcoming Events with flexible schedules

`GET /v1IntegrationAvailability` supports events where the exact date and/or time is not confirmed yet. Connected websites must **not** hide an event only because `startAt` or `endAt` is `null`.

Each availability slot includes these schedule fields:

- `scheduleStatus: "scheduled"` — date and time are confirmed. `startAt` and `endAt` are ISO strings.
- `scheduleStatus: "time_tba"` — date is confirmed, but the time is not. `eventDate` is a `YYYY-MM-DD` string, while `startAt` and `endAt` are `null`.
- `scheduleStatus: "date_tba"` — date and time are not confirmed. `startAt`, `endAt`, and `eventDate` are `null`.

Slots also include `displayDateText`, `displayTimeText`, `isDateConfirmed`, and `isTimeConfirmed` so websites can render labels without guessing.

Example `date_tba` slot:

```json
{
  "id": "solar-energy-program",
  "storeId": "demo-store",
  "serviceId": "manual:solar-energy-program",
  "serviceName": "Solar Energy Program",
  "scheduleStatus": "date_tba",
  "startAt": null,
  "endAt": null,
  "eventDate": null,
  "displayDateText": "Date to be announced",
  "displayTimeText": "Time to be announced",
  "isDateConfirmed": false,
  "isTimeConfirmed": false,
  "location": "Online / to be confirmed",
  "status": "open",
  "capacity": 20,
  "seatsBooked": 0,
  "seatsRemaining": 20,
  "attributes": {}
}
```

Recommended rendering fallback:

```ts
const dateLabel =
  slot.displayDateText ??
  (slot.startAt ? new Date(slot.startAt).toLocaleDateString() : 'Date to be announced')

const timeLabel =
  slot.displayTimeText ??
  (slot.startAt && slot.endAt
    ? `${new Date(slot.startAt).toLocaleTimeString()} - ${new Date(slot.endAt).toLocaleTimeString()}`
    : 'Time to be announced')
```

Expected website output for the example above:

```text
Solar Energy Program
Date: Date to be announced
Time: Time to be announced
Location: Online / to be confirmed
Button: Register Interest
```

Booking/registration note:

- If a slot has `scheduleStatus: "date_tba"` or `scheduleStatus: "time_tba"`, show a "Register Interest" or "Enquire" call-to-action instead of hiding it.
- Keep submitted booking details tied to the `serviceId` and include the selected slot/event context in `attributes` when exact date or time is not confirmed yet.

---

## 7. Gallery, promo, hero, and social settings content

```http
GET /integrationGallery?storeId=<storeId>
GET /v1IntegrationPromo?storeId=<storeId>
GET /v1IntegrationHeroSlides?storeId=<storeId>&placement=home_hero
GET /v1IntegrationSocialSettings?storeId=<storeId>
```

Use the same Website Integration API key unless the endpoint is specifically public.

### Hero slides / homepage banners

Use `/v1IntegrationHeroSlides` when a connected website needs store-managed homepage hero slides, banners, CTAs, and hero imagery. This endpoint lets website templates render the same slides store owners maintain in **Website Builder → Hero page**.

#### Endpoint

```http
GET /v1IntegrationHeroSlides?storeId=<storeId>&placement=home_hero
```

Full URL example:

```txt
https://us-central1-sedifex-web.cloudfunctions.net/v1IntegrationHeroSlides?storeId=<storeId>&placement=home_hero
```

#### Query parameters

| Parameter | Required | Notes |
|---|---:|---|
| `storeId` | Yes | Store whose hero slides should be loaded. |
| `placement` | No | Defaults to `home_hero`; use this to support multiple website placements later. |
| `limit` | No | Defaults to `10`; maximum is `25`. |

#### Data source and filtering

The endpoint reads active slides from `stores/{storeId}/websiteHeroSlides`. It only returns slides that are public-ready for the requested placement:

- `status` must be `active`.
- `deleted` must not be `true`.
- `placement` must match the requested placement.
- `startsAt` and `endsAt`, when set, must include the current time.
- Slides are sorted by `priority`, then most recently updated.

#### PowerShell test

```powershell
$baseUrl = "https://us-central1-sedifex-web.cloudfunctions.net"
$storeId = "YOUR_STORE_ID"
$apiKey = "YOUR_WEBSITE_INTEGRATION_KEY"

$headers = @{
  "x-api-key" = $apiKey
  "Authorization" = "Bearer $apiKey"
  "X-Sedifex-Contract-Version" = "2026-04-13"
  "Accept" = "application/json"
}

$url = "$baseUrl/v1IntegrationHeroSlides?storeId=$storeId&placement=home_hero"
Invoke-RestMethod -Uri $url -Headers $headers -Method GET | ConvertTo-Json -Depth 20
```

#### Response shape

```json
{
  "ok": true,
  "storeId": "store_123",
  "placement": "home_hero",
  "slides": [
    {
      "id": "slide_123",
      "storeId": "store_123",
      "title": "Welcome to our store",
      "eyebrow": "New arrivals",
      "subtitle": "Shop our latest offers today.",
      "ctaLabel": "Shop now",
      "ctaHref": "/shop",
      "secondaryCtaLabel": "Contact us",
      "secondaryCtaHref": "/contact",
      "imageUrl": "https://...",
      "mobileImageUrl": "https://...",
      "accent": "#4f46e5",
      "textColor": "light",
      "overlayStyle": "gradient",
      "layout": "left_text",
      "priority": 1,
      "updatedAt": "2026-05-29T00:00:00.000Z"
    }
  ]
}
```

#### Website usage

Render `slides` as a carousel when more than one slide is returned, as a static hero when exactly one slide is returned, and fall back to local/default hero content when no slides are returned.

### Social settings / public profile

Use `/v1IntegrationSocialSettings` when a connected website needs store-managed contact details, public business copy, logos, SEO/social share images, or social profile links. This endpoint lets website templates render the same data store owners maintain in **Website Builder → Social settings** instead of hardcoding profile values in the website repo.

#### Endpoint

```http
GET /v1IntegrationSocialSettings?storeId=<storeId>
```

Full URL example:

```txt
https://us-central1-sedifex-web.cloudfunctions.net/v1IntegrationSocialSettings?storeId=<storeId>
```

#### Data source and fallback order

The endpoint reads:

1. `stores/{storeId}`
2. `storeSettings/{storeId}`

The response is built from `stores/{storeId}.publicProfile` first, then `storeSettings/{storeId}.publicProfile` / `storeSettings/{storeId}.websiteBuilder`, then legacy or top-level store fallback fields such as `logoUrl`, `phoneNumber`, `whatsappNumber`, `websiteUrl`, `instagramHandle`, and `facebookUrl`.

#### PowerShell test

```powershell
$baseUrl = "https://us-central1-sedifex-web.cloudfunctions.net"
$storeId = "YOUR_STORE_ID"
$apiKey = "YOUR_WEBSITE_INTEGRATION_KEY"

$headers = @{
  "x-api-key" = $apiKey
  "Authorization" = "Bearer $apiKey"
  "X-Sedifex-Contract-Version" = "2026-04-13"
  "Accept" = "application/json"
}

$url = "$baseUrl/v1IntegrationSocialSettings?storeId=$storeId"
Invoke-RestMethod -Uri $url -Headers $headers -Method GET | ConvertTo-Json -Depth 20
```

#### Response shape

```json
{
  "ok": true,
  "storeId": "store_123",
  "profile": {
    "displayName": "Store name",
    "tagline": "Short public tagline",
    "businessDescription": "About text for the website",
    "openingHours": "Mon - Sat, 9:00 AM - 6:00 PM",
    "brandColor": "#4f46e5",
    "logoUrl": "https://...",
    "coverImageUrl": "https://...",
    "socialShareImage": "https://...",
    "publicPhone": "+233...",
    "whatsappNumber": "+233...",
    "telegramNumber": "@store",
    "publicEmail": "hello@example.com",
    "addressLine1": "Address / location",
    "city": "Accra",
    "country": "Ghana",
    "websiteUrl": "https://example.com",
    "instagramHandle": "https://instagram.com/example",
    "facebookUrl": "https://facebook.com/example",
    "tiktokHandle": "@example",
    "youtubeUrl": "https://youtube.com/@example",
    "xHandle": "@example",
    "linkedinUrl": "https://linkedin.com/company/example",
    "updatedAt": "2026-05-29T00:00:00.000Z"
  },
  "socialLinks": {
    "website": "https://example.com",
    "instagram": "https://instagram.com/example",
    "facebook": "https://facebook.com/example",
    "tiktok": "@example",
    "youtube": "https://youtube.com/@example",
    "x": "@example",
    "linkedin": "https://linkedin.com/company/example"
  }
}
```

#### Website usage

Use `profile` for full website content and `socialLinks` for compact icon/link rendering. Common placements include:

- Header logo and brand color
- Footer contact block
- WhatsApp/call buttons
- Social media icon links
- SEO metadata image / Open Graph image
- About section copy
- Hero fallback title, tagline, or cover image

---

## 8. Checkout and product orders

Product purchases should use checkout/order endpoints, not booking endpoints.

Recommended flow:

1. Customer selects product/service on the website.
2. Website backend receives cart/customer data.
3. Backend calls Sedifex checkout preview if totals are needed.
4. Backend calls Sedifex checkout create.
5. Customer pays through the payment flow.
6. Sedifex records the order and payment status.
7. Website shows the final order status from Sedifex.

Do not trust totals calculated only in the browser. Always confirm totals server-side with Sedifex before payment.

---

## 9. Next.js server example

```ts
const SEDIFEX_BASE_URL = process.env.SEDIFEX_API_BASE_URL ?? 'https://us-central1-sedifex-web.cloudfunctions.net'
const SEDIFEX_STORE_ID = process.env.SEDIFEX_STORE_ID!
const SEDIFEX_API_KEY = process.env.SEDIFEX_INTEGRATION_API_KEY!
const SEDIFEX_CONTRACT_VERSION = process.env.SEDIFEX_CONTRACT_VERSION ?? '2026-04-13'

function sedifexHeaders() {
  return {
    'x-api-key': SEDIFEX_API_KEY,
    Authorization: `Bearer ${SEDIFEX_API_KEY}`,
    'X-Sedifex-Contract-Version': SEDIFEX_CONTRACT_VERSION,
    Accept: 'application/json',
  }
}

export async function getSedifexHeroSlides() {
  const url = new URL('/v1IntegrationHeroSlides', SEDIFEX_BASE_URL)
  url.searchParams.set('storeId', SEDIFEX_STORE_ID)
  url.searchParams.set('placement', 'home_hero')

  const response = await fetch(url, {
    headers: sedifexHeaders(),
    next: { revalidate: 60 },
  })

  if (!response.ok) return []
  const payload = await response.json()
  return Array.isArray(payload.slides) ? payload.slides : []
}

export async function getSedifexSocialSettings() {
  const url = new URL('/v1IntegrationSocialSettings', SEDIFEX_BASE_URL)
  url.searchParams.set('storeId', SEDIFEX_STORE_ID)

  const response = await fetch(url, {
    headers: sedifexHeaders(),
    next: { revalidate: 60 },
  })

  if (!response.ok) return null
  return response.json()
}

export async function getSedifexServices() {
  const url = new URL('/v1IntegrationProducts', SEDIFEX_BASE_URL)
  url.searchParams.set('storeId', SEDIFEX_STORE_ID)

  const response = await fetch(url, {
    headers: sedifexHeaders(),
    next: { revalidate: 30 },
  })

  if (!response.ok) throw new Error(`Sedifex catalog failed: ${response.status}`)

  const payload = await response.json()
  return (payload.publicServices?.length ? payload.publicServices : payload.products || [])
    .filter((item: any) => (item.itemType || item.type || '').toLowerCase() === 'service')
}

export async function createSedifexBooking(input: {
  serviceId: string
  serviceName?: string
  bookingDate: string
  bookingTime: string
  customer: { name: string; email?: string; phone?: string }
  notes?: string
}) {
  const url = new URL('/v1IntegrationBookings', SEDIFEX_BASE_URL)
  url.searchParams.set('storeId', SEDIFEX_STORE_ID)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...sedifexHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...input,
      sourceChannel: 'client_website',
      attributes: {
        source: 'website_booking_form',
      },
    }),
  })

  if (!response.ok) throw new Error(`Sedifex booking failed: ${response.status}`)
  return response.json()
}
```

---

## 10. Error handling

| Status/error | Meaning | What to do |
|---|---|---|
| `400 missing-store-id` | `storeId` was not sent | Check env vars and URL params |
| `400 contract-version-mismatch` | Wrong contract header | Update `SEDIFEX_CONTRACT_VERSION` |
| `401 invalid-api-key` | Key is wrong or not for that store | Regenerate Website Integration API key |
| `401 unauthorized` | Missing or invalid credentials | Check headers |
| `404` | Endpoint path wrong or function not deployed | Check base URL and endpoint name |
| `429` | Too many requests | Retry with backoff |
| `5xx` | Temporary Sedifex/server issue | Retry with backoff and log request ID |

Never log the full API key.

---

## 11. Caching guidance

| Data | Suggested cache |
|---|---|
| Products/services | 30–120 seconds |
| Gallery | 60–300 seconds |
| Promo content | 60–300 seconds |
| Hero slides | 60–300 seconds |
| Social/contact profile | 60–300 seconds |
| Availability | 0–30 seconds |
| Checkout totals | Do not cache as final truth |
| Booking creation | Never cache POST responses as reusable actions |

---

## 12. Security checklist

- Keep the Website Integration API key server-side only.
- Do not put the API key in `NEXT_PUBLIC_*` variables.
- Use one key per client website/backend.
- Rotate the key if it is pasted in chat, logs, screenshots, or shared publicly.
- Validate customer input before sending it to Sedifex.
- Confirm product prices and checkout totals server-side.
- Do not use browser-only calculations for payment totals.
- Log request IDs, not secrets.
