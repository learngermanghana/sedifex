/**
 * Sedifex-owned transactional email sender.
 *
 * Deploy as ONE Google Apps Script web app under the Sedifex Google account:
 * Execute as: Me. Access: Anyone (required for Firebase HTTPS requests).
 * Set Script Properties (never paste values into this source):
 *   SEDIFEX_EMAIL_APPS_SCRIPT_SECRET = long random secret (32+ characters)
 *   SEDIFEX_EMAIL_LOG_SHEET_ID = private Sedifex-owned spreadsheet ID
 *
 * Only Firebase Functions holds the shared secret. This script deliberately
 * ignores BCC/CC fields: the backend sends a SEPARATE, audited store alert.
 * Do not install a time-driven trigger here. Firebase handles reminders.
 */

function sedifexText_(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max || 1000) : '';
}

function sedifexEmail_(value) {
  const email = sedifexText_(value, 220).toLowerCase();
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email) ? email : '';
}

function sedifexEquals_(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function sedifexJson_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function sedifexDigest_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value);
  return bytes.map(function (byte) {
    return ('0' + (byte & 255).toString(16)).slice(-2);
  }).join('');
}

function sedifexLedger_(spreadsheetId) {
  const book = SpreadsheetApp.openById(spreadsheetId);
  const sheet = book.getSheetByName('Transactional email log')
    || book.insertSheet('Transactional email log');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Delivery ID', 'Timestamp (UTC)', 'Store ID', 'Event type',
      'Reference', 'Recipient type', 'Recipient', 'Status', 'Details',
    ]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function sedifexHasSent_(sheet, deliveryId) {
  if (sheet.getLastRow() < 2) return false;
  const matches = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(deliveryId).matchEntireCell(true).findAll();
  return matches.some(function (match) {
    return String(sheet.getRange(match.getRow(), 8).getValue()) === 'sent';
  });
}

function doPost(e) {
  const props = PropertiesService.getScriptProperties();
  const expectedSecret = props.getProperty('SEDIFEX_EMAIL_APPS_SCRIPT_SECRET') || '';
  const sheetId = props.getProperty('SEDIFEX_EMAIL_LOG_SHEET_ID') || '';
  if (expectedSecret.length < 32 || !sheetId) {
    return sedifexJson_({ ok: false, error: 'sender-not-configured' });
  }

  let data;
  try {
    data = JSON.parse(e && e.postData && e.postData.contents || '{}');
  } catch (_) {
    return sedifexJson_({ ok: false, error: 'invalid-json' });
  }

  if (!data || !sedifexEquals_(data.secret, expectedSecret)) {
    return sedifexJson_({ ok: false, error: 'unauthorized' });
  }

  const storeId = sedifexText_(data.storeId, 180);
  const eventType = sedifexText_(data.eventType, 100);
  const reference = sedifexText_(data.reference, 220);
  const recipientType = sedifexText_(data.recipientType, 40);
  const to = sedifexEmail_(data.to);
  const subject = sedifexText_(data.subject, 250);
  const html = sedifexText_(data.html, 160000);
  const plain = sedifexText_(data.text, 160000);
  const storeName = sedifexText_(data.storeName, 100);
  const replyTo = sedifexEmail_(data.replyTo);

  if (!storeId || !eventType || !reference || !to || !subject
      || (recipientType !== 'customer' && recipientType !== 'store')
      || (!plain && !html)) {
    return sedifexJson_({ ok: false, error: 'invalid-transactional-payload' });
  }

  const deliveryId = sedifexDigest_([
    storeId, eventType, reference, recipientType, to,
  ].join('\u001f'));

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) {
    return sedifexJson_({ ok: false, error: 'sender-busy-retry-later' });
  }
  try {
    const sheet = sedifexLedger_(sheetId);
    if (sedifexHasSent_(sheet, deliveryId)) {
      return sedifexJson_({ ok: true, duplicate: true, sent: 0 });
    }
    if (MailApp.getRemainingDailyQuota() < 1) {
      return sedifexJson_({ ok: false, error: 'daily-email-quota-exhausted' });
    }

    // Google Workspace/Gmail sender account is fixed by the deployment.
    // User-provided From, CC, BCC and additional recipients are ignored.
    const options = {
      name: ('Sedifex · ' + (storeName || 'Business')).slice(0, 80),
      htmlBody: html || undefined,
    };
    if (replyTo) options.replyTo = replyTo;
    GmailApp.sendEmail(to, subject, plain || 'Please view this email in an HTML-capable email client.', options);

    // A private Sedifex-controlled spreadsheet is the delivery audit trail.
    // If the process dies between Gmail sending and appendRow, rare duplicates
    // remain possible. Do not automatically retry uncertain deliveries.
    sheet.appendRow([
      deliveryId, new Date().toISOString(), storeId, eventType,
      reference, recipientType, to, 'sent', '',
    ]);
    return sedifexJson_({ ok: true, sent: 1 });
  } catch (err) {
    console.error('Sedifex email delivery failed: ' + String(err));
    return sedifexJson_({ ok: false, error: 'gmail-send-or-ledger-failed' });
  } finally {
    lock.releaseLock();
  }
}
