# Europe Stripe Connect Payments

This guide documents how Sedifex routes European and global online checkout payments through Stripe Connect while keeping the existing Paystack flow for Africa/GHS transactions.

## Overview

Sedifex supports two primary online payment routes:

- **Africa/GHS payments use Paystack.** Ghana cedi (`GHS`) checkouts should continue through Paystack, including Paystack split/subaccount behavior where configured.
- **Europe and global currencies can use Stripe Connect.** Checkouts in currencies such as `EUR`, `GBP`, and `USD` can be routed to Stripe Connect when the seller has a Stripe connected account.
- **Sedifex platform commission defaults to 3%.** Unless another supported platform fee percentage is provided, Sedifex applies a 3% platform commission to Stripe Connect checkouts.

Stripe Connect checkouts require a seller-specific connected account ID so Stripe can route the direct charge to the seller account and apply the Sedifex application/platform fee.

## Fee example: EUR 100 checkout

For a customer checkout of **EUR 100**:

1. The customer pays **EUR 100** at Stripe Checkout.
2. Sedifex applies a **3% platform fee**, so the Sedifex platform fee is **EUR 3**.
3. Stripe deducts its own processing fee according to the Stripe account, country, card, and payment-method pricing that applies to the transaction.
4. The seller receives **EUR 100 minus the Stripe fee minus the Sedifex 3% platform fee**.

In formula form:

```txt
Seller payout = EUR 100 - Stripe processing fee - EUR 3 Sedifex platform fee
```

## Required Firebase params

Configure these Firebase params before enabling Stripe Connect checkout in production:

```txt
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

- `STRIPE_SECRET_KEY` is used by the checkout-create flow to create Stripe Checkout Sessions for connected accounts.
- `STRIPE_WEBHOOK_SECRET` is used by the webhook handler to verify that inbound Stripe webhook requests were signed by Stripe.

## Checkout payload example

A Europe Stripe Connect checkout request should include `paymentProvider: "stripe"`, a supported Stripe currency, the seller's connected account ID, and the Sedifex platform fee percentage.

```json
{
  "paymentProvider": "stripe",
  "currency": "EUR",
  "amount": 100,
  "stripeConnectedAccountId": "acct_xxxxxxxxx",
  "platformFeePercent": 3,
  "customer": {
    "email": "client@example.com",
    "name": "Test Client",
    "phone": "+49123456789"
  }
}
```

Notes:

- `amount` is the customer-facing checkout total in major currency units. For example, `100` with `EUR` means EUR 100.
- `stripeConnectedAccountId` must be the seller's Stripe connected account ID, typically beginning with `acct_`.
- `platformFeePercent` should normally be `3` unless Sedifex intentionally overrides the default commission for that checkout.
- Production requests must still include the normal Sedifex integration checkout fields required by the calling surface, such as store/merchant identifiers, reference/client order identifiers, items, and return URLs when applicable.

## Provider fallback routing

Sedifex should use the following fallback behavior when `paymentProvider` is not explicitly provided:

- If the checkout currency is `EUR`, `GBP`, or `USD`, route the payment to **Stripe Connect**.
- If the checkout currency is `GHS`, route the payment to **Paystack**.
- For other currencies, keep the existing default routing behavior unless a supported provider is explicitly selected.

This means a request with `currency: "EUR"` and no `paymentProvider` should still create a Stripe Connect checkout as long as the seller's `stripeConnectedAccountId` is available.

## Stripe webhook setup

The Stripe webhook URL should point to the exported `stripeWebhook` Firebase function.

Configure Stripe to send relevant checkout and payment-intent events to that function URL. The handler should verify every webhook request using `STRIPE_WEBHOOK_SECRET` before trusting the event payload.

At minimum, the webhook flow must:

1. Receive Stripe events at the deployed `stripeWebhook` function URL.
2. Read the `Stripe-Signature` request header.
3. Verify the signature using `STRIPE_WEBHOOK_SECRET` and the raw request body.
4. Reject requests with missing or invalid signatures.
5. Only after verification, update the matching Sedifex order/payment state from the Stripe event metadata and payment status.

The exported `stripeConnectWebhook` alias may point to the same implementation, but Stripe dashboard configuration should use the deployed endpoint that Sedifex exposes for `stripeWebhook` unless a separate alias URL is intentionally chosen.
