# Booking Apps Script Template (Sedifex + Google Sheets)

Use this template when you want to:

- receive booking webhooks from Sedifex/middleware
- upsert bookings by `booking_id` when available
- send payment-aware booking emails once per stage
- send reminders at 3 days, 2 days, and 1 day before appointment **only after payment is confirmed**
- send cancellation, reschedule, and booking update emails

## Sheet setup (recommended)

1. Create a sheet tab named `Bookings`.
2. Leave the tab completely empty (no headers).
3. Run the script once (or let the first webhook hit it).

The script auto-creates and maintains the full header row via `ensureHeaders_()`.


## Is a checkout-only Next.js endpoint enough?

Short answer: **No**. A server route that only creates checkout links in Sedifex will **not** write rows into this Sheet by itself.

To make rows appear in `Bookings`, your website/backend must also send a webhook POST to the Apps Script Web App URL (the `doPost` in this template), with at least:

- `customerName` (or `customer_name`)
- one contact: `customerEmail` or `customerPhone`
- `bookingDate` + `bookingTime` (or snake_case equivalents)
- optional but recommended: `bookingId`/`booking_id` for reliable updates

If you only call `/integration/checkout/create`, payment links can succeed while the Sheet remains unchanged.

### Minimal payload example for sheet sync

```json
{
  "bookingId": "booking_123",
  "customerName": "Jane Doe",
  "customerEmail": "jane@example.com",
  "bookingDate": "2026-05-11",
  "bookingTime": "14:00",
  "serviceName": "Airport Pickup",
  "paymentMethod": "paystack_checkout",
  "paymentConfirmed": false,
  "source": "website_booking_form"
}
```

## Apps Script code

```javascript
const CONFIG = {
  sheetName: 'Bookings',
  timezone: Session.getScriptTimeZone() || 'UTC',
  requireSecret: false,
  secretProperty: 'BOOKING_WEBHOOK_SECRET',
  sendWindowMinutes: 30,
  fromName: 'Booking Team',
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
  'slot_id',
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
  'branch_location_id',
  'branch_location_name',
  'event_location',
  'meeting_mode',
  'meeting_link',
  'zoom_join_url',
  'zoom_contact',
  'customer_stay_location',
  'attributes_json',
  'source',
  'updated_at',
  'created_at',
  'status',
  'booking_status',
  'payment_collection_mode',
  'payment_status',
  'customer_payment_claim',
  'payment_reference',
  'sedifex_order_id',
  'client_order_id',
  'payment_confirmed_at',
  'payment_claimed_at',
  'payment_verified_at',
  'deposit_amount',
  'amount_outstanding',
  'manual_payment_reference',
  'manual_payment_notes',
  'last_event_type',
  'cancelled_at',
  'confirmation_sent_at',
  'booking_received_sent_at',
  'payment_pending_sent_at',
  'awaiting_verification_sent_at',
  'partial_payment_sent_at',
  'payment_confirmation_sent_at',
  'reminder_3d_sent_at',
  'reminder_2d_sent_at',
  'reminder_1d_sent_at',
  'thank_you_sent_at',
  'last_error',
  'next_action_at',
  'last_notified_appointment_iso',
  'notification_version',
];

function doPost(e) {
  try {
    if (CONFIG.requireSecret) {
      const expected =
        PropertiesService.getScriptProperties().getProperty(CONFIG.secretProperty) || '';
      const got = getWebhookSecret_(e);
      if (!expected || got !== expected) {
        logSyncAttempt_('unauthorized', {
          hasExpectedSecret: Boolean(expected),
          hasProvidedSecret: Boolean(got),
        });
        return json_(401, { ok: false, error: 'unauthorized' });
      }
    }

    const body = parseJsonBody_(e);
    if (!body) {
      logSyncAttempt_('invalid-json-body', null);
      return json_(400, { ok: false, error: 'invalid-json-body' });
    }

    const p = normalizePayload_(body);

    if (!p.booking_date || !p.booking_time) {
      return json_(400, { ok: false, error: 'missing-date-time' });
    }
    if (!p.customer_name) {
      return json_(400, { ok: false, error: 'missing-customer-name' });
    }
    if (!p.customer_email && !p.customer_phone) {
      return json_(400, { ok: false, error: 'missing-contact-method' });
    }

    const sheet = getOrCreateSheet_(CONFIG.sheetName);
    ensureHeaders_(sheet);

    p.appointment_iso =
      combineDateTimeInTz_(p.booking_date, p.booking_time, CONFIG.timezone) || '';

    const row = p.booking_id ? findRowByBookingId_(sheet, p.booking_id) : 0;
    const nowIso = new Date().toISOString();

    if (canonicalBookingStatus_(p) === 'cancelled' && !p.cancelled_at) {
      p.cancelled_at = nowIso;
    }

    if (row) {
      const old = rowObjectFromSheet_(sheet, row);
      hydrateFromOldRow_(p, old, nowIso);

      const oldStatus = canonicalBookingStatus_(old);
      const newStatus = canonicalBookingStatus_(p);
      const wasCancelled = oldStatus === 'cancelled';
      const isCancelled = newStatus === 'cancelled';
      const apptChanged = (old.appointment_iso || '') !== (p.appointment_iso || '');
      const detailsChanged = bookingDetailsChanged_(old, p);

      if (apptChanged) {
        p.reminder_3d_sent_at = '';
        p.reminder_2d_sent_at = '';
        p.reminder_1d_sent_at = '';
        p.notification_version = Number(old.notification_version || 1) + 1;
      }

      if (!p.cancelled_at && isCancelled) {
        p.cancelled_at = nowIso;
      }

      p.updated_at = nowIso;
      writeRow_(sheet, row, p);
      logSyncAttempt_('updated', { row: row, bookingId: p.booking_id || '' });

      handleStateEmails_(sheet, row, p, old);

      if (!wasCancelled && isCancelled) {
        sendImmediateEmail_(sheet, row, p, 'cancellation');
      } else if (apptChanged) {
        sendImmediateEmail_(sheet, row, p, 'reschedule');
      } else if (detailsChanged) {
        sendImmediateEmail_(sheet, row, p, 'update');
      }

      return json_(200, {
        ok: true,
        action: 'updated',
        row: row,
        bookingId: p.booking_id,
      });
    }

    p.updated_at = nowIso;
    p.created_at = nowIso;
    p.notification_version = 1;
    writeRow_(sheet, sheet.getLastRow() + 1, p);

    const createdRow = sheet.getLastRow();
    logSyncAttempt_('created', { row: createdRow, bookingId: p.booking_id || '' });
    handleStateEmails_(sheet, createdRow, p, null);

    return json_(201, {
      ok: true,
      action: 'created',
      row: createdRow,
      bookingId: p.booking_id || '',
    });
  } catch (err) {
    return json_(500, {
      ok: false,
      error: String(err && err.message ? err.message : err),
    });
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

    if (canonicalBookingStatus_(row) === 'cancelled') return;
    if (canonicalPaymentStatus_(row) !== 'confirmed') return;
    if (!row.customer_email || !row.customer_name || !row.appointment_iso) return;

    const appt = new Date(row.appointment_iso);
    if (isNaN(appt)) return;

    if (!row.payment_confirmation_sent_at) {
      sendStageIfDue_(sheet, rowNum, row, appt, 'payment_confirmed');
    }
    if (!row.reminder_3d_sent_at) {
      sendStageIfDue_(sheet, rowNum, row, appt, 'reminder_3d');
    }
    if (!row.reminder_2d_sent_at) {
      sendStageIfDue_(sheet, rowNum, row, appt, 'reminder_2d');
    }
    if (!row.reminder_1d_sent_at) {
      sendStageIfDue_(sheet, rowNum, row, appt, 'reminder_1d');
    }
    if (!row.thank_you_sent_at) {
      sendStageIfDue_(sheet, rowNum, row, appt, 'thank_you_1d_after');
    }
  });
}

function handleStateEmails_(sheet, rowNum, row, oldRow) {
  const status = canonicalBookingStatus_(row);
  const paymentStatus = canonicalPaymentStatus_(row);

  if (status === 'cancelled') return;

  if (paymentStatus === 'pending' || paymentStatus === 'checkout_created') {
    if (!row.booking_received_sent_at && !row.payment_pending_sent_at) {
      sendImmediateEmail_(sheet, rowNum, row, 'booking_received_pending');
      stamp_(sheet, rowNum, ['booking_received_sent_at', 'payment_pending_sent_at']);
    }
    return;
  }

  if (paymentStatus === 'awaiting_verification') {
    if (!row.awaiting_verification_sent_at) {
      sendImmediateEmail_(sheet, rowNum, row, 'booking_received_awaiting_verification');
      stamp_(sheet, rowNum, ['awaiting_verification_sent_at']);
    }
    return;
  }

  if (paymentStatus === 'partial') {
    if (!row.partial_payment_sent_at) {
      sendImmediateEmail_(sheet, rowNum, row, 'partial_payment_received');
      stamp_(sheet, rowNum, ['partial_payment_sent_at']);
    }
    return;
  }

  if (paymentStatus === 'confirmed' && !row.payment_confirmation_sent_at) {
    sendImmediateEmail_(sheet, rowNum, row, 'payment_confirmed');
    stamp_(sheet, rowNum, ['payment_confirmation_sent_at', 'confirmation_sent_at']);
  }
}

function sendStageIfDue_(sheet, rowNum, row, appt, stage) {
  const due = dueDate_(appt, stage);
  const now = new Date();
  const isDue = now.getTime() >= due.getTime();

  if (!isDue) return;

  sendImmediateEmail_(sheet, rowNum, row, stage);

  const nowIso = new Date().toISOString();
  const stageToCol = {
    payment_confirmed: 'payment_confirmation_sent_at',
    reminder_3d: 'reminder_3d_sent_at',
    reminder_2d: 'reminder_2d_sent_at',
    reminder_1d: 'reminder_1d_sent_at',
    thank_you_1d_after: 'thank_you_sent_at',
  };

  if (stageToCol[stage]) {
    sheet.getRange(rowNum, COLS.indexOf(stageToCol[stage]) + 1).setValue(nowIso);
  }

  sheet
    .getRange(rowNum, COLS.indexOf('last_notified_appointment_iso') + 1)
    .setValue(row.appointment_iso);
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

function sendImmediateEmail_(sheet, rowNum, row, stage) {
  if (!row.customer_email || !row.customer_name) return;

  const msg = messageForStage_(row, stage);
  const branding = getBranding_();
  const bcc = getNotificationBcc_(branding);

  const mailOptions = {
    htmlBody: msg.html,
    name: branding.businessName || CONFIG.fromName,
  };

  if (bcc) {
    mailOptions.bcc = bcc;
  }

  GmailApp.sendEmail(row.customer_email, msg.subject, msg.text, mailOptions);

  sheet
    .getRange(rowNum, COLS.indexOf('updated_at') + 1)
    .setValue(new Date().toISOString());
}

function getNotificationBcc_(branding) {
  return str_(branding.notificationBccEmail || branding.supportEmail || '');
}

function subjectForStage_(stage) {
  const subjectMap = {
    booking_received_pending: 'Booking received — payment pending',
    booking_received_awaiting_verification: 'Booking received — payment under review',
    partial_payment_received: 'Partial payment received',
    payment_confirmed: 'Booking confirmed',
    cancellation: 'Booking cancelled',
    reschedule: 'Booking rescheduled',
    update: 'Booking details updated',
    reminder_3d: 'Reminder: your booking is in 3 days',
    reminder_2d: 'Reminder: your booking is in 2 days',
    reminder_1d: 'Reminder: your booking is tomorrow',
    thank_you_1d_after: 'Thank you for meeting with us',
  };

  return subjectMap[stage] || 'Booking update';
}

function messageForStage_(row, stage) {
  return {
    subject: subjectForStage_(stage),
    text: textForStage_(row, stage),
    html: htmlForStage_(row, stage),
  };
}

function textForStage_(row, stage) {
  const n = row.customer_name || 'there';
  const when = formatAppt_(row.appointment_iso);
  const service = row.service_name || 'your appointment';
  const outstanding = asCurrency_(row.amount_outstanding || '');
  const lines = [];

  if (stage === 'booking_received_pending') {
    lines.push(
      `Hi ${n}, we received your booking for ${service} on ${when}. Payment is pending.`
    );
  } else if (stage === 'booking_received_awaiting_verification') {
    lines.push(
      `Hi ${n}, we received your booking for ${service} on ${when}. Your payment is under review.`
    );
  } else if (stage === 'partial_payment_received') {
    lines.push(`Hi ${n}, we received a partial payment for ${service} on ${when}.`);
    if (outstanding) lines.push(`Outstanding balance: ${outstanding}.`);
  } else if (stage === 'payment_confirmed') {
    lines.push(
      `Hi ${n}, your payment is confirmed and your booking for ${service} on ${when} is confirmed.`
    );
  } else if (stage === 'cancellation') {
    lines.push(`Hi ${n}, your booking for ${service} on ${when} has been cancelled.`);
  } else if (stage === 'reschedule') {
    lines.push(`Hi ${n}, your booking for ${service} has been rescheduled to ${when}.`);
  } else if (stage === 'update') {
    lines.push(`Hi ${n}, your booking details were updated for ${service} on ${when}.`);
  } else if (stage === 'thank_you_1d_after') {
    lines.push(`Hi ${n}, thank you for meeting with us for ${service} on ${when}.`);
    lines.push('We would love your feedback and look forward to serving you again.');
  } else {
    lines.push(`Hi ${n}, this is a reminder for ${service} on ${when}.`);
  }

  lines.push('');
  lines.push(renderAppointmentSummaryText_(row));

  const paymentText = renderPaymentSummaryText_(row);
  if (paymentText) lines.push('', paymentText);

  const contactText = renderContactBlockText_(getBranding_());
  if (contactText) lines.push('', contactText);

  const bcc = getNotificationBcc_(getBranding_());
  if (bcc) lines.push('', 'Store copy sent to: ' + bcc);

  lines.push('', getBranding_().poweredByText || 'Powered by Sedifex');
  return lines.join('\n');
}

function htmlForStage_(row, stage) {
  const n = escapeHtml_(row.customer_name || 'there');
  const when = escapeHtml_(formatAppt_(row.appointment_iso));
  const service = escapeHtml_(row.service_name || 'your appointment');
  const outstanding = asCurrency_(row.amount_outstanding || '');
  let intro = '';

  if (stage === 'booking_received_pending') {
    intro =
      `<p>Hi ${n}, we received your booking request for <b>${service}</b> on ` +
      `<b>${when}</b>. Your payment is currently pending.</p>`;
  } else if (stage === 'booking_received_awaiting_verification') {
    intro =
      `<p>Hi ${n}, we received your booking for <b>${service}</b> on ` +
      `<b>${when}</b>. Your payment is currently under review.</p>`;
  } else if (stage === 'partial_payment_received') {
    intro =
      `<p>Hi ${n}, we received a partial payment for <b>${service}</b> on ` +
      `<b>${when}</b>${outstanding ? '. Outstanding balance: <b>' + escapeHtml_(outstanding) + '</b>.' : '.'}</p>`;
  } else if (stage === 'payment_confirmed') {
    intro = `<p>Hi ${n}, your payment has been confirmed and your booking is fully confirmed.</p>`;
  } else if (stage === 'cancellation') {
    intro =
      `<p>Hi ${n}, your booking for <b>${service}</b> on ` +
      `<b>${when}</b> has been cancelled.</p>`;
  } else if (stage === 'reschedule') {
    intro = `<p>Hi ${n}, your booking has been rescheduled to <b>${when}</b>.</p>`;
  } else if (stage === 'update') {
    intro = `<p>Hi ${n}, your booking details were updated.</p>`;
  } else if (stage === 'thank_you_1d_after') {
    intro =
      `<p>Hi ${n}, thank you for meeting with us for <b>${service}</b> on ` +
      `<b>${when}</b>.</p><p>We would love your feedback and look forward to serving you again.</p>`;
  } else {
    intro = `<p>Hi ${n}, this is your reminder for <b>${service}</b> on <b>${when}</b>.</p>`;
  }

  return renderEmailLayout_({
    title: subjectForStage_(stage),
    introHtml: intro,
    appointmentHtml: renderAppointmentSummary_(row),
    paymentHtml: renderPaymentSummary_(row),
    contactHtml: renderContactBlock_(getBranding_()),
  });
}

function renderEmailLayout_(options) {
  const branding = getBranding_();
  const businessName = escapeHtml_(branding.businessName || CONFIG.fromName || 'Booking Team');
  const logo = branding.logoUrl
    ? `<img src="${escapeHtml_(branding.logoUrl)}" alt="${businessName}" style="max-height:48px;max-width:180px;display:block;margin:0 auto 10px auto;">`
    : '';
  const links = renderFooterLinks_(branding);
  const powered = escapeHtml_(branding.poweredByText || 'Powered by Sedifex');
  const bcc = getNotificationBcc_(branding);
  const storeCopyNote = bcc
    ? `<div style="margin-top:8px;">A store copy of this email was also sent to <b>${escapeHtml_(bcc)}</b>.</div>`
    : '';

  return (
    `<div style="background:#f5f7fb;padding:24px 10px;font-family:Arial,sans-serif;color:#1f2937;">` +
      `<div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">` +
        `<div style="background:#111827;color:#fff;padding:22px 20px;text-align:center;">` +
          `${logo}` +
          `<div style="font-size:20px;font-weight:700;">${businessName}</div>` +
        `</div>` +
        `<div style="padding:22px 20px;">` +
          `<h2 style="margin:0 0 14px 0;font-size:20px;">${escapeHtml_(options.title || 'Booking update')}</h2>` +
          `${options.introHtml || ''}` +
          `${options.appointmentHtml || ''}` +
          `${options.paymentHtml || ''}` +
          `${options.contactHtml || ''}` +
          `${storeCopyNote}` +
        `</div>` +
        `<div style="padding:14px 20px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">` +
          `${links ? `<div style="margin-bottom:8px;">${links}</div>` : ''}` +
          `<div>${powered}</div>` +
        `</div>` +
      `</div>` +
    `</div>`
  );
}

function renderAppointmentSummary_(row) {
  const meetingMode = isOnlineMeeting_(row) ? 'Online meeting' : '';
  const zoomContact = isOnlineMeeting_(row)
    ? row.zoom_join_url || row.zoom_contact || row.meeting_link || ''
    : '';

  const items = [
    ['Service', row.service_name],
    ['Date & time', formatAppt_(row.appointment_iso)],
    ['Quantity', row.quantity],
    ['Location', row.branch_location_name || row.event_location || row.customer_stay_location],
    ['Meeting mode', meetingMode],
    ['Zoom contact', zoomContact],
    ['Notes', row.notes],
  ].filter(function (x) {
    return str_(x[1]);
  });

  if (!items.length) return '';
  return renderSummaryBlock_('Appointment summary', items);
}

function renderPaymentSummary_(row) {
  const items = [
    ['Payment status', canonicalPaymentStatus_(row)],
    ['Method', row.payment_method],
    ['Amount paid', asCurrency_(row.payment_amount)],
    ['Deposit', asCurrency_(row.deposit_amount)],
    ['Outstanding', asCurrency_(row.amount_outstanding)],
    ['Reference', row.payment_reference || row.manual_payment_reference],
  ].filter(function (x) {
    return str_(x[1]);
  });

  if (!items.length) return '';
  return renderSummaryBlock_('Payment summary', items);
}

function renderSummaryBlock_(title, items) {
  const rows = items
    .map(function (i) {
      return (
        `<tr>` +
          `<td style="padding:6px 8px 6px 0;color:#6b7280;vertical-align:top;">${escapeHtml_(i[0])}</td>` +
          `<td style="padding:6px 0;">${escapeHtml_(String(i[1]))}</td>` +
        `</tr>`
      );
    })
    .join('');

  return (
    `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;margin:16px 0;">` +
      `<div style="font-weight:600;margin-bottom:6px;">${escapeHtml_(title)}</div>` +
      `<table style="width:100%;border-collapse:collapse;font-size:14px;">${rows}</table>` +
    `</div>`
  );
}

function renderAppointmentSummaryText_(row) {
  const chunks = [];
  if (row.service_name) chunks.push('Service: ' + row.service_name);
  if (row.appointment_iso) chunks.push('Date & time: ' + formatAppt_(row.appointment_iso));
  if (row.branch_location_name || row.event_location || row.customer_stay_location) {
    chunks.push(
      'Location: ' +
        (row.branch_location_name || row.event_location || row.customer_stay_location)
    );
  }
  const meetingMode = isOnlineMeeting_(row) ? 'Online meeting' : '';
  const joinLink = row.zoom_join_url || row.meeting_link || '';
  const zoomContact = row.zoom_contact || '';
  if (meetingMode) chunks.push('Meeting mode: ' + meetingMode);
  if (joinLink) chunks.push('Join link: ' + joinLink);
  if (zoomContact) chunks.push('Zoom contact: ' + zoomContact);
  if (row.notes) chunks.push('Notes: ' + row.notes);
  return chunks.join('\n');
}

function renderPaymentSummaryText_(row) {
  const parts = [];
  const paymentStatus = canonicalPaymentStatus_(row);
  if (paymentStatus) parts.push('Payment status: ' + paymentStatus);
  if (row.payment_method) parts.push('Method: ' + row.payment_method);
  if (asCurrency_(row.payment_amount)) parts.push('Amount paid: ' + asCurrency_(row.payment_amount));
  if (asCurrency_(row.deposit_amount)) parts.push('Deposit: ' + asCurrency_(row.deposit_amount));
  if (asCurrency_(row.amount_outstanding)) parts.push('Outstanding: ' + asCurrency_(row.amount_outstanding));
  if (row.payment_reference || row.manual_payment_reference) {
    parts.push('Reference: ' + (row.payment_reference || row.manual_payment_reference));
  }
  return parts.join('\n');
}

function isOnlineMeeting_(row) {
  const mode = str_(row.meeting_mode || '').toLowerCase();
  if (mode) {
    return ['online', 'virtual', 'remote', 'video', 'zoom', 'google_meet', 'meet'].indexOf(mode) >= 0;
  }

  const location = str_(row.event_location || row.branch_location_name || '').toLowerCase();
  return (
    location.indexOf('online') >= 0 ||
    location.indexOf('virtual') >= 0 ||
    location.indexOf('zoom') >= 0 ||
    location.indexOf('meet.google.com') >= 0
  );
}

function renderContactBlock_(branding) {
  const lines = [];
  if (branding.supportPhone) lines.push('Phone: ' + escapeHtml_(branding.supportPhone));
  if (branding.supportWhatsApp) lines.push('WhatsApp: ' + escapeHtml_(branding.supportWhatsApp));
  if (branding.supportEmail) {
    lines.push(
      'Email: <a href="mailto:' +
        escapeHtml_(branding.supportEmail) +
        '">' +
        escapeHtml_(branding.supportEmail) +
        '</a>'
    );
  }
  if (branding.addressLine) lines.push(escapeHtml_(branding.addressLine));
  if (branding.bookingTermsUrl) {
    lines.push('<a href="' + escapeHtml_(branding.bookingTermsUrl) + '">Booking terms</a>');
  }
  if (!lines.length) return '';
  return (
    '<div style="margin-top:14px;font-size:14px;">' +
      '<div style="font-weight:600;margin-bottom:4px;">Need help?</div>' +
      lines.map(function (l) {
        return '<div>' + l + '</div>';
      }).join('') +
    '</div>'
  );
}

function renderContactBlockText_(branding) {
  const lines = [];
  if (branding.supportPhone) lines.push('Phone: ' + branding.supportPhone);
  if (branding.supportWhatsApp) lines.push('WhatsApp: ' + branding.supportWhatsApp);
  if (branding.supportEmail) lines.push('Email: ' + branding.supportEmail);
  if (branding.addressLine) lines.push(branding.addressLine);
  if (branding.bookingTermsUrl) lines.push('Booking terms: ' + branding.bookingTermsUrl);
  if (!lines.length) return '';
  return ['Need help?'].concat(lines).join('\n');
}

function renderFooterLinks_(branding) {
  const links = [
    ['Website', branding.websiteUrl],
    ['Instagram', branding.instagramUrl],
    ['Facebook', branding.facebookUrl],
    ['TikTok', branding.tiktokUrl],
    ['X', branding.xUrl],
  ]
    .filter(function (x) {
      return str_(x[1]);
    })
    .map(function (x) {
      return (
        '<a href="' +
        escapeHtml_(x[1]) +
        '" style="color:#2563eb;text-decoration:none;">' +
        escapeHtml_(x[0]) +
        '</a>'
      );
    });

  return links.join(' · ');
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

function normalizePayload_(body) {
  const attrs = body.attributes || {};
  const customer = body.customer || {};
  const normalizedStatus = normalizeIncomingBookingStatus_(
    body.bookingStatus || body.booking_status || body.status || 'booked'
  );
  const paymentStatus = normalizeIncomingPaymentStatus_(
    body.paymentStatus || body.payment_status || ''
  );

  return {
    booking_id: str_(body.bookingId || body.booking_id || body.id),
    store_id: str_(body.storeId || body.store_id),
    service_id: str_(body.serviceId || body.service_id),
    service_name: str_(body.serviceName || body.service_name),
    slot_id: str_(body.slotId || body.slot_id),
    customer_name: str_(
      body.customerName ||
        body.customer_name ||
        body.fullName ||
        body.full_name ||
        body.name ||
        customer.name
    ),
    customer_phone: str_(
      body.customerPhone ||
        body.customer_phone ||
        body.phone ||
        body.phoneNumber ||
        body.phone_number ||
        body.whatsapp ||
        customer.phone
    ),
    customer_email: str_(body.customerEmail || body.customer_email || body.email || customer.email),
    quantity: numOrDefault_(body.quantity, 1),
    notes: str_(body.notes || body.message || body.details || body.help || body.how_can_we_help),
    booking_date: str_(
      body.bookingDate ||
        body.booking_date ||
        body.preferredDate ||
        body.preferred_date ||
        body.date
    ),
    booking_time: str_(
      body.bookingTime ||
        body.booking_time ||
        body.preferredTime ||
        body.preferred_time ||
        body.time
    ),
    appointment_iso: '',
    payment_method: str_(body.paymentMethod || body.payment_method),
    payment_amount: numOrBlank_(body.paymentAmount || body.payment_amount || body.amount),
    branch_location_id: str_(body.branchLocationId || body.branch_location_id),
    branch_location_name: str_(body.branchLocationName || body.branch_location_name),
    event_location: str_(body.eventLocation || body.event_location),
    meeting_mode: str_(body.meetingMode || body.meeting_mode || attrs.meetingMode || attrs.meeting_mode),
    meeting_link: str_(body.meetingLink || body.meeting_link || attrs.meetingLink || attrs.meeting_link),
    zoom_join_url: str_(body.zoomJoinUrl || body.zoom_join_url || attrs.zoomJoinUrl || attrs.zoom_join_url),
    zoom_contact: str_(body.zoomContact || body.zoom_contact || attrs.zoomContact || attrs.zoom_contact),
    customer_stay_location: str_(body.customerStayLocation || body.customer_stay_location),
    attributes_json: JSON.stringify(attrs || {}),
    source: str_(body.source || attrs.source || 'sedifex_booking'),
    updated_at: '',
    created_at: '',
    status: normalizedStatus,
    booking_status: normalizedStatus,
    payment_collection_mode: str_(body.paymentCollectionMode || body.payment_collection_mode),
    payment_status: paymentStatus,
    customer_payment_claim: str_(body.customerPaymentClaim || body.customer_payment_claim),
    payment_reference: str_(body.paymentReference || body.payment_reference),
    sedifex_order_id: str_(body.sedifexOrderId || body.sedifex_order_id),
    client_order_id: str_(body.clientOrderId || body.client_order_id),
    payment_confirmed_at: str_(body.paymentConfirmedAt || body.payment_confirmed_at),
    payment_claimed_at: str_(body.paymentClaimedAt || body.payment_claimed_at),
    payment_verified_at: str_(body.paymentVerifiedAt || body.payment_verified_at),
    deposit_amount: numOrBlank_(body.depositAmount || body.deposit_amount),
    amount_outstanding: numOrBlank_(body.amountOutstanding || body.amount_outstanding),
    manual_payment_reference: str_(body.manualPaymentReference || body.manual_payment_reference),
    manual_payment_notes: str_(body.manualPaymentNotes || body.manual_payment_notes),
    last_event_type: str_(body.eventType || body.event_type || 'created'),
    cancelled_at: normalizedStatus === 'cancelled' ? new Date().toISOString() : '',
    confirmation_sent_at: '',
    booking_received_sent_at: '',
    payment_pending_sent_at: '',
    awaiting_verification_sent_at: '',
    partial_payment_sent_at: '',
    payment_confirmation_sent_at: '',
    reminder_3d_sent_at: '',
    reminder_2d_sent_at: '',
    reminder_1d_sent_at: '',
    thank_you_sent_at: '',
    last_error: '',
    next_action_at: '',
    last_notified_appointment_iso: '',
    notification_version: 2,
  };
}

function normalizeIncomingPaymentStatus_(value) {
  return str_(value).toLowerCase();
}

function normalizeIncomingBookingStatus_(value) {
  const s = str_(value).toLowerCase();
  if (!s) return 'booked';
  if (s === 'canceled') return 'cancelled';
  if (s === 'active' || s === 'confirmed') return 'booked';
  return s;
}

function canonicalPaymentStatus_(row) {
  const s = str_(row.payment_status || '').toLowerCase();
  if (s) return s;

  if (str_(row.payment_confirmed_at)) return 'confirmed';

  const paid = Number(row.payment_amount || 0);
  const outstanding = Number(row.amount_outstanding || 0);
  if (!isNaN(paid) && paid > 0 && !isNaN(outstanding) && outstanding > 0) {
    return 'partial';
  }

  return 'pending';
}

function canonicalBookingStatus_(row) {
  const s = str_(row.booking_status || row.status || '').toLowerCase();
  if (!s) return 'booked';
  if (s === 'canceled') return 'cancelled';
  if (s === 'active' || s === 'confirmed') return 'booked';
  return s;
}

function hydrateFromOldRow_(next, old, nowIso) {
  next.created_at = old.created_at || nowIso;

  [
    'confirmation_sent_at',
    'booking_received_sent_at',
    'payment_pending_sent_at',
    'awaiting_verification_sent_at',
    'partial_payment_sent_at',
    'payment_confirmation_sent_at',
    'reminder_3d_sent_at',
    'reminder_2d_sent_at',
    'reminder_1d_sent_at',
    'thank_you_sent_at',
  ].forEach(function (k) {
    next[k] = old[k] || '';
  });

  [
    'payment_collection_mode',
    'payment_status',
    'customer_payment_claim',
    'payment_reference',
    'sedifex_order_id',
    'client_order_id',
    'payment_confirmed_at',
    'payment_claimed_at',
    'payment_verified_at',
    'deposit_amount',
    'amount_outstanding',
    'manual_payment_reference',
    'manual_payment_notes',
    'cancelled_at',
  ].forEach(function (k) {
    if (next[k] === '' || next[k] === null || next[k] === undefined) {
      next[k] = old[k] || '';
    }
  });

  next.notification_version = old.notification_version || 1;
}

function stamp_(sheet, rowNum, cols) {
  const nowIso = new Date().toISOString();
  cols.forEach(function (c) {
    sheet.getRange(rowNum, COLS.indexOf(c) + 1).setValue(nowIso);
  });
}

function bookingDetailsChanged_(oldRow, newRow) {
  const keys = [
    'service_name',
    'booking_date',
    'booking_time',
    'branch_location_name',
    'event_location',
    'customer_stay_location',
    'notes',
    'quantity',
  ];

  return keys.some(function (k) {
    return String(oldRow[k] || '').trim() !== String(newRow[k] || '').trim();
  });
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, COLS.length).setValues([COLS]);
    sheet.setFrozenRows(1);
    return;
  }

  const existingCount = sheet.getLastColumn();
  const existing = sheet
    .getRange(1, 1, 1, existingCount)
    .getValues()[0]
    .map(function (v) {
      return String(v || '').trim();
    });

  let changed = false;

  COLS.forEach(function (h, i) {
    if (existing[i] !== h) {
      sheet.getRange(1, i + 1).setValue(h);
      changed = true;
    }
  });

  if (changed) sheet.setFrozenRows(1);
}

function writeRow_(sheet, rowNum, obj) {
  const arr = COLS.map(function (k) {
    return obj[k] === undefined ? '' : obj[k];
  });
  sheet.getRange(rowNum, 1, 1, COLS.length).setValues([arr]);
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
  var sh = ss.getSheetByName(name);
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
    if (String(keys[i]).toLowerCase() === keyLower) {
      return String(h[keys[i]]);
    }
  }

  return '';
}


function getWebhookSecret_(e) {
  const fromHeader = getHeader_(e, 'x-webhook-secret');
  if (fromHeader) return fromHeader;

  const fromParam =
    e && e.parameter && typeof e.parameter.webhookSecret !== 'undefined'
      ? String(e.parameter.webhookSecret || '')
      : '';
  if (fromParam) return fromParam;

  const body = parseJsonBody_(e);
  if (body && typeof body.webhookSecret !== 'undefined') {
    return String(body.webhookSecret || '');
  }

  return '';
}

function logSyncAttempt_(status, meta) {
  try {
    const sheet = getOrCreateSheet_('_sync_logs');
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, 3).setValues([['timestamp', 'status', 'meta_json']]);
    }

    sheet.appendRow([
      new Date().toISOString(),
      status || 'unknown',
      meta ? JSON.stringify(meta) : '',
    ]);
  } catch (_) {
    // no-op: never block booking writes because logging failed
  }
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

  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v)) {
    return v;
  }

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
    const totalMinutes = Math.round(t * 24 * 60);
    return {
      h: Math.floor(totalMinutes / 60) % 24,
      m: totalMinutes % 60,
    };
  }

  const s = String(t).trim().toLowerCase().replace(/\s+/g, '');
  const m = s.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm)?$/i);
  if (!m) return null;

  var h = Number(m[1]);
  var min = m[2] ? Number(m[2]) : 0;
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
  if (isNaN(d)) return iso;
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

function numOrDefault_(v, d) {
  const n = Number(v);
  return isNaN(n) ? d : n;
}

function numOrBlank_(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return isNaN(n) ? '' : n;
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Sedifex Automation')
    .addItem('Install 5-minute trigger', 'installFiveMinuteTrigger')
    .addItem('Remove scheduled trigger', 'removeScheduledTrigger')
    .addItem('Run scheduled messages now', 'runScheduledMessagesNow')
    .addToUi();
}

function installFiveMinuteTrigger() {
  removeScheduledTrigger();
  ScriptApp.newTrigger('processScheduledMessages').timeBased().everyMinutes(5).create();
  SpreadsheetApp.getActive().toast('5-minute trigger installed for processScheduledMessages.');
}

function removeScheduledTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function (t) {
    if (t.getHandlerFunction && t.getHandlerFunction() === 'processScheduledMessages') {
      ScriptApp.deleteTrigger(t);
    }
  });
}

function runScheduledMessagesNow() {
  processScheduledMessages();
  SpreadsheetApp.getActive().toast('Scheduled messages run complete.');
}

function json_(status, payload) {
  payload.httpStatus = status;
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}
