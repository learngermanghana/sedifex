/**
 * Sedifex Central Notification Web App
 *
 * Script Properties required:
 * SEDIFEX_NOTIFICATION_SHARED_SECRET = random secret at least 32 characters
 * SEDIFEX_SENDER_NAME = Sedifex Notifications
 *
 * Optional:
 * SEDIFEX_TRACKING_EMAIL = optional platform-only audit mailbox (no BCC by default)
 * SEDIFEX_RECEIPTS_FOLDER_NAME = Sedifex Receipts
 * SEDIFEX_RECEIPTS_FOLDER_ID = your_google_drive_folder_id
 * DEFAULT_ADMIN_EMAIL = fallback@example.com
 */

const DEFAULT_TRACKING_EMAIL = ''; // No automatic BCC: store alerts are sent separately by Sedifex.

function doPost(e) {
  try {
    const payload = parsePayload_(e);
    const secretOk = verifySecret_(e, payload);

    if (!secretOk) {
      return json_({ ok: false, error: 'unauthorized' }, 401);
    }

    const eventType = clean_(payload.eventType || 'notification');
    const storeId = clean_(payload.storeId || '');
    const reference = clean_(payload.reference || payload.payment?.reference || Utilities.getUuid());
    const recipientType = clean_(payload.recipientType || 'customer');
    const to = cleanEmail_(payload.to || payload.customer?.email || '');

    if (!to) {
      return json_({ ok: false, error: 'missing-recipient-email' }, 400);
    }

    const dedupeKey = [
      storeId,
      eventType,
      reference,
      recipientType,
      to
    ].join('|');

    // Only one invocation may check/send/log a given event at a time.
    const mailLock = LockService.getScriptLock();
    if (!mailLock.tryLock(20000)) {
      return json_({ ok: false, error: 'sender-busy-retry-later' });
    }
    try {
    if (alreadySent_(dedupeKey)) {
      return json_({
        ok: true,
        skipped: true,
        reason: 'duplicate',
        key: dedupeKey
      });
    }

    const subject = clean_(payload.subject || buildFallbackSubject_(payload), 180);
    const htmlBody = String(payload.html || buildFallbackHtml_(payload));
    const plainBody = String(payload.text || stripHtml_(htmlBody));

    const receipt = generateReceipt_(payload, {
      storeId,
      eventType,
      reference,
      recipientType,
      to,
      subject
    });

    const mailOptions = {
      htmlBody: htmlBody,
      name: getSenderName_(payload),
      attachments: [receipt.blob]
    };

    // Firebase chooses a validated, store-owned Reply-To. Do not override it
    // using an older merchant brand email field from a different workspace.
    const replyTo = cleanEmail_(payload.replyTo || '');
    if (replyTo) {
      mailOptions.replyTo = replyTo;
    }

    const trackingEmail = getTrackingEmail_();
    if (trackingEmail && trackingEmail !== to) {
      mailOptions.bcc = trackingEmail;
    }

    GmailApp.sendEmail(to, subject, plainBody, mailOptions);

    logSent_(dedupeKey, {
      storeId,
      eventType,
      reference,
      recipientType,
      to,
      trackingEmail,
      subject,
      status: 'sent',
      receiptNumber: receipt.receiptNumber,
      receiptUrl: receipt.url
    });

    return json_({
      ok: true,
      sent: true,
      to,
      trackingEmail,
      eventType,
      reference,
      receiptNumber: receipt.receiptNumber,
      receiptUrl: receipt.url
    });
    } finally {
      mailLock.releaseLock();
    }
  } catch (error) {
    logError_(error, e);

    return json_({
      ok: false,
      error: error && error.message ? error.message : String(error)
    }, 500);
  }
}

function doGet() {
  return json_({
    ok: true,
    service: 'Sedifex notification endpoint',
    status: 'ready'
  });
}

/**
 * Google Sheet menu
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Sedifex Test')
    .addItem('Create Test Sheet', 'setupTestSheet')
    .addItem('Send Test Email', 'sendTestNotificationFromSheet')
    .addToUi();
}

function setupTestSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Test Notification');

  if (!sheet) {
    sheet = ss.insertSheet('Test Notification');
  }

  sheet.clear();

  sheet.getRange('A1:B1').setValues([['Field', 'Value']]);

  sheet.getRange('A2:B13').setValues([
    ['to', DEFAULT_TRACKING_EMAIL],
    ['customerName', 'Test Customer'],
    ['customerPhone', '0200000000'],
    ['storeName', 'Sedifex Test Store'],
    ['eventType', 'booking.confirmed'],
    ['itemName', 'Test Booking'],
    ['amount', '100'],
    ['currency', 'GHS'],
    ['paymentStatus', 'confirmed'],
    ['paymentMethod', 'Mobile Money'],
    ['brandColor', '#4f46e5'],
    ['replyTo', '']
  ]);

  sheet.getRange('A15').setValue('Last Test Result');
  sheet.getRange('A16').setValue('Last Test Time');

  sheet.getRange('A1:B1').setFontWeight('bold');
  sheet.autoResizeColumns(1, 2);

  SpreadsheetApp.getUi().alert(
    'Test sheet created. Edit the email in B2, then use Sedifex Test → Send Test Email.'
  );
}

function sendTestNotificationFromSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Test Notification');

  if (!sheet) {
    setupTestSheet();
    SpreadsheetApp.getUi().alert('Test sheet was created. Fill the values, then click Send Test Email again.');
    return;
  }

  const values = sheet.getRange('A2:B13').getValues();
  const data = {};

  values.forEach(function (row) {
    const key = String(row[0] || '').trim();
    const value = row[1];

    if (key) {
      data[key] = value;
    }
  });

  const to = cleanEmail_(data.to || '');

  if (!to) {
    SpreadsheetApp.getUi().alert('Please enter a valid test email in cell B2.');
    return;
  }

  const secret = PropertiesService
    .getScriptProperties()
    .getProperty('SEDIFEX_NOTIFICATION_SHARED_SECRET');

  const reference = 'TEST-' + Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    'yyyyMMdd-HHmmss'
  );

  const payload = {
    secret: secret || '',
    eventType: clean_(data.eventType || 'booking.confirmed'),
    storeId: 'test-store',
    reference: reference,
    recipientType: 'customer',
    to: to,
    replyTo: cleanEmail_(data.replyTo || ''),
    brand: {
      storeName: clean_(data.storeName || 'Sedifex Test Store'),
      brandColor: clean_(data.brandColor || '#4f46e5'),
      email: cleanEmail_(data.replyTo || '')
    },
    customer: {
      name: clean_(data.customerName || 'Test Customer'),
      phone: clean_(data.customerPhone || ''),
      email: to
    },
    payment: {
      amount: Number(data.amount || 0),
      currency: clean_(data.currency || 'GHS'),
      status: clean_(data.paymentStatus || 'confirmed'),
      method: clean_(data.paymentMethod || 'Mobile Money'),
      reference: reference
    },
    data: {
      itemName: clean_(data.itemName || 'Test Booking'),
      serviceName: clean_(data.itemName || 'Test Booking')
    }
  };

  const fakeEvent = {
    parameter: {},
    postData: {
      contents: JSON.stringify(payload),
      type: 'application/json'
    }
  };

  const result = doPost(fakeEvent);
  const resultText = result.getContent();

  sheet.getRange('B15').setValue(resultText);
  sheet.getRange('B16').setValue(new Date());

  SpreadsheetApp.getUi().alert('Test completed:\n\n' + resultText);
}

/**
 * Payload and security
 */
function parsePayload_(e) {
  const raw = e && e.postData && e.postData.contents
    ? e.postData.contents
    : '{}';

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error('Invalid JSON payload');
  }
}

function verifySecret_(e, payload) {
  const expected = PropertiesService
    .getScriptProperties()
    .getProperty('SEDIFEX_NOTIFICATION_SHARED_SECRET');

  // Never allow an unconfigured deployment to accept unauthenticated mail.
  if (!expected || String(expected).trim().length < 32) {
    return false;
  }

  const urlSecret = e && e.parameter ? e.parameter.secret : '';
  const bodySecret = payload.secret || payload.sharedSecret || payload.sedifexSecret || '';

  return String(urlSecret || bodySecret).trim() === String(expected).trim();
}

/**
 * Email content
 */
function buildFallbackSubject_(payload) {
  const eventType = clean_(payload.eventType || 'notification');
  const storeName = clean_(payload.brand?.storeName || payload.storeName || 'Sedifex Store');

  if (eventType === 'order.confirmed') return 'Order confirmed - ' + storeName;
  if (eventType === 'order.pay_on_delivery') return 'New pay on delivery order - ' + storeName;
  if (eventType === 'order.manual_payment') return 'Order received - ' + storeName;
  if (eventType === 'student_registration.created') return 'Registration received - ' + storeName;
  if (eventType === 'student_registration.paid') return 'Registration confirmed - ' + storeName;
  if (eventType === 'donation.confirmed') return 'Thank you for your donation - ' + storeName;
  if (eventType === 'volunteer.created') return 'Volunteer application received - ' + storeName;
  if (eventType === 'support_request.created') return 'Support request received - ' + storeName;
  if (eventType === 'booking.created') return 'Booking received - ' + storeName;
  if (eventType === 'booking.confirmed') return 'Booking confirmed - ' + storeName;

  return 'Notification - ' + storeName;
}

function buildFallbackHtml_(payload) {
  const brand = payload.brand || {};
  const storeName = clean_(brand.storeName || payload.storeName || 'Sedifex Store');
  const brandColor = clean_(brand.brandColor || '#4f46e5');
  const customerName = clean_(payload.customer?.name || 'there');
  const eventType = clean_(payload.eventType || 'notification');
  const reference = clean_(payload.reference || payload.payment?.reference || '');
  const amount = payload.payment && payload.payment.amount
    ? clean_(payload.payment.currency || 'GHS') + ' ' + Number(payload.payment.amount).toFixed(2)
    : '';

  const itemName = clean_(
    payload.data?.itemName ||
    payload.data?.serviceName ||
    payload.data?.productName ||
    payload.data?.course ||
    payload.data?.supportType ||
    'your request'
  );

  const title = eventTitle_(eventType);
  const intro = eventIntro_(eventType, storeName, itemName, customerName);

  return `
    <div style="background:#f5f7fb;padding:28px 16px;font-family:Arial,Helvetica,sans-serif;color:#111827;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:22px;overflow:hidden;">
        <div style="background:${escapeHtml_(brandColor)};padding:24px 26px;color:#ffffff;">
          <h2 style="margin:0;font-size:24px;">${escapeHtml_(storeName)}</h2>
          <p style="margin:6px 0 0;color:rgba(255,255,255,.82);font-size:13px;font-weight:700;">Powered by Sedifex</p>
        </div>

        <div style="padding:28px 26px;">
          <h1 style="margin:0 0 10px;font-size:26px;line-height:1.15;">${escapeHtml_(title)}</h1>
          <p style="margin:0;color:#475569;font-size:15px;line-height:1.7;">${escapeHtml_(intro)}</p>

          <div style="margin:22px 0;border:1px solid #e5e7eb;background:#f8fafc;border-radius:16px;padding:14px 18px;">
            <table style="width:100%;border-collapse:collapse;">
              ${detailRow_('Reference', reference)}
              ${detailRow_('Item / Service', itemName)}
              ${detailRow_('Amount', amount)}
              ${detailRow_('Payment', payload.payment?.status || '')}
              ${detailRow_('Customer', payload.customer?.name || '')}
              ${detailRow_('Phone', payload.customer?.phone || '')}
              ${detailRow_('Email', payload.customer?.email || '')}
            </table>
          </div>

          <p style="margin:16px 0 0;color:#64748b;font-size:13px;line-height:1.6;">
            A PDF receipt is attached to this email. Keep it for your records.
          </p>
        </div>

        <div style="padding:18px 26px;background:#f8fafc;border-top:1px solid #e5e7eb;color:#64748b;font-size:12px;">
          <p style="margin:0;">This email was sent by ${escapeHtml_(storeName)} through Sedifex.</p>
        </div>
      </div>
    </div>
  `;
}

function eventTitle_(eventType) {
  const map = {
    'order.confirmed': 'Order confirmed',
    'order.pay_on_delivery': 'Order received',
    'order.manual_payment': 'Order received',
    'student_registration.created': 'Registration received',
    'student_registration.paid': 'Registration confirmed',
    'donation.confirmed': 'Thank you for your donation',
    'volunteer.created': 'Volunteer application received',
    'support_request.created': 'We received your request',
    'booking.created': 'Booking received',
    'booking.confirmed': 'Booking confirmed'
  };

  return map[eventType] || 'Notification received';
}

function eventIntro_(eventType, storeName, itemName, customerName) {
  if (eventType === 'donation.confirmed') {
    return 'Hello ' + customerName + ', thank you for supporting ' + storeName + '. Your donation has been received.';
  }

  if (eventType === 'volunteer.created') {
    return 'Hello ' + customerName + ', thank you for applying to volunteer with ' + storeName + '. Your application has been received.';
  }

  if (eventType === 'support_request.created') {
    return 'Hello ' + customerName + ', ' + storeName + ' has received your support request. The team will review it and respond soon.';
  }

  if (eventType.indexOf('student_registration') === 0) {
    return 'Hello ' + customerName + ', your registration for ' + itemName + ' has been received. ' + storeName + ' will contact you with the next steps.';
  }

  if (eventType.indexOf('booking') === 0) {
    return 'Hello ' + customerName + ', your booking for ' + itemName + ' has been received by ' + storeName + '.';
  }

  return 'Hello ' + customerName + ', your request for ' + itemName + ' has been received by ' + storeName + '.';
}

function detailRow_(label, value) {
  if (!value) return '';

  return `
    <tr>
      <td style="padding:9px 0;color:#64748b;font-size:13px;width:38%;vertical-align:top;">${escapeHtml_(label)}</td>
      <td style="padding:9px 0;color:#111827;font-size:14px;font-weight:700;vertical-align:top;">${escapeHtml_(value)}</td>
    </tr>
  `;
}

/**
 * Receipt generation
 */
function generateReceipt_(payload, meta) {
  const receiptNumber = buildReceiptNumber_(payload, meta);
  const html = buildReceiptHtml_(payload, meta, receiptNumber);

  const pdfBlob = HtmlService
    .createHtmlOutput(html)
    .getBlob()
    .getAs(MimeType.PDF)
    .setName(receiptNumber + '.pdf');

  const folder = getReceiptFolder_();
  const file = folder.createFile(pdfBlob);

  return {
    receiptNumber: receiptNumber,
    blob: file.getBlob().setName(receiptNumber + '.pdf'),
    url: file.getUrl()
  };
}

function buildReceiptNumber_(payload, meta) {
  const datePart = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    'yyyyMMdd'
  );

  const rawReference = clean_(
    payload.receiptNumber ||
    payload.reference ||
    payload.payment?.reference ||
    meta.reference ||
    Utilities.getUuid(),
    80
  );

  const safeReference = rawReference
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 24);

  return 'SEDIFEX-RECEIPT-' + datePart + '-' + safeReference;
}

function getReceiptFolder_() {
  const props = PropertiesService.getScriptProperties();
  const folderId = props.getProperty('SEDIFEX_RECEIPTS_FOLDER_ID');

  if (folderId) {
    return DriveApp.getFolderById(folderId);
  }

  const folderName = props.getProperty('SEDIFEX_RECEIPTS_FOLDER_NAME') || 'Sedifex Receipts';
  const folders = DriveApp.getFoldersByName(folderName);

  if (folders.hasNext()) {
    return folders.next();
  }

  return DriveApp.createFolder(folderName);
}

function buildReceiptHtml_(payload, meta, receiptNumber) {
  const brand = payload.brand || {};
  const storeName = clean_(brand.storeName || payload.storeName || 'Sedifex Store');
  const brandColor = clean_(brand.brandColor || '#4f46e5');

  const customerName = clean_(payload.customer?.name || 'Customer');
  const customerEmail = cleanEmail_(payload.customer?.email || payload.to || meta.to || '');
  const customerPhone = clean_(payload.customer?.phone || '');

  const eventType = clean_(payload.eventType || meta.eventType || 'notification');
  const reference = clean_(payload.reference || payload.payment?.reference || meta.reference || '');

  const itemName = clean_(
    payload.data?.itemName ||
    payload.data?.serviceName ||
    payload.data?.productName ||
    payload.data?.course ||
    payload.data?.supportType ||
    'Service / Item'
  );

  const currency = clean_(payload.payment?.currency || payload.currency || 'GHS');
  const amountNumber = Number(payload.payment?.amount || payload.amount || 0);
  const amount = amountNumber > 0 ? currency + ' ' + amountNumber.toFixed(2) : '';

  const paymentStatus = clean_(payload.payment?.status || payload.paymentStatus || '');
  const paymentMethod = clean_(payload.payment?.method || payload.paymentMethod || '');

  const issuedAt = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    'EEE, dd MMM yyyy HH:mm'
  );

  const receiptTitle = receiptTitle_(eventType);

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            margin: 0;
            padding: 0;
            background: #f8fafc;
            font-family: Arial, Helvetica, sans-serif;
            color: #111827;
          }

          .page {
            max-width: 760px;
            margin: 0 auto;
            padding: 34px;
          }

          .receipt {
            background: #ffffff;
            border: 1px solid #e5e7eb;
            border-radius: 20px;
            overflow: hidden;
          }

          .header {
            background: ${escapeHtml_(brandColor)};
            color: #ffffff;
            padding: 28px 32px;
          }

          .header h1 {
            margin: 0;
            font-size: 28px;
            line-height: 1.2;
          }

          .header p {
            margin: 8px 0 0;
            font-size: 13px;
            opacity: 0.9;
          }

          .content {
            padding: 30px 32px;
          }

          .top-row {
            display: table;
            width: 100%;
            margin-bottom: 26px;
          }

          .top-col {
            display: table-cell;
            width: 50%;
            vertical-align: top;
          }

          .label {
            color: #64748b;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: .06em;
            font-weight: 700;
            margin-bottom: 6px;
          }

          .value {
            color: #111827;
            font-size: 14px;
            line-height: 1.6;
            font-weight: 600;
          }

          .big-amount {
            font-size: 30px;
            font-weight: 800;
            color: #111827;
            margin-top: 6px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }

          th {
            background: #f8fafc;
            color: #475569;
            text-align: left;
            padding: 12px;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: .04em;
            border-bottom: 1px solid #e5e7eb;
          }

          td {
            padding: 13px 12px;
            border-bottom: 1px solid #e5e7eb;
            font-size: 14px;
            vertical-align: top;
          }

          .right {
            text-align: right;
          }

          .summary {
            margin-top: 24px;
            border: 1px solid #e5e7eb;
            border-radius: 14px;
            overflow: hidden;
          }

          .summary-row {
            display: table;
            width: 100%;
            border-bottom: 1px solid #e5e7eb;
          }

          .summary-row:last-child {
            border-bottom: none;
          }

          .summary-label,
          .summary-value {
            display: table-cell;
            padding: 12px 16px;
            font-size: 14px;
          }

          .summary-label {
            color: #64748b;
            background: #f8fafc;
            width: 42%;
          }

          .summary-value {
            font-weight: 700;
            color: #111827;
          }

          .footer {
            padding: 18px 32px;
            background: #f8fafc;
            color: #64748b;
            font-size: 12px;
            line-height: 1.6;
            border-top: 1px solid #e5e7eb;
          }
        </style>
      </head>

      <body>
        <div class="page">
          <div class="receipt">
            <div class="header">
              <h1>${escapeHtml_(receiptTitle)}</h1>
              <p>${escapeHtml_(storeName)} · Powered by Sedifex</p>
            </div>

            <div class="content">
              <div class="top-row">
                <div class="top-col">
                  <div class="label">Receipt Number</div>
                  <div class="value">${escapeHtml_(receiptNumber)}</div>
                  <br>
                  <div class="label">Issued At</div>
                  <div class="value">${escapeHtml_(issuedAt)}</div>
                </div>

                <div class="top-col">
                  <div class="label">Amount</div>
                  <div class="big-amount">${escapeHtml_(amount || 'N/A')}</div>
                </div>
              </div>

              <div class="top-row">
                <div class="top-col">
                  <div class="label">Customer</div>
                  <div class="value">
                    ${escapeHtml_(customerName)}<br>
                    ${escapeHtml_(customerEmail)}<br>
                    ${escapeHtml_(customerPhone)}
                  </div>
                </div>

                <div class="top-col">
                  <div class="label">Store</div>
                  <div class="value">${escapeHtml_(storeName)}</div>
                </div>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Reference</th>
                    <th class="right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>${escapeHtml_(itemName)}</td>
                    <td>${escapeHtml_(reference)}</td>
                    <td class="right">${escapeHtml_(amount || '')}</td>
                  </tr>
                </tbody>
              </table>

              <div class="summary">
                ${receiptSummaryRow_('Event Type', eventType)}
                ${receiptSummaryRow_('Payment Status', paymentStatus)}
                ${receiptSummaryRow_('Payment Method', paymentMethod)}
                ${receiptSummaryRow_('Reference', reference)}
              </div>
            </div>

            <div class="footer">
              This receipt was generated automatically by Sedifex. Keep it for your records.
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

function receiptTitle_(eventType) {
  if (eventType === 'order.confirmed') return 'Payment Receipt';
  if (eventType === 'order.pay_on_delivery') return 'Order Receipt';
  if (eventType === 'order.manual_payment') return 'Order Receipt';
  if (eventType === 'booking.confirmed') return 'Booking Receipt';
  if (eventType === 'booking.created') return 'Booking Receipt';
  if (eventType === 'student_registration.created') return 'Registration Receipt';
  if (eventType === 'student_registration.paid') return 'Registration Payment Receipt';
  if (eventType === 'donation.confirmed') return 'Donation Receipt';
  if (eventType === 'volunteer.created') return 'Volunteer Confirmation Receipt';
  if (eventType === 'support_request.created') return 'Support Request Receipt';

  return 'Sedifex Receipt';
}

function receiptSummaryRow_(label, value) {
  if (!value) return '';

  return `
    <div class="summary-row">
      <div class="summary-label">${escapeHtml_(label)}</div>
      <div class="summary-value">${escapeHtml_(value)}</div>
    </div>
  `;
}

/**
 * Tracking email
 */
function getTrackingEmail_() {
  const propEmail = PropertiesService
    .getScriptProperties()
    .getProperty('SEDIFEX_TRACKING_EMAIL');

  return cleanEmail_(propEmail || DEFAULT_TRACKING_EMAIL);
}

/**
 * Logs
 */
function alreadySent_(key) {
  const sheet = getSheet_('SentLog');
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return false;

  const keys = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
  return keys.indexOf(key) !== -1;
}

function logSent_(key, data) {
  const sheet = getSheet_('SentLog');

  ensureSentLogHeaders_(sheet);

  sheet.appendRow([
    key,
    data.storeId || '',
    data.eventType || '',
    data.reference || '',
    data.recipientType || '',
    data.to || '',
    data.trackingEmail || '',
    data.subject || '',
    data.status || 'sent',
    data.receiptNumber || '',
    data.receiptUrl || '',
    new Date()
  ]);
}

function logError_(error, e) {
  const sheet = getSheet_('Errors');

  // Never log authentication secrets or customer's private booking content.
  sheet.appendRow([
    new Date(),
    error && error.message ? error.message : String(error),
    'redacted: inspect Sedifex notification_outbox for delivery reference'
  ]);
}

function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);

  if (!sheet) {
    sheet = ss.insertSheet(name);

    if (name === 'SentLog') {
      sheet.appendRow([
        'key',
        'storeId',
        'eventType',
        'reference',
        'recipientType',
        'to',
        'trackingEmail',
        'subject',
        'status',
        'receiptNumber',
        'receiptUrl',
        'sentAt'
      ]);
    }

    if (name === 'Errors') {
      sheet.appendRow([
        'createdAt',
        'error',
        'payload'
      ]);
    }
  }

  return sheet;
}

function ensureSentLogHeaders_(sheet) {
  const headers = [
    'key',
    'storeId',
    'eventType',
    'reference',
    'recipientType',
    'to',
    'trackingEmail',
    'subject',
    'status',
    'receiptNumber',
    'receiptUrl',
    'sentAt'
  ];

  const lastColumn = Math.max(sheet.getLastColumn(), headers.length);
  const current = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];

  let needsUpdate = false;

  headers.forEach(function (header, index) {
    if (current[index] !== header) {
      needsUpdate = true;
    }
  });

  if (needsUpdate) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

/**
 * Helpers
 */
function getSenderName_(payload) {
  const propName = PropertiesService
    .getScriptProperties()
    .getProperty('SEDIFEX_SENDER_NAME');

  return propName || payload.brand?.storeName || 'Sedifex Notifications';
}

function stripHtml_(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clean_(value, max) {
  max = max || 500;
  return String(value || '').trim().slice(0, max);
}

function cleanEmail_(value) {
  const cleaned = clean_(value, 220).toLowerCase();
  return cleaned.indexOf('@') > -1 ? cleaned : '';
}

function escapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function json_(data, statusCode) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}