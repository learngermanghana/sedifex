# Sedifex Canonical Integration Contract

This is the authoritative integration contract for all Sedifex partner-facing endpoints and webhooks.

All integration documentation must link to this page and must not redefine contract semantics independently.

Related current implementation docs:

- `docs/integration-api-guide.md` — endpoint usage, checkout, catalog, bookings, and webhook guidance.
- `docs/sedifex-platform-updates-2026.md` — latest Online Orders, source-of-truth, checkout, booking, pay-on-delivery, and engagement updates.
- `docs/engagement-cross-platform-integration-reference.md` — product comments/favorites cross-platform contract.

## Current source-of-truth rule

Sedifex remains the source of truth for external commerce, booking, and engagement integrations.

| Domain | Canonical record |
|---|---|
| Product orders from Sedifex Market | `integrationOrders` |
| Product orders from merchant/client websites | `integrationOrders` |
| Product pay-on-delivery orders | `integrationOrders` |
| Service bookings from Sedifex Market | `integrationBookings` |
| Service bookings from merchant/client websites | `integrationBookings` |
| Lead-only enquiries | `checkoutRequests` |
| Payment/webhook event logs | `integrationWebhookEvents` |
| Product comments | `engagement_comments` |
| Product favorites/reactions | `engagement_favorites` |
| Engagement summaries | `engagement_threads` |

Do not store product purchases as bookings. Do not treat webhook logs as order records. Do not make merchant websites the permanent source of truth.

## Mandatory versioning policy

- **Current contract version:** `2026-04-13`
- **Required request header (all integration API requests):** `X-Sedifex-Contract-Version: 2026-04-13`
- **Response headers:**
  - `x-sedifex-contract-version`
  - `x-sedifex-request-id`

### Enforcement

- Missing or mismatched contract header returns `400` with:

```json
{
  "error": "contract-version-mismatch",
  "expectedVersion": "2026-04-13",
  "receivedVersion": "<sent_version_or_empty>"
}
```

- Integration clients must fail fast on contract mismatch and raise a visible operator error.

## URL/versioning rules (mandatory)

- **Do not use path-based versioning for integration contract dates** (for example, never append `/2026-04-13` to the base URL).
- Keep contract versioning in the `X-Sedifex-Contract-Version` header only.
- Base URL remains deployment/environment specific (for example, `https://us-central1-sedifex-web.cloudfunctions.net`).

## Required operational behavior for partners

- Send `x-api-key` and `X-Sedifex-Contract-Version` on every authenticated integration request.
- Log `x-sedifex-request-id` for support/debugging correlation.
- Treat contract-version mismatch as a deployment/configuration incident and escalate immediately.
- Send `sourceChannel`, `sourceLabel`, `clientOrderId`, `storeId`, and `reference` where applicable.
- For product orders, write to Sedifex order endpoints so records appear in **Online Orders**.
- For service bookings, create bookings first and link checkout/payment afterward.
- For comments/favorites, resolve to `canonicalProductKey = storeId:sourceProductId`.

## Required behavior for Sedifex-owned docs

Every integration doc (quickstarts, plugin guides, webhook docs, and plans) must:

1. Link to this canonical contract page.
2. State that header-based contract versioning is mandatory.
3. Avoid introducing alternative versioning guidance.
4. Follow the current source-of-truth mapping above.
