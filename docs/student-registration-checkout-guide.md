# Student Registration Checkout Guide

This guide explains how a school, training center, or course website should send student registration forms to Sedifex and optionally start an online checkout.

## Current implementation status

Student registration checkout is implemented in the Sedifex web API at:

```txt
POST /api/student-registration-intake
```

The handler is in:

```txt
web/api/student-registration-intake.ts
```

It supports three payment modes:

- `online` — creates the registration, initializes Paystack, and returns an authorization URL for checkout.
- `manual` — creates the registration with `pending_manual_review` payment status.
- `none` — creates the registration with `not_required` payment status.

The Sedifex dashboard page that shows these records is:

```txt
web/src/pages/StudentRegistration.tsx
```

Records are saved to:

```txt
student_registrations
customers
```

---

## Recommended website setup

Use this when a school website has a form like:

- student name
- phone
- email
- course/programme
- preferred class time
- branch/location
- notes
- registration fee/payment amount

The website should submit the form to Sedifex from a server-side route or API action. Do not put Paystack secret keys in the website frontend.

### Website environment variables

```bash
SEDIFEX_SITE_BASE_URL=https://www.sedifex.com
SEDIFEX_STORE_ID=<store_id>
SEDIFEX_REGISTRATION_RETURN_URL=https://schoolwebsite.com/registration/thank-you
```

If the website is hosted under the same Sedifex deployment, the base URL can be omitted and the site can call `/api/student-registration-intake` directly.

---

## Endpoint

```txt
POST https://www.sedifex.com/api/student-registration-intake
```

Required:

- `storeId`
- `customer.name` or `data.studentName`
- at least one contact: `customer.email` or `customer.phone`

Recommended:

- `pageId`
- `source`
- `data.course`
- `data.preferredClassTime`
- `data.branch`
- `data.notes`
- `payment.mode`
- `payment.amount` when `payment.mode` is `online`
- `payment.currency`
- `payment.callbackUrl`

---

## Online checkout payload

Use `payment.mode: "online"` when the registration must redirect the student/parent to Paystack.

```json
{
  "storeId": "store_123",
  "pageId": "student-registration",
  "source": "school_website",
  "customer": {
    "name": "Kojo Mensah",
    "email": "parent@example.com",
    "phone": "+233201234567"
  },
  "data": {
    "course": "German A1",
    "preferredClassTime": "Evening class",
    "branch": "Tema",
    "notes": "Student wants weekday classes"
  },
  "payment": {
    "mode": "online",
    "amount": 250,
    "currency": "GHS",
    "callbackUrl": "https://schoolwebsite.com/registration/thank-you"
  }
}
```

Successful response:

```json
{
  "ok": true,
  "submissionId": "abc123",
  "reference": "REG-STORE_-1778870000000",
  "paymentMode": "online",
  "paymentStatus": "pending",
  "payment": {
    "provider": "paystack",
    "ok": true,
    "authorizationUrl": "https://checkout.paystack.com/...",
    "accessCode": "...",
    "reference": "REG-STORE_-1778870000000"
  }
}
```

Frontend behavior:

1. Submit the registration form to your website server route.
2. Your server calls the Sedifex endpoint above.
3. If `payment.authorizationUrl` exists, redirect the browser to that URL.
4. On the return page, show a processing/thank-you message.
5. Treat the payment as confirmed only after Sedifex/payment verification or webhook processing confirms it. Do not mark a registration paid just because the user returned from Paystack.

---

## Manual payment payload

Use `payment.mode: "manual"` when the school wants students to pay by bank transfer, MoMo, cash, or WhatsApp confirmation.

```json
{
  "storeId": "store_123",
  "pageId": "student-registration",
  "source": "school_website",
  "customer": {
    "name": "Akua Owusu",
    "phone": "+233241112222"
  },
  "data": {
    "course": "Hair Braiding",
    "preferredClassTime": "Saturday morning",
    "branch": "Accra"
  },
  "payment": {
    "mode": "manual",
    "amount": 100,
    "currency": "GHS",
    "manualInstructions": "Pay to the school MoMo number and send the reference on WhatsApp."
  }
}
```

The registration will appear in Sedifex with:

```txt
payment.status = pending_manual_review
```

---

## No-payment registration payload

Use `payment.mode: "none"` for free enquiries, admissions interest forms, or registration forms that do not collect money yet.

```json
{
  "storeId": "store_123",
  "pageId": "student-registration",
  "source": "school_website",
  "customer": {
    "name": "Yaw Boateng",
    "email": "yaw@example.com"
  },
  "data": {
    "course": "Makeup Class",
    "preferredClassTime": "Afternoon"
  },
  "payment": {
    "mode": "none"
  }
}
```

The registration will appear in Sedifex with:

```txt
payment.status = not_required
```

---

## Minimal Next.js server route example

Create a website API route such as `app/api/register-student/route.ts`:

```ts
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const form = await request.json()

  const baseUrl = process.env.SEDIFEX_SITE_BASE_URL ?? 'https://www.sedifex.com'
  const storeId = process.env.SEDIFEX_STORE_ID

  if (!storeId) {
    return NextResponse.json({ error: 'Missing SEDIFEX_STORE_ID' }, { status: 500 })
  }

  const response = await fetch(`${baseUrl}/api/student-registration-intake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeId,
      pageId: 'student-registration',
      source: 'school_website',
      customer: {
        name: form.name,
        email: form.email,
        phone: form.phone,
      },
      data: {
        course: form.course,
        preferredClassTime: form.preferredClassTime,
        branch: form.branch,
        notes: form.notes,
      },
      payment: {
        mode: form.paymentMode ?? 'online',
        amount: Number(form.amount || 0),
        currency: 'GHS',
        callbackUrl: process.env.SEDIFEX_REGISTRATION_RETURN_URL,
      },
    }),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    return NextResponse.json(payload ?? { error: 'Registration failed' }, { status: response.status })
  }

  return NextResponse.json({
    ok: true,
    submissionId: payload.submissionId,
    reference: payload.reference,
    checkoutUrl: payload.payment?.authorizationUrl ?? null,
    paymentStatus: payload.paymentStatus,
  })
}
```

The frontend can then redirect:

```ts
const result = await response.json()

if (result.checkoutUrl) {
  window.location.href = result.checkoutUrl
}
```

---

## Dashboard workflow

After submission, Sedifex users should open:

```txt
Student registration
```

There they can review:

- student/contact details
- selected course/programme
- preferred class time
- registration source
- payment status
- payment reference

Use the payment reference when matching Paystack, MoMo, or bank transfer records.

---

## Deployment checklist

1. Confirm the Sedifex web deployment includes `web/api/student-registration-intake.ts`.
2. Confirm Paystack is configured in the Sedifex environment:

```bash
PAYSTACK_SECRET_KEY=<paystack_secret>
# or legacy alias
PAYSTACK_SECRET=<paystack_secret>
```

3. For registration checkout fees, optionally configure:

```bash
SEDIFEX_REGISTRATION_COMMISSION_PERCENT=3
SEDIFEX_CUSTOMER_PROCESSING_FEE_PERCENT=1.95
```

4. Add the school website environment variables:

```bash
SEDIFEX_SITE_BASE_URL=https://www.sedifex.com
SEDIFEX_STORE_ID=<store_id>
SEDIFEX_REGISTRATION_RETURN_URL=https://schoolwebsite.com/registration/thank-you
```

5. Test all three flows:

- online checkout
- manual payment
- no-payment enquiry

6. Confirm the registration appears in the Sedifex dashboard under Student registration.

---

## Notes for future improvement

- If a school website already uses the general integration checkout endpoint, it can still use `POST /integrationCheckoutCreate` for payment and store `metadata.pageType = "student_registration"`.
- The combined `/api/student-registration-intake` endpoint is recommended when the website needs one simple call that creates the registration and starts checkout.
- Payment final confirmation should be handled by Paystack verification/webhook logic, not by the browser return URL alone.
