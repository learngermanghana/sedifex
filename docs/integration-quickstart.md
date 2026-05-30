# Sedifex Integration Quickstart (Next.js + WordPress)

Use this guide to auto-load products from Sedifex into either:

- a **WordPress** site, or
- a **Next.js site hosted on Vercel**.

This quickstart follows the current **versioned** Sedifex downstream contract based on `/v1IntegrationProducts` and related integration endpoints (`/v1IntegrationPromo`, `/integrationGallery`, `/integrationCustomers`, `/integrationTopSelling`, and `/integrationGoogleMerchantFeed`), plus the product shape documented in the root README.

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
- `imageUrl` (primary image)
- `imageUrls` (optional array for multiple product photos)
- `imageAlt`
- `updatedAt`

Customer data fields (for import/export template)

Required

    name — Primary customer name.

Optional

    display_name — Preferred display name.

    phone — Phone number (country code recommended).

    email — Customer email.

    birthdate — Format: YYYY-MM-DD.

    notes — Preferences or notes.

    tags — Comma-separated labels/tags.

Promo data fields (store promo profile)

    promoTitle

    promoSummary

    promoStartDate

    promoEndDate

    promoSlug

Also used with:

    displayName / name (store name fallback shown on promo page).

The dedicated Promo settings page is intentionally simplified to promo title, promo summary, and promo duration dates.

Public contact hub fields (shared customer-facing profile for websites and public pages)

    logoUrl

    publicPhone

    whatsappNumber

    telegramNumber

    publicEmail

    websiteUrl

    instagramHandle

    facebookUrl

    tiktokHandle

    youtubeUrl

    xHandle

    linkedinUrl

Sedifex stores these in `stores/{storeId}.publicProfile` (and mirrors key fields such as `logoUrl`, `phoneNumber`, `whatsappNumber`, `telegramNumber`, `websiteUrl` at top-level store fields). Treat this as the single source of truth for website/footer/contact blocks.

Promo gallery data fields (stores/{storeId}/promoGallery/{itemId})

    url

    alt

    caption

    sortOrder

    isPublished

    createdAt

    updatedAt

## Scope note

This quickstart is for store/partner integrations only.

SedifexMarket and public-product catalog guidance has been moved to a dedicated document:

- `docs/sedifexmarket-public-product-guide.md`

## Canonical integration contract (required)

Before setup, review `docs/integration-contract.md`.

- `X-Sedifex-Contract-Version` is mandatory for authenticated integration calls.
- Do not implement path-based contract versioning in URLs.
- Treat this contract page as authoritative when this quickstart and other docs differ.

## Prerequisites

1. Sedifex Firebase project configured (Firestore + Functions).
2. You have either:
   - a configured master key (`SEDIFEX_INTEGRATION_API_KEY`), or
   - an active store integration key from **Account overview → Integrations → Website integrations**.
3. Your website runtime can make HTTPS requests.

## Integration flow

Base URL:

- Use `https://us-central1-sedifex-web.cloudfunctions.net` as the production base URL.
- In this repo, the canonical env name is `SEDIFEX_API_BASE_URL`.
- If your other repo uses `SEDIFEX_INTEGRATION_API_BASE_URL`, set it to the same value (`https://us-central1-sedifex-web.cloudfunctions.net`).
- Do not append a contract date/version segment to the base URL.

### Steps used in the integration flow

1. **Load required Sedifex environment config**
   - `SEDIFEX_API_BASE_URL`
   - `SEDIFEX_STORE_ID`
   - `SEDIFEX_INTEGRATION_API_KEY` (or legacy `SEDIFEX_INTEGRATION_KEY`)
   - `SEDIFEX_CONTRACT_VERSION` (defaults to `2026-04-13`)
2. **Build authenticated GET requests**
   - `x-api-key`
   - `X-Sedifex-Contract-Version`
   - `Accept: application/json`
   - Use Next.js revalidation: `next: { revalidate: 60 }`
3. **Fetch products, promo, and gallery in parallel**
   - In `getHomePageData()`, request all three endpoints with `Promise.all(...)`:
     - `GET /v1IntegrationProducts?storeId=<storeId>`
     - `GET /v1IntegrationPromo?storeId=<storeId>`
     - `GET /integrationGallery?storeId=<storeId>`
   - (This endpoint set is also listed in the root README and this quickstart.)
4. **Normalize and clean each payload**
   - **Products:** normalize image fields, dedupe products, and filter to service-type products when available.
   - **Promo:** search nested payloads and map flexible key variants (`promoTitle`, `promo_title`, etc.) into a unified promo object.
   - **Gallery:** normalize image/alt fields, keep published items only, and sort by `sortOrder`.
   - **Store profile/contact hub (if you include it in your integration layer):** map from `publicProfile` first, then fallback to top-level store fields (`logoUrl`, `phoneNumber`, `whatsappNumber`, `telegramNumber`, `websiteUrl`) for backwards compatibility.
5. **Apply resilience fallback logic**
   - If config is missing, fetch fails, or data is incomplete, fall back to local curated data:
     - `fallbackProducts`
     - `fallbackPromo`
     - `fallbackGallery`
6. **Expose merged data to pages/components**
   - `getHomePageData()` powers:
     - Home page (`products + promo + gallery`)
     - Gallery page (`gallery`)
     - Services page (`products`)

### Additional available integration endpoints

- `GET /integrationCustomers?storeId=<storeId>`
- `GET /integrationTopSelling?storeId=<storeId>&days=30&limit=10`
- `GET /v1IntegrationAvailability?storeId=<storeId>&serviceId=<serviceId>&from=<ISO>&to=<ISO>` (includes optional `linkedCourseId`, `eventKind`, `registrationMode`, `price`, `depositAmount`, `location`, `description`, `marketplaceEnabled`)
- `GET /v1IntegrationBookings?storeId=<storeId>`
- `POST /v1IntegrationBookings?storeId=<storeId>`
- `GET /v1IntegrationSocialSettings?storeId=<storeId>`

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
  (slot.startAt
    ? new Date(slot.startAt).toLocaleDateString()
    : "Date to be announced");

const timeLabel =
  slot.displayTimeText ??
  (slot.startAt && slot.endAt
    ? `${new Date(slot.startAt).toLocaleTimeString()} - ${new Date(slot.endAt).toLocaleTimeString()}`
    : "Time to be announced");
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

- Build booking forms on each website using store-defined fields.
- Put vertical-specific data (e.g., school/travel extras) inside `attributes` in the booking payload.
- Keep API keys server-side; submit booking requests from your website backend only.
- For a developer-ready canonical booking field dictionary (including `branchLocationId`, `eventLocation`, `customerStayLocation`, and `paymentAmount`) plus a full request example, see `docs/integration-api-guide.md` under **POST /v1IntegrationBookings**.

### Manual upcoming events from Sedifex admin

Stores can add an upcoming event in Sedifex without first saving it as a service/product/course. In the admin UI this is **Bookings → Manage availability → Upcoming events → Event source: Manual event/class name**. Sedifex saves that event as an availability slot under:

```txt
stores/{storeId}/integrationAvailabilitySlots/{slotId}
```

For a manual event, the slot is still bookable even though it is not in the saved service catalog. The important fields for websites are:

| Field                                                                                   | How the website should use it                                                                               |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `id`                                                                                    | Treat as the `slotId`. Use this for booking/registration.                                                   |
| `serviceId`                                                                             | May be a generated value such as `manual:solar-energy-program`. Do not require it to match a saved service. |
| `serviceName`                                                                           | Display title for the event card/form.                                                                      |
| `scheduleStatus`, `startAt`, `endAt`, `eventDate`, `displayDateText`, `displayTimeText` | Render confirmed or TBA schedule labels.                                                                    |
| `price`, `depositAmount`, `registrationMode`                                            | Decide whether to show free registration, enquiry, deposit, or full payment.                                |
| `capacity`, `seatsBooked`, `seatsRemaining`, `status`                                   | Hide closed/full events or show remaining seats.                                                            |
| `isPublic`, `visibleOnWebsite`, `marketplaceEnabled`                                    | Only render public/visible slots.                                                                           |
| `imageUrl` or `attributes.imageUrl`                                                     | Event photo.                                                                                                |

Minimum custom-site flow:

1. Fetch availability server-side with `GET /v1IntegrationAvailability?storeId=<storeId>&from=<ISO>&to=<ISO>`.
2. Render every slot where `status === "open"`, `isPublic !== false`, `visibleOnWebsite !== false`, and `seatsRemaining > 0` (or capacity is unlimited/zero by your business rule).
3. When the visitor registers, send `slotId: slot.id` to `POST /v1IntegrationBookings`. You may include `serviceId` and `serviceName`, but `slotId` is enough for Sedifex to resolve the manual event and increment `seatsBooked`.
4. If payment is required, either create the booking first and then checkout, or send the visitor to the public Quick Pay URL described below.

Example booking request for a manual event:

```json
{
  "slotId": "solar-energy-program-slot",
  "serviceName": "Solar Energy Program",
  "customer": {
    "name": "Ama Boateng",
    "phone": "+233201234567",
    "email": "ama@example.com"
  },
  "quantity": 1,
  "bookingDate": "2026-08-01",
  "bookingTime": "Time to be announced",
  "paymentAmount": 100,
  "sourceChannel": "client_website",
  "attributes": {
    "source": "manual_upcoming_event",
    "scheduleStatus": "time_tba"
  }
}
```

Generated Sedifex public websites and Quick Pay:

- Sedifex-generated public websites automatically pull open/public `integrationAvailabilitySlots` into the Services/Bookings area as `BOOKING` cards.
- The card button opens Quick Pay with `mode=booking`, `itemId=<slotId>`, and `slotId=<slotId>`.
- Custom sites can use the same pattern when they want Sedifex-hosted payment instead of building checkout: `https://pay.sedifex.com/s/<storeId>?mode=booking&itemId=<slotId>&slotId=<slotId>`.
- The public Quick Pay catalog also returns these slots as `type: "BOOKING"`, so a custom site can search/fetch `/publicQuickPayCatalog?storeId=<storeId>` and use the returned `slotId`, `bookingDate`, and `bookingTime`.
- Booking-like Quick Pay orders are shown in the store **Bookings** board as payment orders, so staff can follow up even when checkout was used instead of a custom `POST /v1IntegrationBookings` form.

### Common 404 fix (important)

If your app logs a 404 such as:

- `/2026-04-13/products`

your URL builder is likely treating the contract version as a URL path segment. In Sedifex, `2026-04-13` is the **contract header value**, not an endpoint path. Use:

- `GET /v1IntegrationProducts?storeId=<storeId>` (authenticated integration feed), or
- `GET /v1/products` (public marketplace feed).

Do **not** build routes like `/<contractVersion>/products`.

### Shared integration types

Import shared interfaces from `shared/integrationTypes.ts` in both Sedifex and Buy Sedifex projects to avoid field drift:

- `IntegrationProduct`
- `IntegrationPromo`
- `IntegrationProductsResponse`
- `IntegrationPromoResponse`
- `IntegrationSocialSettings`
- `IntegrationSocialSettingsResponse`

If you publish these to npm, keep the package version aligned with the contract header date (`X-Sedifex-Contract-Version`).

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
  imageUrls?: string[]
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
      `${process.env.SEDIFEX_API_BASE_URL}/v1IntegrationProducts?storeId=${encodeURIComponent(
        process.env.SEDIFEX_STORE_ID ?? ''
      )}`,
      {
        headers: {
          'x-api-key': `${process.env.SEDIFEX_INTEGRATION_API_KEY ?? process.env.SEDIFEX_INTEGRATION_KEY}`,
          'X-Sedifex-Contract-Version': process.env.SEDIFEX_CONTRACT_VERSION ?? '2026-04-13',
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

- **Frequently changing price/stock/promo/gallery:** `revalidate: 30-120` seconds.
- **Mostly static catalog:** `revalidate: 3600` (1 hour) or longer.
- **Truly live stock:** keep ISR for initial render, then use client polling/SWR for live updates.

For promo + gallery integrations, use the same 30–120 second polling interval initially. If you later need sub-minute pushes, move to webhook-triggered cache invalidation.

### 3) Promo + gallery on Next.js (copy/paste reference)

Teams usually struggle here for three reasons: missing auth header, incorrect endpoint (`/integrationPromo` instead of `/v1IntegrationPromo`), or fetching from a Client Component with a secret key.

Use a **server-only helper** so your integration key never reaches the browser bundle:

```ts
// lib/sedifexPromo.ts
import "server-only";

const BASE_URL =
  process.env.SEDIFEX_API_BASE_URL ??
  "https://us-central1-sedifex-web.cloudfunctions.net";
const STORE_ID = process.env.SEDIFEX_STORE_ID ?? "";
const API_KEY =
  process.env.SEDIFEX_INTEGRATION_API_KEY ??
  process.env.SEDIFEX_INTEGRATION_KEY ??
  "";
const CONTRACT = process.env.SEDIFEX_CONTRACT_VERSION ?? "2026-04-13";

type PromoPayload = {
  storeId: string;
  promo: {
    enabled: boolean;
    title?: string | null;
    summary?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    websiteUrl?: string | null;
    imageUrl?: string | null;
    imageAlt?: string | null;
  };
};

type GalleryPayload = {
  storeId: string;
  gallery: Array<{
    id: string;
    url: string;
    alt?: string | null;
    caption?: string | null;
    sortOrder?: number;
    isPublished?: boolean;
  }>;
};

export async function fetchPromoAndGallery() {
  const headers = {
    "x-api-key": API_KEY,
    "X-Sedifex-Contract-Version": CONTRACT,
    Accept: "application/json",
  };

  const [promoRes, galleryRes] = await Promise.all([
    fetch(
      `${BASE_URL}/v1IntegrationPromo?storeId=${encodeURIComponent(STORE_ID)}`,
      {
        headers,
        next: { revalidate: 60 },
      },
    ),
    fetch(
      `${BASE_URL}/integrationGallery?storeId=${encodeURIComponent(STORE_ID)}`,
      {
        headers,
        next: { revalidate: 60 },
      },
    ),
  ]);

  if (!promoRes.ok) throw new Error(`Promo request failed: ${promoRes.status}`);
  if (!galleryRes.ok)
    throw new Error(`Gallery request failed: ${galleryRes.status}`);

  const promoJson = (await promoRes.json()) as PromoPayload;
  const galleryJson = (await galleryRes.json()) as GalleryPayload;

  const publishedGallery = (galleryJson.gallery ?? [])
    .filter((item) => item?.isPublished !== false && item?.url)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  return { promo: promoJson.promo, gallery: publishedGallery };
}
```

Then render it in a Server Component page:

```tsx
// app/promo/page.tsx
import { fetchPromoAndGallery } from "@/lib/sedifexPromo";

export default async function PromoPage() {
  const { promo, gallery } = await fetchPromoAndGallery();

  return (
    <main>
      <h1>{promo?.title ?? "Latest promo"}</h1>
      {promo?.summary ? <p>{promo.summary}</p> : null}

      {promo?.imageUrl ? (
        <img src={promo.imageUrl} alt={promo.imageAlt ?? "Promo image"} />
      ) : null}

      <section>
        <h2>Gallery</h2>
        {gallery.length ? (
          <ul>
            {gallery.map((item) => (
              <li key={item.id}>
                <img src={item.url} alt={item.alt ?? "Gallery image"} />
                {item.caption ? <p>{item.caption}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p>No published gallery items yet.</p>
        )}
      </section>
    </main>
  );
}
```

Quick troubleshooting checklist for promo/gallery:

- Confirm endpoint names exactly: `v1IntegrationPromo` and `integrationGallery`.
- Always send both headers: `x-api-key` and `X-Sedifex-Contract-Version`.
- Validate `storeId` is not empty in your runtime env.
- Keep integration key server-side only (no `NEXT_PUBLIC_` prefix).
- Filter gallery on `isPublished !== false` and sort by `sortOrder`.

### 4) Top-selling products endpoint (new)

Use this endpoint when you want to render "best sellers" on your public website:

- `GET /integrationTopSelling?storeId=<storeId>&days=30&limit=10`
- Requires `x-api-key: <master_or_store_integration_key>`
- Query params:
  - `days` (optional, default `30`, min `1`, max `365`)
  - `limit` (optional, default `10`, min `1`, max `50`)

Response shape:

```json
{
  "storeId": "store_123",
  "windowDays": 30,
  "generatedAt": "2026-04-06T10:00:00.000Z",
  "topSelling": [
    {
      "productId": "abc",
      "name": "Jollof Rice",
      "category": "Meals",
      "imageUrl": "https://...",
      "imageUrls": ["https://...", "https://.../side-angle.jpg"],
      "imageAlt": "Plate of jollof rice",
      "itemType": "product",
      "qtySold": 84,
      "grossSales": 3780,
      "lastSoldAt": "2026-04-06T08:10:11.000Z"
    }
  ]
}
```

### 5) Optional live refresh with SWR

Use SWR on top of server-rendered data for near-live stock while preserving fast first paint.

---

## WordPress tutorial

If your storefront is WordPress, continue with:

- `docs/wordpress-install-guide.md`
- `docs/wordpress-plugin/sedifex-sync.php`

Use the same dedupe key, fallback data pattern, and cache guidance from this quickstart.

## Security checklist

- Do not embed admin credentials in Website A.
- Use one key per deployed website/backend service and rotate it on incident response windows.
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

### Product photos: one vs multiple images

- `imageUrl` remains the primary/legacy photo field.
- `imageUrls` can contain 1..n URLs when a merchant wants 2-3 product photos on downstream websites.
- Consumers should prefer `imageUrls[0]` when present, then fall back to `imageUrl`.
  > For all-store admin pulls, call `v1IntegrationProducts` with the admin master key and omit `storeId`.

## Social settings / public profile

Connected websites can fetch store-managed contact details, public profile copy, logos, SEO images, and social profile links from Sedifex instead of hardcoding them in templates.

Endpoint:

```txt
GET /v1IntegrationSocialSettings?storeId=<storeId>
```

Example Next.js server fetch:

```ts
async function fetchSedifexSocialSettings() {
  const response = await fetch(
    `${process.env.SEDIFEX_API_BASE_URL}/v1IntegrationSocialSettings?storeId=${encodeURIComponent(process.env.SEDIFEX_STORE_ID ?? "")}`,
    {
      headers: {
        "x-api-key": process.env.SEDIFEX_INTEGRATION_API_KEY ?? "",
        "X-Sedifex-Contract-Version":
          process.env.SEDIFEX_CONTRACT_VERSION ?? "2026-04-13",
        Accept: "application/json",
      },
      next: { revalidate: 60 },
    },
  );

  if (!response.ok) return null;
  return response.json();
}
```

Response shape:

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

Website usage ideas:

- Footer contact block
- WhatsApp button
- Social media icons
- SEO metadata image
- Logo/header
- About section
- Hero fallback content

## Homepage hero slides

Connected websites can fetch store-managed homepage banners from Sedifex and render them as a carousel or a static hero section.

Endpoint:

```txt
GET /v1IntegrationHeroSlides?storeId=<storeId>&placement=home_hero
```

Example Next.js server fetch:

```ts
async function fetchHeroSlides() {
  const response = await fetch(
    `${process.env.SEDIFEX_API_BASE_URL}/v1IntegrationHeroSlides?storeId=${encodeURIComponent(process.env.SEDIFEX_STORE_ID ?? "")}&placement=home_hero`,
    {
      headers: {
        "x-api-key": process.env.SEDIFEX_INTEGRATION_API_KEY ?? "",
        "X-Sedifex-Contract-Version":
          process.env.SEDIFEX_CONTRACT_VERSION ?? "2026-04-13",
        Accept: "application/json",
      },
      next: { revalidate: 60 },
    },
  );

  if (!response.ok) return [];
  const payload = await response.json();
  return Array.isArray(payload.slides) ? payload.slides : [];
}
```

Rendering notes:

- If `slides.length > 1`, render as a carousel.
- If `slides.length === 1`, render as a static hero.
- If no slides are returned, fall back to local website hero content.

Simple component example:

```tsx
function HeroSlider({ slides }) {
  if (!slides.length) return null;
  return (
    <section>
      {slides.map((slide) => (
        <article key={slide.id}>
          {slide.imageUrl ? (
            <img src={slide.imageUrl} alt={slide.title} />
          ) : null}
          {slide.eyebrow ? <p>{slide.eyebrow}</p> : null}
          <h1>{slide.title}</h1>
          {slide.subtitle ? <p>{slide.subtitle}</p> : null}
          {slide.ctaHref && slide.ctaLabel ? (
            <a href={slide.ctaHref}>{slide.ctaLabel}</a>
          ) : null}
        </article>
      ))}
    </section>
  );
}
```
