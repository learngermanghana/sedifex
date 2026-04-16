# Sedifex Booking Webhooks: Business Use Cases

This guide explains how **booking webhooks** help different organizations automate approvals/cancellations and customer communication.

## What this feature does

When a booking changes in Sedifex (for example approved, confirmed, cancelled), Sedifex can send a signed `POST` request to your webhook endpoint.

Typical flow:

1. Customer submits booking/registration.
2. Staff updates booking status in Sedifex.
3. Sedifex sends webhook event (`booking.created`, `booking.updated`, `booking.confirmed`, `booking.approved`, `booking.cancelled`).
4. Your endpoint (Google Apps Script / backend) updates your Sheet or CRM.
5. Your email/SMS automation sends the right message from your organization account.

## Who benefits and how

## 1) Travel agencies

### Common workflow
- Travelers book packages, visa support, flights, tours, or transport slots.
- Staff reviews availability/payment and approves or cancels.

### Benefits
- **Fast confirmations:** Send approved-itinerary email immediately after approval.
- **Fewer no-shows:** Trigger reminders 3 days / 1 day / same-day.
- **Operational alignment:** Push updates to operations sheets (drivers, guides, visa officers).
- **Trust & support:** Send cancellation/reschedule notices quickly with next steps.

### Example automations
- `booking.approved` -> send "trip confirmed" email + invoice link.
- `booking.cancelled` -> send cancellation note + rebooking options.
- `booking.updated` -> notify assigned travel consultant internally.

## 2) Schools / training centers (registration)

### Common workflow
- Parents/students register for classes, admissions interviews, training cohorts, or orientation slots.
- Admin team approves, reschedules, or cancels registrations.

### Benefits
- **Admissions speed:** Immediate acknowledgement and approval messaging.
- **Better attendance:** Automated reminders for interviews, orientation, and fee deadlines.
- **Cleaner records:** Sync status directly into admissions sheets without manual copy/paste.
- **Reduced admin workload:** No repetitive status follow-up messages by staff.

### Example automations
- `booking.created` -> send "application received" message.
- `booking.approved` -> send admission checklist + required documents.
- `booking.confirmed` -> send class start details.
- `booking.cancelled` -> send slot-release notification + reapply link.

## 3) Events and conference organizers

### Common workflow
- Attendees register for events, sessions, tables, ticket categories, or workshops.
- Event admins approve/confirm attendees and handle cancellations.

### Benefits
- **Real-time attendee communication:** Confirmation and update emails go out immediately.
- **Smoother event ops:** Sync attendee lists to check-in systems/sheets.
- **Higher turnout:** Timed reminders before event day.
- **Post-event growth:** Follow-up thank-you and feedback/review requests.

### Example automations
- `booking.confirmed` -> send e-ticket/QR + venue info.
- `booking.updated` -> send session/time change notice.
- `booking.cancelled` -> release seat and notify waiting list.

## Security and reliability notes

- Configure a unique webhook secret in **Account -> Integrations**.
- Verify the `x-sedifex-signature` header in your receiver.
- Use booking IDs as unique keys when updating Google Sheets/CRM rows.
- Make webhook handlers idempotent (ignore duplicate deliveries safely).
- Log delivery status for auditability.

## Recommended implementation pattern (Google Sheets + Apps Script)

1. Create webhook endpoint (`doPost`) in Apps Script.
2. Validate secret/signature.
3. Upsert row by `Booking ID`.
4. Update `Status`, `Date`, `Time`, `Email`, `Name`, `Branch`, `Source Updated At`.
5. Let your existing reminder/thank-you/review logic run from the sheet.

## Suggested status policy

- `pending`: hold reminders until approved.
- `approved` / `confirmed`: allow confirmations + reminders.
- `cancelled`: stop reminder flow; optionally send cancellation template.
- `completed`: allow post-visit/post-event thank-you flow.

## ROI summary

For travel agencies, schools, and event operators, webhook-driven booking sync delivers:

- Faster customer communication
- Lower manual admin effort
- Better attendance/show-up rate
- Cleaner, auditable operations data
- Improved customer experience and retention

