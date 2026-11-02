# Store-isolated Sedifex booking email

## Why

Two unrelated businesses must never share booking email recipients. The previous Sedifex Booking Editor contained a single hard-coded Google Apps Script URL, and booking notification settings could include arbitrary stale `adminEmails` addresses. In the current Google Apps Script template, `notificationBccEmail || supportEmail` can also cause unwanted copies.

## Changes in this PR

1. **Immediate transactional email**: Sedifex's existing `deliverTransactionalEmail` uses the centrally configured `SEDIFEX_NOTIFICATION_WEBHOOK_URL` first when a store selects **Automatic** or **Sedifex Email**. An absent or failed central sender does not silently send the same confidential booking email through the store's old Apps Script; it remains in `notification_outbox` as unsent/failed.
2. **Verified per-store copy**: The existing separate store alert remains the preferred replacement for BCC. For booking events it is sent only to email-verified Firebase Auth users: always the owner of the booking's store, plus explicitly listed staff with membership in that same store. Stale cross-store addresses from `storeSettings.notifications.adminEmails` are ignored. A store lacking a verified owner email gets no store copy (customer email still uses the central provider).
3. **Reply-To**: Booking emails routed through Sedifex central sender only include a reply-to address belonging to a verified store owner.
4. **Manual booking updates**: Booking Editor no longer posts booking information directly to one globally hardcoded Apps Script URL. The existing backend Firestore sync trigger uses the owning store's configured booking script URL.

## Scheduled reminders remain untouched

The historical Google Apps Script's `processScheduledMessages` trigger can continue as currently installed. This PR does NOT require access to merchant Google accounts, does NOT delete spreadsheet sync, and does NOT disable their scheduled Google triggers.

**Critical caveat: running scripts are external software.** An existing deployment may still send its own immediate confirmation and BCC on a sync event, and its scheduled reminder might still BCC a wrong address. The fixed Sedifex code cannot cancel an Apps Script email after that script executes. The attached source template should eventually be updated or each merchant's script BCC settings corrected. Leaving the legacy schedule active is a temporary compatibility decision, not proof that all outgoing messages are isolated.

## Production checklist (do not skip)

- Verify the central notification webhook points to a dedicated Sedifex transactional provider, NOT a shared merchant Apps Script. Verify `SEDIFEX_NOTIFICATION_SHARED_SECRET` and that the webhook respects the supplied `to`, `recipientType`, `storeId`, `senderName` and optional `replyToEmail`. A 200 response is provider acceptance, not final inbox delivery.
- Test a booking for each tenant with distinct verified owner accounts and recipients. Confirm the other business gets no copy, including through the **existing live Apps Script** and scheduled trigger. Verify that customers receive one confirmation and the store receives its distinct alert.
- Confirm store settings use **Automatic** or **Sedifex Email**; explicitly selected **Business Gmail** / **Custom webhook** still preserve the merchant's chosen delivery route.
- Check `notification_outbox` for `queued_no_live_sender` or `delivery_failed` after the cutover, and verify Firebase Functions deployed. Avoid sending actual customer data in test messages.
- Fix existing deployed Apps Script BCC settings or stop the script's *outgoing mail* before declaring the cross-store leak resolved. Scheduled reminders can be migrated to Sedifex's own reminder job without losing scheduling if merchant script changes aren't possible.

Unit tests: `functions/test/bookingNotificationIsolation.test.js`.
