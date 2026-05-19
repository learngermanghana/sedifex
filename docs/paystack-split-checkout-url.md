# Paystack Split Checkout URL

This document explains the checkout URL that Sedifex Market and client websites must use when an online payment should split automatically between Sedifex and the merchant Paystack subaccount.

## Summary

Sedifex now has a dedicated checkout-create function for Paystack subaccount/split payments:

```txt
https://us-central1-sedifex-web.cloudfunctions.net/integrationCheckoutCreate
```

Every website that accepts online payment through Sedifex and should use automatic Paystack splitting must configure this URL.

## Required environment variables

Keep the normal integration base URL for products, services, preview, gallery, blog, customer sync, and other integration calls:

```bash
SEDIFEX_INTEGRATION_API_BASE_URL=https://us-central1-sedifex-web.cloudfunctions.net
```

Add the dedicated checkout-create URL for online payment creation:

```bash
SEDIFEX_INTEGRATION_CHECKOUT_CREATE_URL=https://us-central1-sedifex-web.cloudfunctions.net/integrationCheckoutCreate
```

Recommended full website env set:

```bash
SEDIFEX_INTEGRATION_API_BASE_URL=https://us-central1-sedifex-web.cloudfunctions.net
SEDIFEX_INTEGRATION_CHECKOUT_CREATE_URL=https://us-central1-sedifex-web.cloudfunctions.net/integrationCheckoutCreate
SEDIFEX_STORE_ID=<store_id>
SEDIFEX_INTEGRATION_KEY=<store_integration_key>
SEDIFEX_CONTRACT_VERSION=2026-04-13
```

## Which URL should each flow use?

| Flow | URL/env to use |
|---|---|
| Catalog/products/services | `SEDIFEX_INTEGRATION_API_BASE_URL` |
| Checkout preview | `SEDIFEX_INTEGRATION_API_BASE_URL` |
| Online checkout create | `SEDIFEX_INTEGRATION_CHECKOUT_CREATE_URL` |
| Pay on delivery | `SEDIFEX_INTEGRATION_API_BASE_URL` |
| Manual service booking | `SEDIFEX_INTEGRATION_API_BASE_URL` |
| Blog/gallery/top-selling/customer sync | `SEDIFEX_INTEGRATION_API_BASE_URL` |

## Why the dedicated URL exists

The Functions root is:

```txt
https://us-central1-sedifex-web.cloudfunctions.net
```

The new checkout-create function is deployed as:

```txt
https://us-central1-sedifex-web.cloudfunctions.net/integrationCheckoutCreate
```

So a website should not assume that:

```txt
/integrationCheckoutCreate
```

will automatically route to the new function unless a hosting rewrite/router has been added. Until a router is introduced, use the dedicated URL directly.

## Required checkout payload fields

When creating an online payment checkout, the website or Sedifex Market should send:

```json
{
  "storeId": "STORE_ID",
  "merchantId": "STORE_ID",
  "clientOrderId": "WEB-PAY-1778870000000",
  "sourceChannel": "client_website",
  "sourceLabel": "Client Website",
  "currency": "GHS",
  "amount": 120,
  "items": [
    {
      "type": "PRODUCT",
      "item_type": "product",
      "item_id": "SEDIFEX_PRODUCT_ID",
      "qty": 1
    }
  ],
  "customer": {
    "email": "buyer@example.com",
    "phone": "+233200000000"
  },
  "returnUrl": "https://clientsite.com/payment/return"
}
```

Sedifex Market may also pass split data if it has already read the merchant routing:

```json
{
  "subaccount": "ACCT_xxxxx",
  "paystackSubaccountCode": "ACCT_xxxxx",
  "splitPayment": {
    "provider": "paystack",
    "mode": "subaccount",
    "subaccount": "ACCT_xxxxx",
    "transactionChargeMinor": 360,
    "bearer": "subaccount",
    "commissionControlledBy": "sedifex"
  }
}
```

The checkout-create function forwards the split to Paystack transaction initialize using:

```ts
{
  subaccount: paystackSubaccountCode,
  transaction_charge: sedifexCommissionMinor,
  bearer: 'subaccount',
  metadata: {
    storeId,
    sourceChannel,
    sourceLabel,
    paystackSubaccountCode,
    splitEnabled: true
  }
}
```

## Client websites affected

A client website must add `SEDIFEX_INTEGRATION_CHECKOUT_CREATE_URL` if it does any of the following:

```txt
Online product checkout through Sedifex
Online service booking payment through Sedifex
Online school registration payment through Sedifex
Any Paystack payment that should split between Sedifex and the merchant
```

A website does not need the dedicated checkout-create URL if it only uses:

```txt
Pay on delivery
Manual payment
WhatsApp enquiry/order
Catalog display only
Blog/gallery/customer sync only
```

## Merchant setup requirement

Automatic splitting only works when the store has a Paystack subaccount saved in Sedifex:

```txt
stores/{storeId}.paymentRouting.paystackSubaccountCode
paystackSubaccounts/{storeId}.subaccountCode
```

Stores enter only their settlement details. Sedifex controls the commission percentage from backend configuration:

```bash
SEDIFEX_DEFAULT_PAYSTACK_COMMISSION_PERCENT=3
```

## Deployment notes

Deploy the core checkout function:

```bash
firebase deploy --only functions:integrationCheckoutCreate
```

Then update Sedifex Market/client websites in Vercel:

```bash
vercel env add SEDIFEX_INTEGRATION_CHECKOUT_CREATE_URL production
```

Paste:

```txt
https://us-central1-sedifex-web.cloudfunctions.net/integrationCheckoutCreate
```

Redeploy the website after adding the env.

## Future cleanup

Later, Sedifex can add a router/hosting rewrite so websites can use:

```txt
/integrationCheckoutCreate
```

For now, use the dedicated function URL for online checkout create.
