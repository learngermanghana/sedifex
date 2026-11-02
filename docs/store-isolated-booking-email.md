# Sedifex-owned transactional email and store isolation

## What changes

Sedifex sends **all transactional notifications** (bookings, payment receipts, orders, reminders, etc.) from **one Sedifex-owned Google Apps Script**. Previously connected merchant Gmail / bulk-email Apps Scripts no longer control these messages. Merchants may still have separate marketing/bulk-campaign integrations, which are not part of the transactional sender.

The delivery pipeline sends two separate, logged messages rather than a blind BCC:

1. A branded email to the customer's recorded email address.
2. An independent alert to the **verified owner of the correct store**, and optionally staff whose **verified Firebase Auth email** is explicitly approved in that same store's `storeSettings.notifications.adminEmails`.

The backend checks owner/staff membership **again** just before sending the store alert. Stale or copied cross-store emails in `adminEmails` cannot receive that alert. Reply-To is a verified store owner, never an arbitrary merchant config value.

The Sedifex Apps Script explicitly ignores `bcc`, `cc` and arbitrary sender addresses, checks a long shared secret, records deliveries in a private spreadsheet and deduplicates by store + event + reference + recipient.

## Deploy the one Sedifex Google Apps Script

These steps must be completed before merging or deploying the Functions that switch over transactional mail.

1. Sign in to the Google account Sedifex will use as its mail sender. A dedicated Google Workspace mailbox is preferable for identity and quota management. The From mailbox is the account executing the script, *not* each merchant's Gmail.
2. Create a **private Google Sheet** owned by Sedifex for the transactional email ledger. Copy its spreadsheet ID. Do not share the ledger with merchants or the public.
3. Create a standalone project at https://script.google.com/ and paste `scripts/sedifex-transactional-email.gs`.
4. In **Project Settings → Script properties**, set `SEDIFEX_EMAIL_APPS_SCRIPT_SECRET` to a long random value (32+ characters) and `SEDIFEX_EMAIL_LOG_SHEET_ID` to the spreadsheet ID. Do not put either value in GitHub source.
5. **Deploy → New deployment → Web app**. Execute as **Me** (the Sedifex mailbox). Web app access **Anyone** (Firebase server-to-server requests are authenticated by the secret in the request body). Accept the Google permissions needed for Gmail and Sheets. Copy the resulting `https://script.google.com/macros/s/.../exec` URL.
6. In Firebase Functions environment for project `sedifex-web`, set
   - `SEDIFEX_EMAIL_APPS_SCRIPT_URL` = the deployment's `/exec` URL
   - `SEDIFEX_EMAIL_APPS_SCRIPT_SECRET` = the **same** secret saved in Script Properties
   The GitHub Functions deploy workflow currently writes its environment from the repository secret `FUNCTIONS_ENV_SEDIFEX_WEB` into `functions/.env.sedifex-web`. Update that secret without deleting other required environment variables.
7. Test separate **fictional/test** booking notifications for Glittering and OncoNurse: customer gets one branded message and only the correct store's verified owner/team gets an alert. Examine the private delivery ledger and `notification_outbox` in Firestore. Test with stale OncoNurse `adminEmails` stored against Glittering: it must not receive an alert. Test a reminder and a payment email as well.
8. After the integration is confirmed, merge and deploy Firebase Functions and the website. A Google Apps Script web app is not automatically deployed by merging GitHub.

### Fail-safe behavior

When the Sedifex Apps Script URL/secret is missing, its response is an error, or its Gmail quota is exhausted, the backend **does not** try a client's Apps Script. The unsent message is tracked in Sedifex's notification outbox. In particular, Google Apps Script may return HTTP 200 for a rejected request; the backend also checks `ok: true` and `sent: 1` or `duplicate: true` in the JSON response. Provider acceptance does not guarantee inbox delivery.

**No production cutover until the Sedifex-owned deployment is verified.**

## What happens to existing merchant scripts

- Existing `bulkEmailIntegration` settings are preserved for *optional marketing/bulk campaigns*; they no longer send Sedifex transactional notifications.
- The old **hardcoded booking-editor Apps Script POST has been removed**.
- Existing merchant booking-sheet sync is **paused by default**, even for previously configured stores, because the old script sends immediate emails as a side effect of syncing a booking. This prevents Sedifex from triggering new duplicate or cross-store email copies.
- To resume Google Sheet export later, **audit the merchant script so that it sends no emails** and explicitly configure `bookingSync.syncMode='sheet_only'` and `bookingSync.emailNotificationsDisabled=true`. Those flags are an administrative attestation and do *not* rewrite existing merchant code themselves.
- Sedifex's existing `processBookingEmailReminders` Cloud Function handles reminders using the central Apps Script. It is scheduled daily in Africa/Accra (see `functions/src/bookingEmailAutomation.ts`). Merchant-owned Google Sheets will stop getting *new* booking updates until safe sync is configured.
- **Existing Google-owned time triggers do not stop by themselves.** They may still send reminders from old spreadsheet rows (possibly with a stale BCC), so the owners must disable or correct those old triggers. Until that is done, old bookings may receive duplicate reminders. For the two known friend stores, arrange this cleanup after the central sender is tested.
- Do not enable the old booking sync flags for an unmodified script. Copying the correct URL alone is not a guarantee that the script is sheet-only.

## Operational notes

- Apps Script/Gmail has daily email limits. Monitor `MailApp.getRemainingDailyQuota()` and the logged failure code `daily-email-quota-exhausted`.
- A private Sheet is an auditable ledger, not a high-volume transactional ESP. If Sedifex grows, migrate this sender to a dedicated mail provider while keeping identical store-isolation checks.
- Google Apps Script cannot guarantee exactly-once email if Gmail accepts a send but the process crashes before the sheet ledger is updated. Avoid blindly replaying uncertain deliveries.
- Other integrations outside `deliverTransactionalEmail` (e.g. some specialized contracts or direct SMS) must be audited separately before claiming *all* messages on the platform use this route.

Tests: `functions/test/bookingNotificationIsolation.test.js` exercises verified store addresses, central routing, Apps Script secret rejection, no BCC, and duplicate suppression.
