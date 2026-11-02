# Reuse the existing Sedifex Central Notification Web App

## Existing infrastructure — no second Apps Script required

The supplied Sedifex Central Notification Web App already supports:
- `doPost` JSON notifications authenticated with `SEDIFEX_NOTIFICATION_SHARED_SECRET`
- `GmailApp.sendEmail` from the Sedifex-owned account
- Branded HTML emails and attached PDF receipts stored in Google Drive
- Private `SentLog` and `Errors` worksheets
- Deduplication using store, event, reference, recipient type and recipient
- An optional Sedifex-owned tracking BCC

This PR replaces the newly drafted standalone sender with the **user's existing complete script** in `scripts/sedifex-transactional-email.gs`. It keeps the original HTML, PDF receipts, test menu and delivery logs.

## Security/compatibility improvements to the existing source

1. Require `SEDIFEX_NOTIFICATION_SHARED_SECRET` (32+ characters). Previously `verifySecret_` returned **true** when the secret property was missing — an unauthenticated public mail endpoint.
2. Keep optional `SEDIFEX_TRACKING_EMAIL` but remove the automatic default BCC; store copies are sent as separate, auditable notifications by Sedifex. Enable Sedifex platform tracking BCC explicitly only if required and privacy-approved.
3. Prefer Firebase's verified store-owner `replyTo`; ignore possibly stale `payload.brand.email` as Reply-To.
4. Lock around dedupe + send + ledger write to reduce concurrent duplicate emails. As with all Gmail calls, a crash after send but before the ledger write can still cause an uncertain delivery.
5. Redact sensitive payloads and secrets from the `Errors` sheet.
6. The Firebase sender correctly interprets existing response formats: success `{ok:true,sent:true}` and duplicate `{ok:true,skipped:true,reason:'duplicate'}`. It passes `brand`, `customer`, `payment`, `data` so PDF receipts remain populated, and stores returned `receiptNumber`/`receiptUrl` in `notification_outbox`.
7. Reuse existing Firebase environment names: `SEDIFEX_NOTIFICATION_WEBHOOK_URL` and `SEDIFEX_NOTIFICATION_SHARED_SECRET`. No new Apps Script instance or separate Firebase variable names.

## How to update the *existing* deployed script

1. Open the already-existing Sedifex Central Notification Apps Script project in the Sedifex Google account. Replace its source with `scripts/sedifex-transactional-email.gs` **in the same project**.
2. In **Project Settings → Script properties**, ensure `SEDIFEX_NOTIFICATION_SHARED_SECRET` contains a private random secret at least 32 characters long. If you rotate it, update the matching `SEDIFEX_NOTIFICATION_SHARED_SECRET` in the Firebase Functions environment.
3. Check existing optional `SEDIFEX_TRACKING_EMAIL`, `SEDIFEX_SENDER_NAME`, and `SEDIFEX_RECEIPTS_FOLDER_ID`. The tracking BCC is off by default unless explicitly set, but existing script properties are preserved.
4. **Deploy → Manage deployments → Edit existing deployment → New version → Deploy**, keeping the existing web-app URL where possible. Preserve **Execute as Me** for Sedifex's Google account.
5. Confirm Firebase's `SEDIFEX_NOTIFICATION_WEBHOOK_URL` points to this existing deployed `/exec` URL. The code accepts no merchant Apps Script as a fallback. Firebase deployment configuration is managed through `FUNCTIONS_ENV_SEDIFEX_WEB` in the workflow, without revealing secrets in GitHub source.
6. Send fake/test confirmations for Glittering Med-Spa and OncoNurse, with verified owners. Confirm **one customer email, one correct-store alert, attached receipt, no cross-store BCC**, and a single SentLog row per intended recipient.
7. After the script is updated and validated, merge and deploy PR #1741. **Do not merge while the live script has a missing/weak secret or the Firebase environment is unverified.**

## Merchant integrations and reminders

- Transactional email (bookings, receipts, reminders, store notices) now uses Sedifex's central script, irrespective of a merchant's **Business Gmail** or **Custom webhook** selection.
- Existing client `bulkEmailIntegration` settings are retained for optional marketing/bulk campaigns only.
- The hardcoded booking-editor Apps Script URL has been removed.
- Legacy client booking-sheet sync is paused by default: old scripts can send immediate emails or arbitrary BCC as a side effect of receiving booking updates. To resume sheet sync, an administrator must **verify the script is sheet-only** and set `bookingSync.syncMode='sheet_only'`, `bookingSync.emailNotificationsDisabled=true`. These flags do not modify the live Google script.
- Sedifex's existing `processBookingEmailReminders` scheduled Function uses the same central sender.
- Existing time-driven triggers **inside merchants' Google accounts** can still send messages for prior spreadsheet rows. The user will coordinate their cleanup. This is an independent residual privacy risk that cannot be blocked from Sedifex alone.
- Mail quotas and PDF Drive usage apply to the Google account that executes the existing Sedifex script.

## Test coverage

`functions/test/bookingNotificationIsolation.test.js` verifies the legacy script's real response shapes, an attached PDF receipt (using a test stub for Google APIs), mandatory secret, no default BCC, verified store address filtering, and duplicate handling.
