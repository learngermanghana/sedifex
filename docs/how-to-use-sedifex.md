# How to Use Sedifex (Current Navigation Guide)

Sedifex is a POS and inventory platform for retail operations. This tutorial has been updated to match the **latest navigation layout**, including newer pages like **Dashboard**, **Bookings**, **Social media**, and **Data**, plus the **Sell** child pages (**Close day** and **Invoice**).

## Who this guide is for

- **Owners/Admins** setting up and running the workspace.
- **Cashiers/Sales staff** handling checkout and customer-facing sales.
- **Operations teams** managing inventory, finance, bookings, and communication.

---

## 1) Sign in and confirm workspace access

1. Open your Sedifex app URL (for example, `https://app.sedifex.com`).
2. Sign in with your approved account.
3. Confirm your workspace/store is selected at the top of the app.
4. If you manage multiple stores, switch stores from the workspace selector.

If login succeeds but data is missing, check that your membership is linked to the correct store.

---

## 2) Understand the current navigation

### Owner navigation

- **Dashboard**
- **Items**
- **Sell**
  - **Close day**
  - **Invoice**
- **Customers**
- **Bookings**
- **Social media**
- **SMS**
- **Data**
- **Public page**
- **Account**

### Staff navigation

- **Sell**
  - **Close day**
- **Customers**
- **Bookings**

> Note: Navigation is role-based, so staff members see fewer sections than owners.

---

## 3) Dashboard

Use **Dashboard** to get a fast operational view:

- Today’s activity and quick summaries.
- Shortcuts to key actions.
- Current workspace context.

Start each shift here to quickly spot priorities.

---

## 4) Items (formerly Product)

Use **Items** to manage inventory and pricing.

### Common tasks

- Add a new item.
- Update item name, price, stock, image, and category.
- Keep descriptions clear for receipts and internal search.

### Bulk import (CSV)

Use CSV import when onboarding many products at once.

- Typical required fields: `name`, `price`
- Typical optional fields: `image_url`, `image_alt`

Tip: Keep naming consistent (for example, one standard for size/unit naming).

---

## 5) Sell + child pages

### Sell

The main **Sell** page is where checkout happens.

Typical flow:

1. Search/select items.
2. Add to cart.
3. Adjust quantity.
4. Confirm totals.
5. Choose payment method.
6. Complete sale and share receipt.

### Close day (under Sell)

Use **Close day** to reconcile and finalize the day:

- Confirm totals.
- Compare expected vs recorded sales.
- Log end-of-day checks.

### Invoice (under Sell, owner role)

Use **Invoice** for formal billing:

1. Select customer.
2. Add line items.
3. Confirm totals/discounts.
4. Save and share invoice.
5. Track payment status.

---

## 6) Customers

Use **Customers** to manage buyer records and customer history.

- Create or update customer profiles.
- Attach customers to transactions.
- Improve follow-up quality for receipts, reminders, and promos.

Clean customer records reduce failed delivery and support issues.

---

## 7) Bookings

Use **Bookings** to manage scheduled services/appointments.

- Create and update bookings.
- Track booking states (for example confirmed/cancelled based on your workflow).
- Keep customer details accurate for reminders and updates.

Bookings work best when staff consistently update statuses in real time.

---

## 8) Social media

Use **Social media** to manage linked social content and visibility features.

Depending on your configuration, this may include:

- Connected social links.
- Embedded media/content settings.
- Visibility controls for public-facing channels.

Keep links and brand content current to avoid outdated promotions.

---

## 9) SMS

Use **SMS** for customer communication (promotions, reminders, updates).

Best practices:

- Segment customers before sending.
- Keep messages short and clear.
- Avoid duplicate campaigns.
- Review delivery outcomes when available.

---

## 10) Data

Use **Data** for transfer/export workflows.

Typical uses:

- Export records for reporting.
- Move/import data between systems.
- Keep backups for operational continuity.

Set a weekly cadence for exports if your business needs external reporting.

---

## 11) Public page

Use **Public page** to manage your customer-facing Sedifex storefront/profile.

Common updates:

- Store profile details.
- Product/catalog visibility.
- Contact channels and promo information.

Keep this page updated so online visitors see accurate business information.

---

## 12) Account

Use **Account** for workspace-level controls.

Typical tasks:

- Billing/subscription management.
- Integration and API settings.
- Security/access settings.
- Profile and workspace configuration.

Owners should review this page regularly (at least weekly).

---

## 13) Daily operating checklist

### Start of day

- Confirm internet/device readiness.
- Open **Dashboard** and review priorities.
- Check low-stock items in **Items**.
- Confirm cashier/staff access.

### During operations

- Process transactions in **Sell**.
- Keep stock updates current in **Items**.
- Attach customer details where relevant.
- Manage active appointments in **Bookings**.

### End of day

- Run **Close day** reconciliation.
- Review unpaid/pending **Invoice** records.
- Complete SMS follow-ups if needed.
- Verify key updates on **Public page**.

---

## 14) Quick troubleshooting

### “I can’t find Product tab”

It was renamed to **Items**.

### “I can’t find invoice”

**Invoice** is a child page under **Sell** (owner role).

### “My nav looks different from this guide”

Your role may be **staff**; staff navigation is intentionally limited.

### “Receipts are not reaching customers”

Validate contact details and resend from sales history.

### “Public storefront details are wrong”

Update them in **Public page** and confirm save/publish.

---

## Related docs

- Main setup: `README.md`
- Integration quickstart: `docs/integration-quickstart.md`
- WordPress install guide: `docs/wordpress-install-guide.md`
- Webhook signatures: `docs/webhooks-signature-verification.md`
