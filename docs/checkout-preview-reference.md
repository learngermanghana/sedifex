# Checkout Preview Reference (Sedifex API ↔ Website)

This document is the reference for how marketplace websites (for example, `sedifexmarket.com`) should compute checkout totals with Sedifex.

## Shared contract

### Endpoint

`POST /integration/checkout/preview`

### Request (Site ➜ Sedifex)

```json
{
  "merchant_id": "m_123",
  "currency": "GHS",
  "fulfillment_type": "PICKUP",
  "delivery_address_id": null,
  "items": [
    { "type": "PRODUCT", "item_id": "p_1", "qty": 2 },
    { "type": "SERVICE", "item_id": "s_7", "qty": 1 }
  ]
}
```

### Response (Sedifex ➜ Site)

```json
{
  "pricing_version": "2026-05-12-v1",
  "subtotal": 25000,
  "tax_total": 1875,
  "delivery_fee": 0,
  "pre_processing_total": 26875,
  "processing_fee_to_add": 450,
  "final_total": 27325,
  "breakdown": [
    { "code": "SUBTOTAL", "amount": 25000 },
    { "code": "TAX", "amount": 1875 },
    { "code": "DELIVERY", "amount": 0 },
    { "code": "PROCESSING_FEE", "amount": 450 }
  ]
}
```

> Amounts are always minor units (pesewas/kobo) and always integers.

## Required field names

Use these names exactly in code and payloads:

- `fulfillment_type` (`PICKUP | DELIVERY`)
- `subtotal`
- `tax_total`
- `delivery_fee`
- `pre_processing_total`
- `processing_fee_to_add`
- `final_total`
- `pricing_snapshot`
- `payment_reference`
- `payment_status`
- `order_status`

## Multi-merchant marketplace behavior (`sedifexmarket.com`)

For a public product feed that lists products from many shops:

1. Cart must be grouped by merchant/store.
2. One checkout preview call per merchant cart.
3. Do not mix different `merchant_id` values in one preview/order.
4. Use merchant-scoped integration auth.

## Merchant setup checklist

Each merchant/shop should configure in Sedifex:

1. Published products/services.
2. Fulfillment options (`PICKUP`/`DELIVERY`).
3. Tax rules.
4. Delivery fee rules.
5. Processing fee rule.
6. Integration token for their website/marketplace connector.

## Order lifecycle fields

After a preview is accepted by buyer:

- Persist `pricing_snapshot` from preview response.
- Create payment and store `payment_reference`.
- Keep payment state in `payment_status` (`pending`, `paid`, etc.).
- Keep fulfillment/order state in `order_status` (`pending`, `processing`, `completed`, etc.).

This prevents drift if prices/rules change later.
