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

## New: Universal booking automation template for every store (simplified)

To keep implementation focused, use the template only for:

- booking sync to Google Sheet via `bookingId` upsert
- confirmation email sending
- reminder emails at 3 days, 2 days, and 1 day before appointment

### Required flow

1. Sedifex (or your middleware) sends booking webhook payload to Apps Script `doPost`.
2. Apps Script upserts by `booking_id` (create/update same row).
3. Time-driven trigger runs reminder processor every 15 to 30 minutes.
4. Script checks send-state columns so each email stage is sent once.

### Required sheet schema

Use this exact column set so all stores follow one contract:

- `booking_id`
- `store_id`
- `service_id`
- `service_name`
- `slot_id`
- `customer_name`
- `customer_phone`
- `customer_email`
- `quantity`
- `notes`
- `booking_date`
- `booking_time`
- `appointment_iso`
- `payment_method`
- `payment_amount`
- `branch_location_id`
- `branch_location_name`
- `event_location`
- `customer_stay_location`
- `attributes_json`
- `source`
- `updated_at`
- `created_at`
- `status`
- `last_event_type`
- `cancelled_at`
- `confirmation_sent_at`
- `reminder_3d_sent_at`
- `reminder_2d_sent_at`
- `reminder_1d_sent_at`
- `thank_you_sent_at`
- `last_error`
- `next_action_at`
- `last_notified_appointment_iso`
- `notification_version`

### Minimum payload fields

At minimum for confirmation/reminder workflows:

- `bookingId`
- `bookingDate` (prefer `YYYY-MM-DD`)
- `bookingTime` (e.g. `14:30` or `2:30pm`)
- `customerEmail`
- `customerName`

Recommended:

- `serviceName`, `storeId`, `status`, `eventType`

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
