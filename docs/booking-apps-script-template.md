# Booking Apps Script Template (Sedifex + Google Sheets)

Use this template when you want to:

- receive booking webhooks from Sedifex/middleware
- upsert bookings by `booking_id` when available
- send confirmation email once
- send reminders at 3 days, 2 days, and 1 day before appointment
- send cancellation, reschedule, and booking update emails

## Sheet setup (recommended)

1. Create a sheet tab named `Bookings`.
2. Leave the tab completely empty (no headers).
3. Run the script once (or let the first webhook hit it).

The script auto-creates and maintains the full header row via `ensureHeaders_()`.

## Apps Script code

```javascript
const CONFIG = {
  sheetName: 'Bookings',
  timezone: Session.getScriptTimeZone() || 'UTC',
  requireSecret: false,
  secretProperty: 'BOOKING_WEBHOOK_SECRET',
  sendWindowMinutes: 30,
  fromName: 'Booking Team'
};

const COLS = [
  'booking_id','store_id','service_id','service_name','slot_id','customer_name','customer_phone','customer_email',
  'quantity','notes','booking_date','booking_time','appointment_iso','payment_method','payment_amount',
  'branch_location_id','branch_location_name','event_location','customer_stay_location','attributes_json','source',
  'updated_at','created_at','status','last_event_type','cancelled_at','confirmation_sent_at','reminder_3d_sent_at',
  'reminder_2d_sent_at','reminder_1d_sent_at','thank_you_sent_at','last_error','next_action_at',
  'last_notified_appointment_iso','notification_version'
];

function doPost(e) {
  try {
    if (CONFIG.requireSecret) {
      const expected = PropertiesService.getScriptProperties().getProperty(CONFIG.secretProperty) || '';
      const got = getHeader_(e, 'x-webhook-secret');
      if (!expected || got !== expected) return json_(401, { ok: false, error: 'unauthorized' });
    }

    const body = parseJsonBody_(e);
    if (!body) return json_(400, { ok: false, error: 'invalid-json-body' });

    const p = normalizePayload_(body);
    if (!p.booking_date || !p.booking_time) return json_(400, { ok: false, error: 'missing-date-time' });
    if (!p.customer_email || !p.customer_name) return json_(400, { ok: false, error: 'missing-customer' });

    const sheet = getOrCreateSheet_(CONFIG.sheetName);
    ensureHeaders_(sheet);

    p.appointment_iso = combineDateTimeInTz_(p.booking_date, p.booking_time, CONFIG.timezone) || '';

    const row = p.booking_id ? findRowByBookingId_(sheet, p.booking_id) : 0;
    const nowIso = new Date().toISOString();

    if (row) {
      const old = rowObjectFromSheet_(sheet, row);
      p.created_at = old.created_at || nowIso;
      p.confirmation_sent_at = old.confirmation_sent_at || '';
      p.reminder_3d_sent_at = old.reminder_3d_sent_at || '';
      p.reminder_2d_sent_at = old.reminder_2d_sent_at || '';
      p.reminder_1d_sent_at = old.reminder_1d_sent_at || '';
      p.thank_you_sent_at = old.thank_you_sent_at || '';
      p.notification_version = old.notification_version || 1;
      const oldStatus = String(old.status || '').toLowerCase();
      const newStatus = String(p.status || '').toLowerCase();
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
      p.updated_at = nowIso;
      writeRow_(sheet, row, p);

      if (!wasCancelled && isCancelled) {
        sendImmediateEmail_(sheet, row, p, 'cancellation');
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
    return json_(201, { ok: true, action: 'created', row: sheet.getLastRow(), bookingId: p.booking_id || '' });
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
  const now = new Date();

  values.forEach(function(r, idx) {
    const row = objFromRow_(r);
    const rowNum = idx + 2;
    if (String(row.status || '').toLowerCase() === 'cancelled') return;
    if (!row.customer_email || !row.customer_name || !row.appointment_iso) return;

    const appt = new Date(row.appointment_iso);
    if (isNaN(appt)) return;

    if (!row.confirmation_sent_at) {
      sendStageIfDue_(sheet, rowNum, row, appt, 'confirmation');
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
  });
}

function sendStageIfDue_(sheet, rowNum, row, appt, stage) {
  const now = new Date();
  const due = dueDate_(appt, stage);
  const withinWindow = now.getTime() >= due.getTime() && now.getTime() <= due.getTime() + CONFIG.sendWindowMinutes * 60000;
  if (!withinWindow) return;

  const msg = messageForStage_(row, stage);
  GmailApp.sendEmail(row.customer_email, msg.subject, msg.text, { htmlBody: msg.html, name: CONFIG.fromName });

  const nowIso = new Date().toISOString();
  const colMap = {
    confirmation: 'confirmation_sent_at',
    reminder_3d: 'reminder_3d_sent_at',
    reminder_2d: 'reminder_2d_sent_at',
    reminder_1d: 'reminder_1d_sent_at'
  };
  sheet.getRange(rowNum, COLS.indexOf(colMap[stage]) + 1).setValue(nowIso);
  sheet.getRange(rowNum, COLS.indexOf('last_notified_appointment_iso') + 1).setValue(row.appointment_iso);
}

function dueDate_(appt, stage) {
  if (stage === 'confirmation') return new Date();
  const d = new Date(appt.getTime());
  if (stage === 'reminder_3d') d.setDate(d.getDate() - 3);
  if (stage === 'reminder_2d') d.setDate(d.getDate() - 2);
  if (stage === 'reminder_1d') d.setDate(d.getDate() - 1);
  return d;
}

function sendImmediateEmail_(sheet, rowNum, row, stage) {
  if (!row.customer_email || !row.customer_name) return;
  const msg = messageForStage_(row, stage);
  GmailApp.sendEmail(row.customer_email, msg.subject, msg.text, { htmlBody: msg.html, name: CONFIG.fromName });
  sheet.getRange(rowNum, COLS.indexOf('updated_at') + 1).setValue(new Date().toISOString());
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
    'quantity'
  ];
  return keys.some(function(k) {
    return String(oldRow[k] || '').trim() !== String(newRow[k] || '').trim();
  });
}

function messageForStage_(row, stage) {
  const when = formatAppt_(row.appointment_iso);
  const name = row.customer_name || 'there';
  const service = row.service_name || 'your appointment';

  if (stage === 'confirmation') {
    return {
      subject: 'Booking confirmed',
      text: `Hi ${name}, your booking is confirmed for ${service} on ${when}.`,
      html: `<p>Hi ${escapeHtml_(name)},</p><p>Your booking is confirmed for <b>${escapeHtml_(service)}</b> on <b>${escapeHtml_(when)}</b>.</p>`
    };
  }

  if (stage === 'cancellation') {
    return {
      subject: 'Booking cancelled',
      text: `Hi ${name}, your booking for ${service} on ${when} has been cancelled.`,
      html: `<p>Hi ${escapeHtml_(name)},</p><p>Your booking for <b>${escapeHtml_(service)}</b> on <b>${escapeHtml_(when)}</b> has been cancelled.</p>`
    };
  }

  if (stage === 'reschedule') {
    return {
      subject: 'Booking rescheduled',
      text: `Hi ${name}, your booking has been rescheduled to ${when} for ${service}.`,
      html: `<p>Hi ${escapeHtml_(name)},</p><p>Your booking has been rescheduled to <b>${escapeHtml_(when)}</b> for <b>${escapeHtml_(service)}</b>.</p>`
    };
  }

  if (stage === 'update') {
    return {
      subject: 'Booking updated',
      text: `Hi ${name}, your booking details were updated for ${service} on ${when}.`,
      html: `<p>Hi ${escapeHtml_(name)},</p><p>Your booking details were updated for <b>${escapeHtml_(service)}</b> on <b>${escapeHtml_(when)}</b>.</p>`
    };
  }

  const dayLabel = stage === 'reminder_3d' ? '3 days' : stage === 'reminder_2d' ? '2 days' : '1 day';
  return {
    subject: `Reminder: ${dayLabel} to your booking`,
    text: `Hi ${name}, this is a reminder for ${service} on ${when}.`,
    html: `<p>Hi ${escapeHtml_(name)},</p><p>This is your ${escapeHtml_(dayLabel)} reminder for <b>${escapeHtml_(service)}</b> on <b>${escapeHtml_(when)}</b>.</p>`
  };
}

function normalizePayload_(body) {
  const attrs = body.attributes || {};
  const customer = body.customer || {};
  return {
    booking_id: str_(body.bookingId || body.booking_id || body.id),
    store_id: str_(body.storeId || body.store_id),
    service_id: str_(body.serviceId || body.service_id),
    service_name: str_(body.serviceName || body.service_name),
    slot_id: str_(body.slotId || body.slot_id),
    customer_name: str_(body.customerName || body.customer_name || customer.name),
    customer_phone: str_(body.customerPhone || body.customer_phone || customer.phone),
    customer_email: str_(body.customerEmail || body.customer_email || customer.email),
    quantity: numOrDefault_(body.quantity, 1),
    notes: str_(body.notes),
    booking_date: str_(body.bookingDate || body.booking_date || body.date),
    booking_time: str_(body.bookingTime || body.booking_time || body.time),
    appointment_iso: '',
    payment_method: str_(body.paymentMethod || body.payment_method),
    payment_amount: numOrBlank_(body.paymentAmount || body.payment_amount || body.amount),
    branch_location_id: str_(body.branchLocationId || body.branch_location_id),
    branch_location_name: str_(body.branchLocationName || body.branch_location_name),
    event_location: str_(body.eventLocation || body.event_location),
    customer_stay_location: str_(body.customerStayLocation || body.customer_stay_location),
    attributes_json: JSON.stringify(attrs || {}),
    source: str_(body.source || attrs.source || 'sedifex_booking'),
    updated_at: '',
    created_at: '',
    status: str_(body.status || 'active'),
    last_event_type: str_(body.eventType || body.event_type || 'created'),
    cancelled_at: '',
    confirmation_sent_at: '',
    reminder_3d_sent_at: '',
    reminder_2d_sent_at: '',
    reminder_1d_sent_at: '',
    thank_you_sent_at: '',
    last_error: '',
    next_action_at: '',
    last_notified_appointment_iso: '',
    notification_version: 1
  };
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, COLS.length).setValues([COLS]);
    sheet.setFrozenRows(1);
    return;
  }
  const existing = sheet.getRange(1, 1, 1, COLS.length).getValues()[0];
  const same = COLS.every(function(h, i) { return String(existing[i] || '').trim() === h; });
  if (!same) {
    sheet.insertRows(1, 1);
    sheet.getRange(1, 1, 1, COLS.length).setValues([COLS]);
    sheet.setFrozenRows(1);
  }
}

function writeRow_(sheet, rowNum, obj) {
  const arr = COLS.map(function(k) { return obj[k] === undefined ? '' : obj[k]; });
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
  const vals = sheet.getRange(rowNum, 1, 1, COLS.length).getValues()[0];
  return objFromRow_(vals);
}

function objFromRow_(row) {
  const obj = {};
  COLS.forEach(function(k, i) { obj[k] = row[i]; });
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
  try { return JSON.parse(e.postData.contents); } catch (_) { return null; }
}

function getHeader_(e, keyLower) {
  const h = (e && e.headers) ? e.headers : {};
  const keys = Object.keys(h);
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i]).toLowerCase() === keyLower) return String(h[keys[i]]);
  }
  return '';
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
    const totalMinutes = Math.round(t * 24 * 60);
    return { h: Math.floor(totalMinutes / 60) % 24, m: totalMinutes % 60 };
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
  } else if (h < 0 || h > 23) return null;
  return { h: h, m: min };
}

function formatAppt_(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return Utilities.formatDate(d, CONFIG.timezone, 'EEE, MMM d, yyyy h:mm a');
}

function escapeHtml_(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function str_(v) { return v === null || v === undefined ? '' : String(v).trim(); }
function numOrDefault_(v, d) { const n = Number(v); return isNaN(n) ? d : n; }
function numOrBlank_(v) { if (v === null || v === undefined || v === '') return ''; const n = Number(v); return isNaN(n) ? '' : n; }



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
  ScriptApp.newTrigger('processScheduledMessages')
    .timeBased()
    .everyMinutes(5)
    .create();
  SpreadsheetApp.getActive().toast('5-minute trigger installed for processScheduledMessages.');
}

function removeScheduledTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
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
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
```

## Trigger setup (no code edits needed after paste)

1. Reload the Google Sheet (or run `onOpen` once) to show the **Sedifex Automation** menu.
2. Click **Sedifex Automation → Install 5-minute trigger**.
3. Authorize when prompted.
4. Optional: click **Sedifex Automation → Run scheduled messages now** any time you want to force a manual run from the sheet.
5. Optional cleanup: click **Sedifex Automation → Remove scheduled trigger** to delete all time-driven triggers for `processScheduledMessages`.

## Minimum webhook payload

- `bookingId`
- `bookingDate`
- `bookingTime`
- `customerEmail`
- `customerName`
