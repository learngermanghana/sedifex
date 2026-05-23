# Booking Apps Script Template (Sedifex + Google Sheets)

Use this template when a store wants Sedifex booking actions to update a Google Sheet and send follow-up emails/reminders.

## Unified booking workflow

Sedifex now treats bookings from these sources as one booking system:

- **Sedifex Market** bookings
- **Client website** bookings
- **Sedifex public/custom page** bookings
- **Manual/admin** bookings created inside Sedifex

All of them should appear in **Sedifex → Bookings** and **Reports → Bookings**. The store can open the booking from either page and take the same actions.

Recommended flow:

```text
Booking comes in from Market / website / public page / manual admin
↓
Customer and store receive the first booking-received notification from Sedifex Market or the connected website flow
↓
Booking appears in Sedifex admin
↓
Store opens the booking
↓
Store clicks Confirm booking, Cancel booking, or Complete booking
↓
Sedifex updates the booking and queues sync if App Script sync is configured
↓
The store's Apps Script updates the Sheet and sends follow-up emails/reminders
```

## Notification ownership

To avoid duplicate emails, each part of the system has a clear job.

| Stage | Owner | Notes |
| --- | --- | --- |
| Booking received | Sedifex Market / connected website | First notification to customer and store when the booking is submitted. |
| Confirm booking | Store admin in Sedifex + store Apps Script | Means the client has paid and the store accepts the booking. Sends confirmation and starts reminder flow. |
| Cancel booking | Store admin in Sedifex + store Apps Script | Sends cancellation/update to customer and updates the Sheet. |
| Complete booking | Store admin in Sedifex + store Apps Script | Marks the appointment/class/service done and can send completion/thank-you follow-up. |
| Reminders | Store Apps Script | Sends 3-day, 2-day, and 1-day reminders after confirmation/payment. |

By default, this template does **not** send the first booking-received email. That first email should already come from Sedifex Market or the connected website flow. This avoids duplicate customer emails.

Set this to `true` only if a store wants the Google Sheet script to send the first booking-received email too:

```javascript
sendInitialBookingReceivedEmail: false
```

## Sedifex admin action meanings

| Button in Sedifex | Business meaning | Payment meaning | Sync behavior |
| --- | --- | --- | --- |
| Confirm booking | Store accepts the booking/date/time | Client has paid | Queue App Script sync when configured |
| Cancel booking | Store rejects/cancels booking | No payment action required | Queue cancellation sync when configured |
| Complete booking | Service/class/appointment is done | Payment should already be confirmed | Queue completion sync when configured |
| Save changes | Save edited booking details only | Does not change payment automatically | Does not replace Confirm/Cancel/Complete |

## Status mapping

The Apps Script treats these payment statuses as confirmed payment:

```text
paid
confirmed
success
succeeded
complete
completed
```

This matters because Sedifex may store payment internally as `paid`, while older scripts expected `confirmed`. This template maps both to the same confirmed reminder flow.

Booking statuses supported:

```text
booked
pending
pending_approval
confirmed
cancelled
completed
rescheduled
```

## Booking Reports in Sedifex

The improved **Reports → Bookings** page is now a source and sync report, not only a booking table.

It shows:

- Source: Sedifex Market, Client website, Sedifex public page, or Manual/admin
- Whether the record came from the root booking collection or the store subcollection
- Booking status
- Payment status
- Sync status
- Sync reason
- Reminder status
- Booking value
- Confirmed/cancelled/completed tracking
- Date filters
- Source filters
- Sync filters
- Open booking action

Important Firestore fields used by the report:

```text
source / sourceChannel / source_channel
bookingStatus / status
paymentStatus / payment_status / payment.status
syncStatus / sync_status
syncReason / sync_reason
confirmedAt
cancelledAt
completedAt
reminder_3d_sent_at
reminder_2d_sent_at
reminder_1d_sent_at
thank_you_sent_at
```

`syncStatus` and `syncReason` are mainly Sedifex-side tracking fields. The Sheet script receives the booking payload, updates the Sheet, and sends emails/reminders. If a future sync worker marks records as `synced`, the Bookings Report will show that as well.

## Expected sync payload from Sedifex admin

When the store clicks **Confirm booking**, Sedifex should send or queue data like this:

```json
{
  "bookingId": "booking_123",
  "storeId": "store_123",
  "customer": {
    "name": "Jane Doe",
    "phone": "0200000000",
    "email": "jane@example.com"
  },
  "booking": {
    "serviceName": "Airport Pickup",
    "preferredDate": "2026-05-11",
    "preferredTime": "14:00"
  },
  "payment": {
    "amount": 200,
    "method": "mobile_money",
    "reference": "MOMO123",
    "status": "paid",
    "confirmed": true
  },
  "bookingStatus": "confirmed",
  "status": "confirmed",
  "paymentStatus": "paid",
  "paymentConfirmed": true,
  "paymentConfirmedAt": "2026-05-11T10:00:00.000Z",
  "source": "website_booking_form",
  "sourceChannel": "client_website",
  "syncReason": "booking_confirmed",
  "eventType": "booking_confirmed"
}
```

## Existing stores should update

Stores that already installed an older version should update their Apps Script with this template if they want Sedifex admin actions such as **Confirm booking**, **Cancel booking**, and **Complete booking** to sync correctly.

## Sheet setup

1. Create a sheet tab named `Bookings`.
2. Leave the tab empty.
3. Paste the script below into Extensions → Apps Script.
4. Deploy as Web App.
5. Save the Web App URL in the store's Sedifex booking sync settings.
6. Run **Sedifex Automation → Install 5-minute trigger** from the Sheet menu.

## Apps Script code

```javascript
const CONFIG = {
  sheetName: 'Bookings',
  timezone: Session.getScriptTimeZone() || 'UTC',
  requireSecret: false,
  secretProperty: 'BOOKING_WEBHOOK_SECRET',
  fromName: 'Booking Team',

  // Keep false when Sedifex Market/website already sends the first booking notification.
  // Set true only for stores that want this Sheet script to send the first booking-received email too.
  sendInitialBookingReceivedEmail: false,
};

const BRANDING = {
  businessName: '',
  supportPhone: '',
  supportWhatsApp: '',
  supportEmail: '',
  websiteUrl: '',
  instagramUrl: '',
  facebookUrl: '',
  tiktokUrl: '',
  xUrl: '',
  logoUrl: '',
  addressLine: '',
  bookingTermsUrl: '',
  notificationBccEmail: '', // optional store/staff email to receive BCC copies of all outgoing emails
  poweredByText: 'Powered by Sedifex',
};


const COLS = [
  'booking_id',
  'store_id',
  'service_id',
  'service_name',
  'customer_name',
  'customer_phone',
  'customer_email',
  'quantity',
  'notes',
  'booking_date',
  'booking_time',
  'appointment_iso',
  'payment_method',
  'payment_amount',
  'deposit_amount',
  'amount_outstanding',
  'payment_status',
  'payment_reference',
  'payment_confirmed_at',
  'payment_verified_at',
  'status',
  'booking_status',
  'source',
  'last_event_type',
  'cancelled_at',
  'completed_at',
  'updated_at',
  'created_at',
  'booking_received_sent_at',
  'payment_pending_sent_at',
  'awaiting_verification_sent_at',
  'partial_payment_sent_at',
  'payment_confirmation_sent_at',
  'confirmation_sent_at',
  'cancellation_sent_at',
  'completion_sent_at',
  'reminder_3d_sent_at',
  'reminder_2d_sent_at',
  'reminder_1d_sent_at',
  'thank_you_sent_at',
  'last_notified_appointment_iso',
  'notification_version',
  'last_error',
];

function doPost(e) {
  try {
    if (CONFIG.requireSecret) {
      const expected = PropertiesService.getScriptProperties().getProperty(CONFIG.secretProperty) || '';
      const got = getWebhookSecret_(e);
      if (!expected || got !== expected) return json_(401, { ok: false, error: 'unauthorized' });
    }

    const body = parseJsonBody_(e);
    if (!body) return json_(400, { ok: false, error: 'invalid-json-body' });

    const p = normalizePayload_(body);
    if (!p.booking_date || !p.booking_time) return json_(400, { ok: false, error: 'missing-date-time' });
    if (!p.customer_name) return json_(400, { ok: false, error: 'missing-customer-name' });
    if (!p.customer_email && !p.customer_phone) return json_(400, { ok: false, error: 'missing-contact-method' });

    const sheet = getOrCreateSheet_(CONFIG.sheetName);
    ensureHeaders_(sheet);

    p.appointment_iso = combineDateTimeInTz_(p.booking_date, p.booking_time, CONFIG.timezone) || '';

    const row = p.booking_id ? findRowByBookingId_(sheet, p.booking_id) : 0;
    const nowIso = new Date().toISOString();
    const status = canonicalBookingStatus_(p);

    if (status === 'cancelled' && !p.cancelled_at) p.cancelled_at = nowIso;
    if (status === 'completed' && !p.completed_at) p.completed_at = nowIso;

    if (row) {
      const old = rowObjectFromSheet_(sheet, row);
      hydrateFromOldRow_(p, old, nowIso);

      const oldStatus = canonicalBookingStatus_(old);
      const newStatus = canonicalBookingStatus_(p);
      const apptChanged = (old.appointment_iso || '') !== (p.appointment_iso || '');
      const detailsChanged = bookingDetailsChanged_(old, p);

      if (apptChanged) {
        p.reminder_3d_sent_at = '';
        p.reminder_2d_sent_at = '';
        p.reminder_1d_sent_at = '';
        p.last_notified_appointment_iso = '';
        p.notification_version = Number(old.notification_version || 1) + 1;
      }

      p.updated_at = nowIso;
      writeRow_(sheet, row, p);

      handleStateEmails_(sheet, row, p, old);

      if (oldStatus !== 'cancelled' && newStatus === 'cancelled') {
        sendOnce_(sheet, row, p, 'cancellation', 'cancellation_sent_at');
      } else if (oldStatus !== 'completed' && newStatus === 'completed') {
        sendOnce_(sheet, row, p, 'completion', 'completion_sent_at');
      } else if (apptChanged) {
        sendImmediateEmail_(sheet, row, p, 'reschedule');
      } else if (detailsChanged) {
        sendImmediateEmail_(sheet, row, p, 'update');
      }

      return json_(200, { ok: true, action: 'updated', row: row, bookingId: p.booking_id });
    }

    p.updated_at = nowIso;
    p.created_at = nowIso;
    p.notification_version = 1;
    writeRow_(sheet, sheet.getLastRow() + 1, p);

    const createdRow = sheet.getLastRow();
    handleStateEmails_(sheet, createdRow, p, null);

    return json_(201, { ok: true, action: 'created', row: createdRow, bookingId: p.booking_id || '' });
  } catch (err) {
    return json_(500, { ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function processScheduledMessages() {
  const sheet = getOrCreateSheet_(CONFIG.sheetName);
  ensureHeaders_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const values = sheet.getRange(2, 1, lastRow - 1, COLS.length).getValues();
  values.forEach(function (r, idx) {
    const row = objFromRow_(r);
    const rowNum = idx + 2;
    const bookingStatus = canonicalBookingStatus_(row);

    if (bookingStatus === 'cancelled') return;
    if (bookingStatus !== 'confirmed' && bookingStatus !== 'completed') return;
    if (canonicalPaymentStatus_(row) !== 'confirmed') return;
    if (!row.customer_email || !row.customer_name || !row.appointment_iso) return;

    const appt = new Date(row.appointment_iso);
    if (isNaN(appt)) return;

    if (!row.payment_confirmation_sent_at) sendStageIfDue_(sheet, rowNum, row, appt, 'payment_confirmed');
    if (!row.reminder_3d_sent_at) sendStageIfDue_(sheet, rowNum, row, appt, 'reminder_3d');
    if (!row.reminder_2d_sent_at) sendStageIfDue_(sheet, rowNum, row, appt, 'reminder_2d');
    if (!row.reminder_1d_sent_at) sendStageIfDue_(sheet, rowNum, row, appt, 'reminder_1d');
    if (!row.thank_you_sent_at) sendStageIfDue_(sheet, rowNum, row, appt, 'thank_you_1d_after');
  });
}

function normalizePayload_(body) {
  const attrs = asRecord_(body.attributes);
  const customer = asRecord_(body.customer);
  const booking = asRecord_(body.booking);
  const payment = asRecord_(body.payment);

  const paymentConfirmed = body.paymentConfirmed === true || body.payment_confirmed === true || payment.confirmed === true;

  const normalizedPaymentStatus = paymentConfirmed
    ? 'confirmed'
    : normalizeIncomingPaymentStatus_(first_(body.paymentStatus, body.payment_status, payment.status));

  const normalizedBookingStatus = normalizeIncomingBookingStatus_(
    first_(body.bookingStatus, body.booking_status, body.status, booking.status, 'booked')
  );

  return {
    booking_id: str_(first_(body.bookingId, body.booking_id, body.id)),
    store_id: str_(first_(body.storeId, body.store_id)),
    service_id: str_(first_(body.serviceId, body.service_id, booking.serviceId, booking.service_id)),
    service_name: str_(first_(body.serviceName, body.service_name, booking.serviceName, booking.service_name, body.itemName, body.productName)),
    customer_name: str_(first_(body.customerName, body.customer_name, body.fullName, body.full_name, body.name, customer.name)),
    customer_phone: str_(first_(body.customerPhone, body.customer_phone, body.phone, body.phoneNumber, body.phone_number, customer.phone)),
    customer_email: str_(first_(body.customerEmail, body.customer_email, body.email, customer.email)),
    quantity: numOrDefault_(first_(body.quantity, booking.quantity), 1),
    notes: str_(first_(body.notes, body.message, body.details, booking.notes)),
    booking_date: str_(first_(body.bookingDate, body.booking_date, body.preferredDate, body.preferred_date, body.date, booking.preferredDate, booking.preferred_date, booking.date)),
    booking_time: str_(first_(body.bookingTime, body.booking_time, body.preferredTime, body.preferred_time, body.time, booking.preferredTime, booking.preferred_time, booking.time)),
    appointment_iso: '',
    payment_method: str_(first_(body.paymentMethod, body.payment_method, payment.method)),
    payment_amount: numOrBlank_(first_(body.paymentAmount, body.payment_amount, body.amount, body.total, payment.amount)),
    deposit_amount: numOrBlank_(first_(body.depositAmount, body.deposit_amount, payment.depositAmount, payment.deposit_amount)),
    amount_outstanding: numOrBlank_(first_(body.amountOutstanding, body.amount_outstanding, payment.amountOutstanding, payment.amount_outstanding)),
    payment_status: normalizedPaymentStatus,
    payment_reference: str_(first_(body.paymentReference, body.payment_reference, body.reference, payment.reference)),
    payment_confirmed_at: str_(first_(body.paymentConfirmedAt, body.payment_confirmed_at, payment.confirmedAt, payment.confirmed_at, paymentConfirmed ? new Date().toISOString() : '')),
    payment_verified_at: str_(first_(body.paymentVerifiedAt, body.payment_verified_at, payment.verifiedAt, payment.verified_at)),
    status: normalizedBookingStatus,
    booking_status: normalizedBookingStatus,
    source: str_(first_(body.source, body.sourceChannel, body.source_channel, attrs.source, 'sedifex_booking')),
    last_event_type: str_(first_(body.eventType, body.event_type, body.syncReason, body.sync_reason, 'created')),
    cancelled_at: normalizedBookingStatus === 'cancelled' ? new Date().toISOString() : '',
    completed_at: normalizedBookingStatus === 'completed' ? new Date().toISOString() : '',
    updated_at: '',
    created_at: '',
    booking_received_sent_at: '',
    payment_pending_sent_at: '',
    awaiting_verification_sent_at: '',
    partial_payment_sent_at: '',
    payment_confirmation_sent_at: '',
    confirmation_sent_at: '',
    cancellation_sent_at: '',
    completion_sent_at: '',
    reminder_3d_sent_at: '',
    reminder_2d_sent_at: '',
    reminder_1d_sent_at: '',
    thank_you_sent_at: '',
    last_notified_appointment_iso: '',
    notification_version: 1,
    last_error: '',
  };
}

function handleStateEmails_(sheet, rowNum, row, oldRow) {
  const bookingStatus = canonicalBookingStatus_(row);
  const paymentStatus = canonicalPaymentStatus_(row);

  if (bookingStatus === 'cancelled') return;

  if (paymentStatus === 'pending') {
    if (CONFIG.sendInitialBookingReceivedEmail) {
      sendOnce_(sheet, rowNum, row, 'booking_received_pending', 'booking_received_sent_at', 'payment_pending_sent_at');
    }
    return;
  }

  if (paymentStatus === 'awaiting_verification') {
    if (CONFIG.sendInitialBookingReceivedEmail) {
      sendOnce_(sheet, rowNum, row, 'booking_received_awaiting_verification', 'awaiting_verification_sent_at');
    }
    return;
  }

  if (paymentStatus === 'partial') {
    if (CONFIG.sendInitialBookingReceivedEmail) {
      sendOnce_(sheet, rowNum, row, 'partial_payment_received', 'partial_payment_sent_at');
    }
    return;
  }

  if (paymentStatus === 'confirmed' && bookingStatus === 'confirmed') {
    sendOnce_(sheet, rowNum, row, 'payment_confirmed', 'payment_confirmation_sent_at', 'confirmation_sent_at');
  }
}

function normalizeIncomingPaymentStatus_(value) {
  const s = str_(value).toLowerCase();
  if (!s) return 'pending';
  if (['paid', 'confirmed', 'success', 'succeeded', 'complete', 'completed'].indexOf(s) >= 0) return 'confirmed';
  if (['pending', 'payment_pending', 'unpaid', 'checkout_created'].indexOf(s) >= 0) return 'pending';
  if (['awaiting_verification', 'manual_review', 'under_review'].indexOf(s) >= 0) return 'awaiting_verification';
  if (['partial', 'part_paid', 'partially_paid'].indexOf(s) >= 0) return 'partial';
  if (['refunded', 'failed', 'cancelled', 'canceled'].indexOf(s) >= 0) return s === 'canceled' ? 'cancelled' : s;
  return s;
}

function normalizeIncomingBookingStatus_(value) {
  const s = str_(value).toLowerCase();
  if (!s) return 'booked';
  if (s === 'canceled') return 'cancelled';
  if (s === 'active') return 'booked';
  if (['confirmed', 'cancelled', 'completed', 'rescheduled', 'pending', 'pending_approval', 'booked'].indexOf(s) >= 0) return s;
  return s;
}

function canonicalPaymentStatus_(row) {
  const s = normalizeIncomingPaymentStatus_(row.payment_status || '');
  if (s && s !== 'pending') return s;
  if (str_(row.payment_confirmed_at)) return 'confirmed';

  const paid = Number(row.payment_amount || 0);
  const outstanding = Number(row.amount_outstanding || 0);
  if (!isNaN(paid) && paid > 0 && !isNaN(outstanding) && outstanding > 0) return 'partial';

  return s || 'pending';
}

function canonicalBookingStatus_(row) {
  return normalizeIncomingBookingStatus_(row.booking_status || row.status || 'booked');
}

function sendStageIfDue_(sheet, rowNum, row, appt, stage) {
  const due = dueDate_(appt, stage);
  if (new Date().getTime() < due.getTime()) return;

  const stageToCol = {
    payment_confirmed: 'payment_confirmation_sent_at',
    reminder_3d: 'reminder_3d_sent_at',
    reminder_2d: 'reminder_2d_sent_at',
    reminder_1d: 'reminder_1d_sent_at',
    thank_you_1d_after: 'thank_you_sent_at',
  };

  sendOnce_(sheet, rowNum, row, stage, stageToCol[stage]);
  sheet.getRange(rowNum, COLS.indexOf('last_notified_appointment_iso') + 1).setValue(row.appointment_iso);
}

function dueDate_(appt, stage) {
  if (stage === 'payment_confirmed') return new Date();

  const d = new Date(appt.getTime());
  if (stage === 'reminder_3d') d.setDate(d.getDate() - 3);
  if (stage === 'reminder_2d') d.setDate(d.getDate() - 2);
  if (stage === 'reminder_1d') d.setDate(d.getDate() - 1);
  if (stage === 'thank_you_1d_after') d.setDate(d.getDate() + 1);
  return d;
}

function sendOnce_(sheet, rowNum, row, stage) {
  const stampCols = Array.prototype.slice.call(arguments, 4).filter(Boolean);
  if (stampCols.length && row[stampCols[0]]) return;

  sendImmediateEmail_(sheet, rowNum, row, stage);

  if (stampCols.length) stamp_(sheet, rowNum, stampCols);
}

function sendImmediateEmail_(sheet, rowNum, row, stage) {
  if (!row.customer_email || !row.customer_name) return;

  const msg = messageForStage_(row, stage);
  const branding = getBranding_();

  const mailOptions = {
    htmlBody: msg.html,
    name: branding.businessName || CONFIG.fromName,
  };

  const bcc = str_(branding.notificationBccEmail || branding.supportEmail || '');
  if (bcc) mailOptions.bcc = bcc;

  if (branding.supportEmail) {
    mailOptions.replyTo = branding.supportEmail;
  }

  GmailApp.sendEmail(row.customer_email, msg.subject, msg.text, mailOptions);

  sheet.getRange(rowNum, COLS.indexOf('updated_at') + 1).setValue(new Date().toISOString());
}

function subjectForStage_(stage) {
  const map = {
    booking_received_pending: 'Booking received — payment pending',
    booking_received_awaiting_verification: 'Booking received — payment under review',
    partial_payment_received: 'Partial payment received',
    payment_confirmed: 'Your booking is confirmed',
    cancellation: 'Your booking has been cancelled',
    completion: 'Your booking has been completed',
    reschedule: 'Your booking has been rescheduled',
    update: 'Your booking details have been updated',
    reminder_3d: 'Reminder: your booking is in 3 days',
    reminder_2d: 'Reminder: your booking is in 2 days',
    reminder_1d: 'Reminder: your booking is tomorrow',
    thank_you_1d_after: 'Thank you for visiting us',
  };

  return map[stage] || 'Booking update';
}

function messageForStage_(row, stage) {
  return {
    subject: subjectForStage_(stage),
    text: textForStage_(row, stage),
    html: htmlForStage_(row, stage),
  };
}

function textForStage_(row, stage) {
  const copy = emailCopyForStage_(row, stage);
  const branding = getBranding_();
  const lines = [];

  lines.push('Hi ' + (row.customer_name || 'there') + ',');
  lines.push('');
  lines.push(copy.body);
  lines.push('');
  lines.push('Booking details');
  lines.push(renderAppointmentSummaryText_(row));

  const payment = renderPaymentSummaryText_(row);
  if (payment) {
    lines.push('');
    lines.push('Payment details');
    lines.push(payment);
  }

  if (branding.supportPhone || branding.supportWhatsApp || branding.supportEmail) {
    lines.push('');
    lines.push('Need help?');
    if (branding.supportPhone) lines.push('Phone: ' + branding.supportPhone);
    if (branding.supportWhatsApp) lines.push('WhatsApp: ' + branding.supportWhatsApp);
    if (branding.supportEmail) lines.push('Email: ' + branding.supportEmail);
  }

  lines.push('');
  lines.push(branding.poweredByText || 'Powered by Sedifex');

  return lines.join('\n');
}

function htmlForStage_(row, stage) {
  const branding = getBranding_();
  const copy = emailCopyForStage_(row, stage);
  const subject = subjectForStage_(stage);

  const businessName = escapeHtml_(branding.businessName || CONFIG.fromName || 'Booking Team');
  const preheader = escapeHtml_(copy.body);
  const logoHtml = branding.logoUrl
    ? '<img src="' + escapeHtml_(branding.logoUrl) + '" alt="' + businessName + '" style="max-height:56px;max-width:190px;display:block;margin:0 auto 12px auto;border:0;outline:none;text-decoration:none;">'
    : '';

  const addressLine = branding.addressLine
    ? '<div style="margin-top:8px;font-size:12px;line-height:18px;color:#94a3b8;">' + escapeHtml_(branding.addressLine) + '</div>'
    : '';

  return ''
    + '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">' + preheader + '</div>'
    + '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">'
    + '  <tr>'
    + '    <td align="center" style="padding:28px 12px;">'
    + '      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;width:100%;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,0.08);">'
    + '        <tr>'
    + '          <td align="center" style="background:#0f172a;padding:30px 24px;color:#ffffff;text-align:center;">'
    +              logoHtml
    + '            <div style="font-size:23px;line-height:30px;font-weight:800;letter-spacing:0.2px;color:#ffffff;">' + businessName + '</div>'
    + '            <div style="margin-top:8px;font-size:13px;line-height:20px;color:#cbd5e1;">Booking Notification</div>'
    +              addressLine
    + '          </td>'
    + '        </tr>'
    + '        <tr>'
    + '          <td style="padding:28px 24px 8px 24px;background:#ffffff;">'
    + '            <table role="presentation" cellspacing="0" cellpadding="0" border="0">'
    + '              <tr>'
    + '                <td style="background:' + copy.badgeBg + ';color:' + copy.badgeColor + ';border-radius:999px;padding:7px 12px;font-size:12px;line-height:16px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;">'
    +                    escapeHtml_(copy.badge)
    + '                </td>'
    + '              </tr>'
    + '            </table>'
    + '            <h1 style="margin:17px 0 10px 0;font-size:25px;line-height:32px;color:#111827;font-weight:800;">' + escapeHtml_(subject) + '</h1>'
    + '            <p style="margin:0 0 18px 0;font-size:15px;line-height:25px;color:#374151;">' + escapeHtml_(copy.body) + '</p>'
    +              renderAppointmentSummaryHtml_(row)
    +              renderPaymentSummaryHtml_(row)
    +              renderContactHtml_(branding)
    + '          </td>'
    + '        </tr>'
    + '        <tr>'
    + '          <td style="padding:18px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">'
    + '            <div style="font-size:12px;line-height:18px;color:#6b7280;">' + escapeHtml_(branding.poweredByText || 'Powered by Sedifex') + '</div>'
    + '          </td>'
    + '        </tr>'
    + '      </table>'
    + '      <div style="max-width:680px;margin:14px auto 0 auto;text-align:center;font-size:11px;line-height:17px;color:#9ca3af;">This email was sent because a booking was created or updated.</div>'
    + '    </td>'
    + '  </tr>'
    + '</table>';
}

function emailCopyForStage_(row, stage) {
  const name = row.customer_name || 'there';
  const service = row.service_name || 'your booking';
  const when = formatAppt_(row.appointment_iso);

  const base = {
    badge: 'Booking update',
    badgeBg: '#e0f2fe',
    badgeColor: '#0369a1',
    body: 'Hi ' + name + ', there is an update about ' + service + '.',
  };

  const map = {
    booking_received_pending: {
      badge: 'Payment pending',
      badgeBg: '#fef3c7',
      badgeColor: '#92400e',
      body: 'Hi ' + name + ', we have received your booking for ' + service + ' on ' + when + '. Your payment is still pending.',
    },

    booking_received_awaiting_verification: {
      badge: 'Under review',
      badgeBg: '#ede9fe',
      badgeColor: '#5b21b6',
      body: 'Hi ' + name + ', we have received your booking for ' + service + ' on ' + when + '. Your payment is currently under review.',
    },

    partial_payment_received: {
      badge: 'Partial payment',
      badgeBg: '#ecfccb',
      badgeColor: '#3f6212',
      body: 'Hi ' + name + ', we have received a partial payment for ' + service + '. Your booking date is ' + when + '.',
    },

    payment_confirmed: {
      badge: 'Confirmed',
      badgeBg: '#dcfce7',
      badgeColor: '#166534',
      body: 'Hi ' + name + ', your payment has been confirmed. Your booking for ' + service + ' is confirmed for ' + when + '.',
    },

    cancellation: {
      badge: 'Cancelled',
      badgeBg: '#fee2e2',
      badgeColor: '#991b1b',
      body: 'Hi ' + name + ', your booking for ' + service + ' on ' + when + ' has been cancelled.',
    },

    completion: {
      badge: 'Completed',
      badgeBg: '#e0f2fe',
      badgeColor: '#075985',
      body: 'Hi ' + name + ', your booking for ' + service + ' has been completed. Thank you for choosing us.',
    },

    reschedule: {
      badge: 'Rescheduled',
      badgeBg: '#fef3c7',
      badgeColor: '#92400e',
      body: 'Hi ' + name + ', your booking for ' + service + ' has been rescheduled. The new appointment time is ' + when + '.',
    },

    update: {
      badge: 'Updated',
      badgeBg: '#e0f2fe',
      badgeColor: '#0369a1',
      body: 'Hi ' + name + ', your booking details for ' + service + ' have been updated. Please review the details below.',
    },

    reminder_3d: {
      badge: 'Reminder',
      badgeBg: '#e0f2fe',
      badgeColor: '#0369a1',
      body: 'Hi ' + name + ', this is a friendly reminder that your booking for ' + service + ' is in 3 days, on ' + when + '.',
    },

    reminder_2d: {
      badge: 'Reminder',
      badgeBg: '#e0f2fe',
      badgeColor: '#0369a1',
      body: 'Hi ' + name + ', this is a friendly reminder that your booking for ' + service + ' is in 2 days, on ' + when + '.',
    },

    reminder_1d: {
      badge: 'Tomorrow',
      badgeBg: '#fef3c7',
      badgeColor: '#92400e',
      body: 'Hi ' + name + ', your booking for ' + service + ' is tomorrow, ' + when + '. We look forward to seeing you.',
    },

    thank_you_1d_after: {
      badge: 'Thank you',
      badgeBg: '#dcfce7',
      badgeColor: '#166534',
      body: 'Hi ' + name + ', thank you for visiting us for ' + service + '. We appreciate you and hope to see you again soon.',
    },
  };

  return map[stage] || base;
}

function renderAppointmentSummaryText_(row) {
  const chunks = [];
  if (row.service_name) chunks.push('Service: ' + row.service_name);
  if (row.appointment_iso) chunks.push('Date & time: ' + formatAppt_(row.appointment_iso));
  if (row.quantity) chunks.push('Quantity: ' + row.quantity);
  if (row.booking_id) chunks.push('Booking ID: ' + row.booking_id);
  if (row.notes) chunks.push('Notes: ' + row.notes);
  return chunks.join('\n');
}

function renderPaymentSummaryText_(row) {
  const parts = [];
  parts.push('Payment status: ' + titleCase_(canonicalPaymentStatus_(row)));
  if (row.payment_method) parts.push('Method: ' + row.payment_method);
  if (asCurrency_(row.payment_amount)) parts.push('Amount paid: ' + asCurrency_(row.payment_amount));
  if (asCurrency_(row.deposit_amount)) parts.push('Deposit: ' + asCurrency_(row.deposit_amount));
  if (asCurrency_(row.amount_outstanding)) parts.push('Outstanding: ' + asCurrency_(row.amount_outstanding));
  if (row.payment_reference) parts.push('Reference: ' + row.payment_reference);
  return parts.join('\n');
}

function renderAppointmentSummaryHtml_(row) {
  const rows = [];

  if (row.service_name) rows.push(summaryRowHtml_('Service', row.service_name));
  if (row.appointment_iso) rows.push(summaryRowHtml_('Date & time', formatAppt_(row.appointment_iso)));
  if (row.quantity) rows.push(summaryRowHtml_('Quantity', row.quantity));
  if (row.booking_id) rows.push(summaryRowHtml_('Booking ID', row.booking_id));
  if (row.notes) rows.push(summaryRowHtml_('Notes', row.notes));

  if (!rows.length) return '';
  return cardHtml_('Booking details', rows.join(''));
}

function renderPaymentSummaryHtml_(row) {
  const rows = [];

  rows.push(summaryRowHtml_('Payment status', titleCase_(canonicalPaymentStatus_(row))));
  if (row.payment_method) rows.push(summaryRowHtml_('Method', row.payment_method));
  if (asCurrency_(row.payment_amount)) rows.push(summaryRowHtml_('Amount paid', asCurrency_(row.payment_amount)));
  if (asCurrency_(row.deposit_amount)) rows.push(summaryRowHtml_('Deposit', asCurrency_(row.deposit_amount)));
  if (asCurrency_(row.amount_outstanding)) rows.push(summaryRowHtml_('Outstanding', asCurrency_(row.amount_outstanding)));
  if (row.payment_reference) rows.push(summaryRowHtml_('Reference', row.payment_reference));

  if (!rows.length) return '';
  return cardHtml_('Payment details', rows.join(''));
}

function renderContactHtml_(branding) {
  const rows = [];

  if (branding.supportPhone) rows.push(summaryRowHtml_('Phone', branding.supportPhone));
  if (branding.supportWhatsApp) rows.push(summaryRowHtml_('WhatsApp', branding.supportWhatsApp));
  if (branding.supportEmail) rows.push(summaryRowHtml_('Email', branding.supportEmail));
  if (branding.websiteUrl) rows.push(summaryRowHtml_('Website', branding.websiteUrl));

  if (!rows.length) return '';
  return cardHtml_('Need help?', rows.join(''));
}

function cardHtml_(title, bodyHtml) {
  return ''
    + '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:18px 0;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;background:#ffffff;">'
    + '  <tr>'
    + '    <td style="padding:13px 16px;background:#f9fafb;border-bottom:1px solid #e5e7eb;font-size:14px;line-height:20px;font-weight:800;color:#111827;">' + escapeHtml_(title) + '</td>'
    + '  </tr>'
    + '  <tr>'
    + '    <td style="padding:4px 16px;">'
    + '      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;">'
    +          bodyHtml
    + '      </table>'
    + '    </td>'
    + '  </tr>'
    + '</table>';
}

function summaryRowHtml_(label, value) {
  return ''
    + '<tr>'
    + '  <td valign="top" style="width:38%;border-bottom:1px solid #f3f4f6;padding:11px 0;font-size:13px;line-height:19px;color:#6b7280;font-weight:700;">' + escapeHtml_(label) + '</td>'
    + '  <td valign="top" style="width:62%;border-bottom:1px solid #f3f4f6;padding:11px 0;font-size:14px;line-height:20px;color:#111827;font-weight:600;">' + escapeHtml_(value) + '</td>'
    + '</tr>';
}

function hydrateFromOldRow_(next, old, nowIso) {
  next.created_at = old.created_at || nowIso;

  [
    'booking_received_sent_at',
    'payment_pending_sent_at',
    'awaiting_verification_sent_at',
    'partial_payment_sent_at',
    'payment_confirmation_sent_at',
    'confirmation_sent_at',
    'cancellation_sent_at',
    'completion_sent_at',
    'reminder_3d_sent_at',
    'reminder_2d_sent_at',
    'reminder_1d_sent_at',
    'thank_you_sent_at',
    'last_notified_appointment_iso',
  ].forEach(function (k) {
    next[k] = old[k] || '';
  });

  [
    'payment_status',
    'payment_reference',
    'payment_confirmed_at',
    'payment_verified_at',
    'deposit_amount',
    'amount_outstanding',
    'cancelled_at',
    'completed_at',
  ].forEach(function (k) {
    if (next[k] === '' || next[k] === null || next[k] === undefined) next[k] = old[k] || '';
  });

  next.notification_version = old.notification_version || 1;
}

function bookingDetailsChanged_(oldRow, newRow) {
  return ['service_name', 'booking_date', 'booking_time', 'notes', 'quantity'].some(function (k) {
    return String(oldRow[k] || '').trim() !== String(newRow[k] || '').trim();
  });
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, COLS.length).setValues([COLS]);
    sheet.setFrozenRows(1);
    return;
  }

  const existingCount = Math.max(sheet.getLastColumn(), 1);
  const existing = sheet
    .getRange(1, 1, 1, existingCount)
    .getValues()[0]
    .map(function (v) {
      return String(v || '').trim();
    });

  COLS.forEach(function (h, i) {
    if (existing[i] !== h) sheet.getRange(1, i + 1).setValue(h);
  });

  sheet.setFrozenRows(1);
}

function writeRow_(sheet, rowNum, obj) {
  sheet.getRange(rowNum, 1, 1, COLS.length).setValues([
    COLS.map(function (k) {
      return obj[k] === undefined ? '' : obj[k];
    }),
  ]);
}

function findRowByBookingId_(sheet, bookingId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const vals = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === bookingId) return i + 2;
  }

  return 0;
}

function rowObjectFromSheet_(sheet, rowNum) {
  return objFromRow_(sheet.getRange(rowNum, 1, 1, COLS.length).getValues()[0]);
}

function objFromRow_(row) {
  const obj = {};
  COLS.forEach(function (k, i) {
    obj[k] = row[i];
  });
  return obj;
}

function getOrCreateSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function parseJsonBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return null;
  try {
    return JSON.parse(e.postData.contents);
  } catch (_) {
    return null;
  }
}

function getHeader_(e, keyLower) {
  const h = e && e.headers ? e.headers : {};
  const keys = Object.keys(h);
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i]).toLowerCase() === keyLower) return String(h[keys[i]]);
  }
  return '';
}

function getWebhookSecret_(e) {
  return getHeader_(e, 'x-webhook-secret') || (e && e.parameter && e.parameter.webhookSecret ? String(e.parameter.webhookSecret) : '');
}

function combineDateTimeInTz_(dateStr, timeStr, tz) {
  const d = parseDate_(dateStr);
  const t = parseTime_(timeStr);
  if (!d || !t) return null;

  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), t.h, t.m, 0, 0);
  return Utilities.formatDate(dt, tz || 'UTC', "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function parseDate_(v) {
  if (!v) return null;

  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v)) return v;

  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function parseTime_(t) {
  if (t === null || t === undefined || t === '') return null;

  if (Object.prototype.toString.call(t) === '[object Date]' && !isNaN(t)) {
    return { h: t.getHours(), m: t.getMinutes() };
  }

  if (typeof t === 'number' && !isNaN(t)) {
    const total = Math.round(t * 24 * 60);
    return { h: Math.floor(total / 60) % 24, m: total % 60 };
  }

  const s = String(t).trim().toLowerCase().replace(/\s+/g, '');
  const m = s.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm)?$/i);
  if (!m) return null;

  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ap = m[3] ? m[3].toLowerCase() : null;

  if (isNaN(h) || isNaN(min) || min < 0 || min > 59) return null;

  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap === 'pm' && h !== 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
  } else if (h < 0 || h > 23) {
    return null;
  }

  return { h: h, m: min };
}

function formatAppt_(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso || '';
  return Utilities.formatDate(d, CONFIG.timezone, 'EEE, MMM d, yyyy h:mm a');
}

function escapeHtml_(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function asCurrency_(v) {
  if (v === '' || v === null || v === undefined) return '';
  const n = Number(v);
  return isNaN(n) ? '' : n.toFixed(2);
}

function str_(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function first_() {
  for (var i = 0; i < arguments.length; i++) {
    if (arguments[i] !== undefined && arguments[i] !== null && arguments[i] !== '') return arguments[i];
  }
  return '';
}

function asRecord_(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function numOrDefault_(v, d) {
  const n = Number(v);
  return isNaN(n) ? d : n;
}

function numOrBlank_(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return isNaN(n) ? '' : n;
}

function stamp_(sheet, rowNum, cols) {
  const nowIso = new Date().toISOString();
  cols.forEach(function (c) {
    sheet.getRange(rowNum, COLS.indexOf(c) + 1).setValue(nowIso);
  });
}

function getBranding_() {
  const props = PropertiesService.getScriptProperties().getProperties();
  const out = {};

  Object.keys(BRANDING).forEach(function (k) {
    const pKey = 'BRANDING_' + k;
    out[k] = str_(props[pKey] !== undefined ? props[pKey] : BRANDING[k]);
  });

  out.poweredByText = out.poweredByText || 'Powered by Sedifex';
  return out;
}

function titleCase_(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\w\S*/g, function (txt) {
      return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Sedifex Automation')
    .addItem('Install 5-minute trigger', 'installFiveMinuteTrigger')
    .addItem('Remove scheduled trigger', 'removeScheduledTrigger')
    .addItem('Run scheduled messages now', 'runScheduledMessagesNow')
    .addSeparator()
    .addItem('Send test email to me', 'sendTestEmailToMe')
    .addToUi();
}

function installFiveMinuteTrigger() {
  removeScheduledTrigger();
  ScriptApp.newTrigger('processScheduledMessages').timeBased().everyMinutes(5).create();
  SpreadsheetApp.getActive().toast('5-minute trigger installed.');
}

function removeScheduledTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction && t.getHandlerFunction() === 'processScheduledMessages') {
      ScriptApp.deleteTrigger(t);
    }
  });
}

function runScheduledMessagesNow() {
  processScheduledMessages();
  SpreadsheetApp.getActive().toast('Scheduled messages run complete.');
}

function sendTestEmailToMe() {
  const email = Session.getActiveUser().getEmail();
  if (!email) {
    SpreadsheetApp.getActive().toast('Could not detect your email address.');
    return;
  }

  const sheet = getOrCreateSheet_(CONFIG.sheetName);
  ensureHeaders_(sheet);

  const testDate = Utilities.formatDate(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), CONFIG.timezone, 'yyyy-MM-dd');

  const row = {
    booking_id: 'TEST-' + new Date().getTime(),
    store_id: 'demo-store',
    service_id: 'demo-service',
    service_name: 'Beauty Consultation',
    customer_name: 'Test Customer',
    customer_phone: '020 000 0000',
    customer_email: email,
    quantity: 1,
    notes: 'This is a test booking email preview.',
    booking_date: testDate,
    booking_time: '10:00 AM',
    appointment_iso: combineDateTimeInTz_(testDate, '10:00 AM', CONFIG.timezone),
    payment_method: 'Online payment',
    payment_amount: 150,
    deposit_amount: 50,
    amount_outstanding: 100,
    payment_status: 'confirmed',
    payment_reference: 'TEST-REF-12345',
    payment_confirmed_at: new Date().toISOString(),
    payment_verified_at: new Date().toISOString(),
    status: 'confirmed',
    booking_status: 'confirmed',
    source: 'test_email',
    last_event_type: 'test',
    cancelled_at: '',
    completed_at: '',
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    booking_received_sent_at: '',
    payment_pending_sent_at: '',
    awaiting_verification_sent_at: '',
    partial_payment_sent_at: '',
    payment_confirmation_sent_at: '',
    confirmation_sent_at: '',
    cancellation_sent_at: '',
    completion_sent_at: '',
    reminder_3d_sent_at: '',
    reminder_2d_sent_at: '',
    reminder_1d_sent_at: '',
    thank_you_sent_at: '',
    last_notified_appointment_iso: '',
    notification_version: 1,
    last_error: '',
  };

  const rowNum = sheet.getLastRow() + 1;
  writeRow_(sheet, rowNum, row);
  sendImmediateEmail_(sheet, rowNum, row, 'payment_confirmed');

  SpreadsheetApp.getActive().toast('Test email sent to ' + email);
}

function json_(status, payload) {
  payload.httpStatus = status;
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
