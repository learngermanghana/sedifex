# ChatGPT business tools

All business tools require a connected Sedifex store owner. Customer booking scopes still expose only the customer's ChatGPT-created appointments. Merchant booking scopes separately expose existing store appointments and saved customer contact information.

| Feature | Implemented behavior |
| --- | --- |
| Record daily sales | `record_sale` records an already completed offline sale, one product/service per call, using server catalog prices. It atomically decrements product stock, writes the standard POS sale/ledger records, and deduplicates retries. This is merchant-reported payment, not provider verification. Taxes, discounts, backdated sales and multi-line baskets remain in POS. |
| Summarize sales | `summarize_sales` returns date-filtered recorded sale counts and totals by currency. Follow all cursors and sum page totals. End time is exclusive. Does not mix currencies or claim provider-verified collections/profit. |
| Inventory | `list_inventory` reads paginated product stock and prices; missing stock stays unknown. Use existing `list_services` for services. |
| Update product price | `update_product_price` changes one owned-store product's catalog price only after showing the current and proposed prices and obtaining approval. It checks the previous price and currency atomically, rejects services and cross-store product IDs, and deduplicates retries. This changes future catalog prices, not an already completed sale; it does not record payment or a sale. |
| Existing bookings | `list_store_bookings`, `get_store_booking`, `manage_store_booking` cover store/root integrationBookings and service integrationOrders. Query all four sources and deduplicate mirrors using bookingId/reference. Confirm, complete, cancel and reschedule with revision checks and explicit approval. Rescheduling requires a compatible availability slot; complex legacy or differently priced reservations require dashboard review. |
| Reminders | `send_booking_reminder` queues a standard email to the saved confirmed-booking recipient after approval. Recipient/schedule/ownership are checked again by the worker. Requests have a per-booking 15-minute cooldown and retry deduplication. `get_reminder_status` distinguishes queued/processed/failed. Processed means notification processing, not inbox delivery. Sender delivery state is in the existing notification outbox. SMS is not added by this change. |
| Payments | `get_booking_payment_options` returns an existing trusted Paystack/Sedifex hosted checkout link. The customer pays outside ChatGPT. If no existing link is saved, create one in Sedifex. This change does not initialize a new charge. |
| Refunds | `prepare_booking_refund` prepares original-reference/amount/reason details for manual provider review. It returns requires_manual_action and refundIssued=false. It does not issue refunds or mark balances refunded. A provider refund API integration remains separate work. |

## Deploy and reconnect

1. Deploy the web/API changes and the new Firebase `deliverChatgptBookingReminder` function, together with the notification reminder copy. This uses the existing notification sender configuration. Do not claim email delivery until the outbox/provider reports it.
2. Add these scopes to the OpenAI MCP baseScopes in addition to existing scopes: `inventory:read`, `inventory:write`, `sales:read`, `sales:write`, `merchant-bookings:read`, `merchant-bookings:write`, `reminders:write`, `payments:read`.
3. Reconnect accounts so the new permissions are displayed and approved; specifically approve `inventory:write` for `update_product_price`. Old access tokens cannot use tools whose scopes they do not contain. Rescan tools in OpenAI.
4. Test with an owner and a separate customer. Verify foreign-store denial, duplicate retries, stale prices/revisions, stock and slot capacity, a legacy appointment, and one email to a consenting saved test recipient. Do not run live charges or refunds as part of this rollout.

The new `chatgpt_reminders` and `chatgpt_reminder_limits` collections are server-only under the existing `chatgpt_.*` Firestore exclusion. No new Vercel function is added. The reminder worker is a Firebase function and must be deployed independently.

## Validation

- Web: `npm run test:chatgpt` and `npm run typecheck:chatgpt` in web.
- Reminder worker: `node test/chatgptBookingReminder.test.js` in functions.
- Full functions type checking currently encounters a pre-existing Google Sheets / Google Auth type mismatch in googleSheets.ts; deploy only after normal repository CI/build is green.

## Price-change tool verification

Before calling `update_product_price`, use `list_inventory` to read the exact product and its current price/currency, then show the proposed new price and obtain explicit approval. Use a stable requestId and do not call `record_sale` unless the user separately requests and approves a sale. A successful price change affects future purchases and does not bypass stock checks in `record_sale`; unknown stock remains a blocker for recording sales on non-service products.
