# How to Use Sedifex (Current UI Guide)

Sedifex is a POS and inventory platform for retail operations. This tutorial reflects the **current app wording and tabs**, including the move from **Product** to **Item** and the updated **Sell** workflow with sub-tabs.

## Who this guide is for

- **Owners/Admins** setting up and managing the business.
- **Cashiers/Sales staff** handling day-to-day checkout.
- **Operations users** managing stock, customers, and invoicing.

---

## 1) Sign in and access your workspace

1. Open your Sedifex app URL (for example, `https://app.sedifex.com`).
2. Sign in with your approved account.
3. Confirm your account has the right workspace/store access.

If login works but you cannot see data, your team access record is usually missing or mapped to the wrong store.

---

## 2) Understand the main tabs/pages

Depending on role, your navigation includes key areas like:

- **Items** (formerly Products)
- **Sell** (with sub-tabs)
- **SMS**
- **Customers**
- **Invoice**
- **Public Page**
- **Account**

This guide walks through each one in the typical business flow.

---

## 3) Items tab (formerly Product)

Use **Items** to manage what you sell.

### Add or update an item

For each item, maintain:

- Item name
- Price
- Stock quantity
- Category (optional)
- Description (optional)
- Image (optional)

### Import items in bulk (CSV)

Use CSV import when onboarding many items:

- Required columns: `name`, `price`
- Optional columns: `image_url`, `image_alt`

Tip: Keep naming consistent (e.g., “Coke 50cl” vs “Coca-Cola 50cl”) to improve search and reporting.

---

## 4) Sell tab + sub-tabs

The **Sell** area is now structured with sub-tabs to speed up checkout operations.

### Common Sell flow

1. Search/select items.
2. Add to cart.
3. Adjust quantity if needed.
4. Confirm totals.
5. Select payment method.
6. Complete sale.

### Why sub-tabs matter

Sell sub-tabs help separate fast tasks (for example: carting, recent sales, or related checkout utilities depending on role/config). Train staff to stay in the appropriate sub-tab during peak hours for faster transactions.

---

## 5) Customer tab

Use **Customers** to manage buyer records and relationship history.

Typical actions:

- Add a new customer profile.
- Attach sales to existing customers.
- Track repeat purchases or outstanding balances (if enabled).

Clean customer data improves follow-up messaging, invoicing, and receipt sharing.

---

## 6) Invoice tab/page

Use **Invoice** to issue and track formal billing documents.

Recommended process:

1. Create invoice for a customer.
2. Add line items and quantities.
3. Confirm pricing, discounts, and totals.
4. Save/share invoice.
5. Track payment status.

Use invoices for B2B, deferred payment, or any transaction needing a formal document.

---

## 7) Customer receipt sharing

After a sale, share receipts with customers from the checkout flow.

Best practices:

- Verify item list and totals before sending.
- Confirm customer contact details (phone/email) first.
- Re-send receipt from history when requested.

This improves trust and reduces disputes.

---

## 8) SMS tab

Use **SMS** for customer communication workflows (promotions, updates, reminders, or follow-ups based on your configuration).

Operational tips:

- Segment recipients (e.g., frequent buyers).
- Keep messages short and clear.
- Avoid duplicate messaging during busy campaigns.
- Review delivery outcomes where available.

---

## 9) Public Page tab/page

Use **Public Page** to manage your customer-facing storefront/profile presence.

Depending on setup, this can include:

- Business profile details
- Displayed catalog/items
- Contact and order visibility settings

Keep public information accurate so customers see correct items, pricing context, and contact channels.

---

## 10) Account page

Use **Account** for business/profile settings and operational controls.

Typical tasks:

- Update account/business details.
- Manage subscription/billing information.
- Review role/access settings (owner/admin scope).
- Adjust preferences relevant to your workspace.

Owners should review this page weekly to keep settings current.

---

## 11) Daily operating checklist (recommended)

### Start of day

- Confirm internet/device readiness.
- Check low-stock items.
- Confirm cashier accounts are active.

### During business hours

- Process sales from **Sell** sub-tabs.
- Keep item stock updates current.
- Attach customers to relevant transactions.
- Share receipts immediately after checkout.

### End of day

- Reconcile sales totals.
- Review invoices created/paid/pending.
- Check SMS or customer follow-up tasks.
- Verify key account/public page updates if any.

---

## 12) Quick troubleshooting

### “I can’t find Product tab”

The tab is now **Items**.

### “Checkout feels different”

Use the **Sell** section and train staff on its sub-tabs.

### “Receipts are not reaching customers”

Validate customer contact details and retry sharing from sales history.

### “My storefront details are wrong”

Update them in **Public Page** and confirm changes are saved/published.

---

## Related docs

- Main setup: `README.md`
- Integration quickstart: `docs/integration-quickstart.md`
- WordPress install guide: `docs/wordpress-install-guide.md`
- Webhook signatures: `docs/webhooks-signature-verification.md`

