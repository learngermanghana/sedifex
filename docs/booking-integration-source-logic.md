# Booking Integration Source Logic

This document explains how booking data should be created and interpreted when it comes from different sources:

- Client website
- Sedifex Market
- Sedifex public/custom page
- Manual/admin entry

The goal is that all bookings eventually become one unified booking record in Sedifex, while each source is still allowed to use its own logic before sending data into Sedifex.

## One booking system, different source logic

All booking sources should end up in Sedifex as `integrationBookings` records.

Sedifex admin and reports then treat them together:

- `Bookings` page
- `Reports → Bookings`
- Booking detail/editor
- Confirm booking
- Cancel booking
- Complete booking
- App Script sync when configured

The source only affects how the booking is created and which system sends the first notification.

## Source responsibility summary

| Source | Who owns form/cart logic? | Who creates booking data? | Who sends first booking notification? | Who handles confirmation/reminders? |
| --- | --- | --- | --- | --- |
| Client website | The external website | Website server calls Sedifex Integration API | Website or website backend | Store admin + store App Script after confirmation |
| Sedifex Market | Sedifex Market | Sedifex Market creates booking/order data | Sedifex Market | Store admin + store App Script after confirmation |
| Sedifex public/custom page | Sedifex public page flow | Sedifex public page flow creates data | Sedifex public page flow | Store admin + store App Script after confirmation |
| Manual/admin | Sedifex admin | Store staff creates booking inside admin | Optional/manual | Store admin + store App Script after confirmation |

## Important rule

Do not make every source behave exactly the same before data reaches Sedifex.

Each source can use its own frontend logic:

- a website can use its own booking form,
- Sedifex Market can use marketplace checkout/booking logic,
- public pages can use custom page form logic,
- admin can use manual entry.

But after the booking enters Sedifex, the shared admin workflow should be the same.

```text
Source-specific booking form / checkout
↓
Sedifex integration booking record
↓
Sedifex admin booking detail
↓
Confirm / Cancel / Complete
↓
App Script sync and reminders if configured
```

## Client website booking logic

A client website is controlled by the store owner or a third-party developer. It should not directly write to Firestore. It should call the Sedifex Integration API from the website server.

### Website responsibilities

The website should:

1. Pull products/services from Sedifex when needed.
2. Render its own booking form.
3. Collect customer information.
4. Collect booking date/time or selected slot.
5. Create a booking in Sedifex using `POST /v1IntegrationBookings`.
6. If online payment is needed, create checkout and link it to the booking.
7. Send its own first booking-received message if the website wants that experience.
8. Wait for Sedifex payment webhook/status before treating online payment as final.

### Website must not do this

The website must not:

- expose the Sedifex integration API key in browser code,
- write directly to Firestore,
- mark payment confirmed from browser return URL alone,
- set final payment truth without webhook/status confirmation,
- send duplicate confirmation emails after store confirmation if App Script is configured.

## Website booking API flow

### Step 1: Create booking

Endpoint:

```text
POST /v1IntegrationBookings?storeId=<storeId>
```

Headers:

```text
x-api-key: <store_or_master_integration_key>
X-Sedifex-Contract-Version: 2026-04-13
Content-Type: application/json
```

Recommended payload:

```json
{
  "serviceId": "svc_travel_001",
  "slotId": "slot_2026_08_01_10_00",
  "customer": {
    "name": "Ada Mensah",
    "phone": "+233201234567",
    "email": "ada@example.com"
  },
  "bookingDate": "2026-08-01",
  "bookingTime": "10:00 AM",
  "serviceName": "Schengen visa support",
  "quantity": 1,
  "notes": "Customer prefers morning appointment",
  "paymentMethod": "paystack",
  "paymentAmount": 250,
  "attributes": {
    "source": "website_booking_form",
    "sourceChannel": "client_website",
    "websiteName": "clientsite.com",
    "campaign": "summer_launch"
  }
}
```

The website should store the returned `bookingId`.

### Step 2: Create checkout when payment is online

Endpoint:

```text
POST /integration/checkout/create
```

Recommended payload:

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
    "channel": "client-website",
    "sourceChannel": "client_website"
  }
}
```

The website should store:

- `bookingId`
- `reference`
- `sedifexOrderId`
- `clientOrderId`

### Step 3: Confirm payment state

The website should not trust the Paystack/browser return URL alone.

Final payment truth should come from:

- Sedifex webhook to the website, or
- `GET /integration/orders/:reference`

When payment is confirmed by Sedifex, the booking can show as paid or ready for store confirmation.

## Website manual payment flow

If the client website collects manual payment proof, such as Mobile Money reference or upload screenshot, the website can still create the booking but should not mark it as finally confirmed.

Recommended manual payment payload:

```json
{
  "serviceId": "svc_beauty_class",
  "customer": {
    "name": "Ama Owusu",
    "phone": "+233245551111",
    "email": "ama@example.com"
  },
  "bookingDate": "2026-06-20",
  "bookingTime": "09:00",
  "serviceName": "Makeup class",
  "payment": {
    "method": "mobile_money",
    "amount": 300,
    "reference": "MOMO12345",
    "confirmed": false,
    "screenshotUrl": "https://clientsite.com/uploads/payment-proof.jpg"
  },
  "paymentStatus": "awaiting_verification",
  "customerPaymentClaim": "claimed_paid",
  "attributes": {
    "source": "website_booking_form",
    "sourceChannel": "client_website"
  }
}
```

Then the store confirms inside Sedifex after checking payment.

## Sedifex Market booking logic

Sedifex Market is not an external website integration. It is part of the Sedifex ecosystem and can use its own internal booking/checkout logic.

### Sedifex Market responsibilities

Sedifex Market should:

1. Display store services/classes/events from Sedifex data.
2. Collect booking details using the marketplace UI.
3. Create the booking/order using Sedifex-controlled logic.
4. Send the first booking-received notification to the customer and store.
5. Save source metadata showing the booking came from Sedifex Market.
6. Let the store manage the booking later from Sedifex admin.

### Sedifex Market source fields

Sedifex Market-created booking records should include source fields like:

```json
{
  "source": "sedifex_market",
  "sourceChannel": "sedifex_market",
  "sourceLabel": "Sedifex Market"
}
```

If the market flow creates an online payment, it should also persist:

```json
{
  "paymentCollectionMode": "online_checkout",
  "paymentStatus": "success",
  "reference": "paystack_or_sedifex_reference",
  "sedifexOrderId": "ord_123",
  "clientOrderId": "market_booking_123"
}
```

### Sedifex Market notifications

For Sedifex Market bookings:

- Sedifex Market can send the first customer booking email.
- Sedifex Market can notify the store that a booking came in.
- The store Apps Script should not send another first booking-received email by default.

After the store clicks **Confirm booking** in Sedifex admin, the store's App Script can send the confirmation and reminders.

## Sedifex public/custom page logic

Sedifex public/custom pages sit between external websites and Sedifex Market.

They are powered by Sedifex but may behave like store-specific landing pages.

Recommended source fields:

```json
{
  "source": "sedifex_custom_page",
  "sourceChannel": "sedifex_custom_page",
  "sourceLabel": "Sedifex Public Page"
}
```

The public page can send the first booking-received notification if that page flow supports it. After that, Sedifex admin and App Script follow the same confirmation workflow.

## Manual/admin booking logic

Manual bookings are created by store staff inside Sedifex.

Recommended source fields:

```json
{
  "source": "manual_admin",
  "sourceChannel": "manual_admin",
  "sourceLabel": "Manual/admin"
}
```

Manual bookings may not need a first customer notification unless the staff chooses to send one. The store can still confirm, cancel, complete, and sync to App Script.

## Shared admin workflow after booking creation

Once the booking exists in Sedifex, the source should no longer matter for the main admin actions.

### Confirm booking

Meaning:

```text
The client has paid and the store accepts the booking.
```

Recommended update:

```json
{
  "bookingStatus": "confirmed",
  "status": "confirmed",
  "paymentStatus": "paid",
  "payment": {
    "status": "paid",
    "confirmed": true
  },
  "confirmedAt": "server_timestamp",
  "confirmedBy": "staff_admin",
  "paymentConfirmedAt": "server_timestamp",
  "paymentVerifiedAt": "server_timestamp",
  "paymentVerifiedBy": "staff_admin",
  "syncStatus": "pending",
  "syncReason": "booking_confirmed",
  "syncRequestedAt": "server_timestamp"
}
```

If App Script sync is configured, Sedifex should queue sync.

### Cancel booking

Recommended update:

```json
{
  "bookingStatus": "cancelled",
  "status": "cancelled",
  "cancelledAt": "server_timestamp",
  "syncStatus": "pending",
  "syncReason": "booking_cancelled",
  "syncRequestedAt": "server_timestamp"
}
```

### Complete booking

Recommended update:

```json
{
  "bookingStatus": "completed",
  "status": "completed",
  "completedAt": "server_timestamp",
  "syncStatus": "pending",
  "syncReason": "booking_completed",
  "syncRequestedAt": "server_timestamp"
}
```

## App Script notification rule

The store Apps Script should normally not send the first booking-received email.

Use:

```javascript
sendInitialBookingReceivedEmail: false
```

This prevents duplicate emails.

The Apps Script should handle:

- booking confirmed email,
- booking cancelled email,
- booking completed email,
- reschedule/update email,
- 3-day reminder,
- 2-day reminder,
- 1-day reminder,
- thank-you follow-up.

## Reports logic

`Reports → Bookings` should help the store understand where each booking came from and what needs action.

The report should read:

- `source`
- `sourceChannel`
- `sourceLabel`
- `bookingStatus`
- `paymentStatus`
- `payment.status`
- `syncStatus`
- `syncReason`
- `confirmedAt`
- `cancelledAt`
- `completedAt`
- `reminder_3d_sent_at`
- `reminder_2d_sent_at`
- `reminder_1d_sent_at`
- `thank_you_sent_at`

Source labels should display like:

| Stored value | Display label |
| --- | --- |
| `client_website` | Client website |
| `sedifex_market` | Sedifex Market |
| `sedifex_custom_page` | Sedifex public page |
| `manual_admin` | Manual/admin |

## Common mistakes to avoid

### Mistake 1: Website only creates checkout but not booking

Wrong flow:

```text
Website → /integration/checkout/create only
```

This can create payment checkout but no booking record for the booking report or App Script sync.

Correct flow for services:

```text
Website → /v1IntegrationBookings
Website → /integration/checkout/create with metadata.bookingId
```

### Mistake 2: Website marks payment confirmed from return URL

Wrong:

```text
Customer returns from Paystack → website marks paid
```

Correct:

```text
Customer returns from Paystack → website shows processing
Sedifex webhook/status confirms payment → website updates paid state
```

### Mistake 3: App Script sends first email again

Wrong:

```text
Sedifex Market sends booking received
App Script also sends booking received
```

Correct:

```text
Sedifex Market/website sends booking received
App Script sends after store confirmation/cancel/complete/reminders
```

### Mistake 4: No source fields

Always set source information so reports can separate sales and bookings by origin.

Recommended:

```json
{
  "source": "website_booking_form",
  "sourceChannel": "client_website",
  "sourceLabel": "Client website"
}
```

## Quick implementation checklist for website developers

1. Keep API key on the server only.
2. Pull services/products from Sedifex.
3. For service booking, create booking first with `POST /v1IntegrationBookings`.
4. If online payment is needed, create checkout second with `metadata.bookingId`.
5. Store `bookingId`, `reference`, `sedifexOrderId`, and `clientOrderId`.
6. Treat webhook/status as payment truth.
7. Set source fields clearly.
8. Let Sedifex admin handle final confirmation.
9. Let App Script handle confirmation emails and reminders after store confirmation.

## Related docs

- `docs/integration-api-guide.md`
- `docs/booking-apps-script-template.md`
- `docs/integration-contract.md`
