# Booking reminders and business setup

Confirmed or rescheduled bookings receive the existing configured email reminders three, two and one calendar days before the appointment. The schedule runs at 08:00 Africa/Accra. Owners can disable email or individual reminder rules through Automations. These are calendar-day reminders, not exact hourly countdowns.

Reminder emails include a private customer portal link when the booking matches a saved customer in the same business with the same email address. Active links are reused; expired links can be renewed for 30 days. Explicitly revoked links stay revoked. Ambiguous or unmatched customers still receive the reminder without a portal link. Businesses can share a portal from the customer record instead. Same-day rescheduling creates a separate reminder identity for the new time; normal repeated scheduler runs retain outbox deduplication.

Customers open the portal, then explicitly confirm attendance or request a new time. Opening the link never changes the booking. Attendance is independent of payment and business approval. Only already confirmed/rescheduled bookings without pending customer requests accept attendance confirmation. Confirmation is idempotent and checks the current appointment, customer ownership and link validity inside its transaction. Changing the saved date or time invalidates the old attendance marker. The Bookings list shows current attendance confirmations on desktop and mobile.

Owners see a setup checklist on Dashboard and Account. Completion comes from saved business name/contact details, a product/service, Paystack payout routing, and an enabled public page. Optional catalog, payout and public page steps may be skipped, but skips do not count as completed. Refresh progress after making changes. Staff cannot read or change owner setup via these callables.

## Release

Deploy the web app together with `getBusinessSetupChecklist`, `setBusinessSetupStepSkipped`, `confirmCustomerPortalBookingAttendance`, the updated customer portal handlers, and `processBookingEmailReminders`. The Firebase deployment workflow exports the reminder function, removes it from the old pause/delete lists, and resumes only its Cloud Scheduler job after function deployment. No unrelated scheduler is restored. Existing email delivery credentials and automation settings remain required. Monitor reminder delivery logs after release; this change has not sent live customer emails during development.

Run `npm run build --prefix functions`, `npm run test:booking-reminders-setup --prefix functions`, and the web checklist tests before release.
