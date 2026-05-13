# Sedifex Bulk Email: Google Sheets + Apps Script Setup

Use this guide when each store should own its Google Sheet and Google Apps Script deployment, while Sedifex remains the single source of truth for customers.

## Architecture
- Sedifex stores customers and campaign audience logic.
- Store owner provides a Google Apps Script Web App endpoint.
- Sedifex sends campaign payload (`subject`, `html`, recipients JSON) to that endpoint.
- Apps Script sends emails and returns a summary to Sedifex.

## Setup steps
1. Store owner creates a Google Sheet.
2. In **Extensions → Apps Script**, paste the full template below.
3. Add Script Property: `SEDIFEX_SHARED_TOKEN`.
4. (Optional) Add the optional Script Properties listed in the template header.
5. Deploy as **Web App** and copy deployment URL.
6. In Sedifex, open **Account → Integrations → Bulk Email (Google Sheets)**.
7. Paste Web App URL + shared token, then verify connection.

## Sheet template (what the store should create)
Create one tab with this exact name:
- **Tab name:** `Recipients` *(change this in script property `RECIPIENTS_TAB_NAME` if needed)*

Use row 1 as headers:

| Column | Header | What to put there |
|---|---|---|
| A | `email` | Customer email address (required) |
| B | `name` | Customer name (optional) |
| C | `status` | Leave blank. Script writes `SENT`, `SKIPPED`, or `ERROR`. |
| D | `last_sent_at` | Leave blank. Script writes timestamp after send. |
| E | `notes` | Optional internal notes. |

### Sample rows
| email | name | status | last_sent_at | notes |
|---|---|---|---|---|
| ama@example.com | Ama |  |  | VIP |
| kojo@example.com | Kojo |  |  | Follow up in May |

## Where the subject and message come from
- **Subject** is set in Sedifex campaign **Subject** and sent as `payload.subject`.
- **Message body** is set in Sedifex campaign **Message** and sent as `payload.html`.
- The Google Sheet is mainly for recipients and delivery tracking (`status`, `last_sent_at`).

---

## Copy‑paste template for Google Apps Script (complete)
> Copy everything inside this code block into **Extensions → Apps Script** (`Code.gs`).

```javascript
/***************************************
 *  Sedifex Bulk Email Web App
 * -----------------------------------------------
 * Sheet tab required:
 *   Recipients
 *
 * Headers required in row 1:
 *   email | name | status | last_sent_at | notes
 *
 * Script Properties required:
 *   SEDIFEX_SHARED_TOKEN = your shared secret
 *
 * Optional Script Properties:
 *   STORE_NAME = Your-Name
 *   DEFAULT_FROM_NAME = Yourname
 *   STORE_INSTAGRAM_URL = https://instagram.com/yoururl
 *   STORE_FACEBOOK_URL = https://facebook.com/yoururl
 *   STORE_TIKTOK_URL = https://tiktok.com/yoururl
 *   RECIPIENTS_TAB_NAME = Recipients
 *   ENABLE_CAMPAIGN_DEDUPE = true
 *   MAX_EMAILS_PER_REQUEST = 100
 ***************************************/

const CONFIG = {
  defaultSheetTabName: 'Recipients',
  defaultStoreName: 'Your-Name',
  defaultFromName: 'Your Name',
  defaultSocialUrls: {
    instagram: 'https://instagram.com/glitteringmedspa',
    facebook: 'https://facebook.com/glitteringmedspa',
    tiktok: 'https://tiktok.com/@glitteringmedspa'
  },
  enableCampaignDedupeByDefault: true,
  defaultMaxEmailsPerRequest: 200,
  headers: {
    email: 'email',
    name: 'name',
    status: 'status',
    lastSentAt: 'last_sent_at',
    notes: 'notes'
  },
  statusValues: {
    sent: 'SENT',
    skipped: 'SKIPPED',
    error: 'ERROR',
    queued: 'QUEUED'
  }
};

/**
 * Optional health check / verification endpoint.
 * Open the deployed web app URL in browser to confirm it is alive.
 */
function doGet() {
  return jsonOutput({
    ok: true,
    service: ' Bulk Email Web App',
    store: getStoreName(),
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
}

/**
 * Main Sedifex endpoint.
 */
function doPost(e) {
  try {
    const payload = parsePayload_(e);
    const authResult = authorizeRequest_(payload);

    if (!authResult.ok) {
      return jsonOutput({
        ok: false,
        error: 'unauthorized'
      });
    }

    const lock = LockService.getScriptLock();
    lock.tryLock(30000);

    const props = PropertiesService.getScriptProperties();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetTabName = props.getProperty('RECIPIENTS_TAB_NAME') || CONFIG.defaultSheetTabName;
    const sheet = ss.getSheetByName(sheetTabName);

    if (!sheet) {
      return jsonOutput({
        ok: false,
        error: 'sheet tab not found: ' + sheetTabName
      });
    }

    const values = sheet.getDataRange().getValues();
    if (!values || values.length === 0) {
      return jsonOutput({
        ok: false,
        error: 'sheet is empty'
      });
    }

    const headerMap = getHeaderMap_(values[0]);
    const emailCol = headerMap[CONFIG.headers.email];
    const nameCol = headerMap[CONFIG.headers.name];
    const statusCol = headerMap[CONFIG.headers.status];
    const lastSentAtCol = headerMap[CONFIG.headers.lastSentAt];
    const notesCol = headerMap[CONFIG.headers.notes];

    if (emailCol === undefined) {
      return jsonOutput({
        ok: false,
        error: 'missing required header: ' + CONFIG.headers.email
      });
    }

    const campaignId = safeString_(payload.campaignId);
    const enableCampaignDedupe = getBooleanProperty_(
      'ENABLE_CAMPAIGN_DEDUPE',
      CONFIG.enableCampaignDedupeByDefault
    );

    if (enableCampaignDedupe && campaignId) {
      const alreadyProcessed = isCampaignAlreadyProcessed_(campaignId);
      if (alreadyProcessed) {
        return jsonOutput({
          ok: true,
          duplicate: true,
          message: 'campaign already processed',
          campaignId: campaignId,
          attempted: 0,
          sent: 0,
          failed: 0,
          skipped: 0,
          errors: []
        });
      }
    }

    const maxEmailsPerRequest = Number(
      props.getProperty('MAX_EMAILS_PER_REQUEST') || CONFIG.defaultMaxEmailsPerRequest
    );

    const recipientsFromPayload = Array.isArray(payload.recipients) ? payload.recipients : [];
    const sheetRows = buildSheetRecipients_(values, {
      emailCol,
      nameCol,
      statusCol,
      lastSentAtCol,
      notesCol
    });

    let recipients = recipientsFromPayload.length
      ? buildPayloadRecipients_(recipientsFromPayload)
      : sheetRows;

    recipients = normalizeAndDedupeRecipients_(recipients);

    if (!recipients.length) {
      return jsonOutput({
        ok: false,
        error: 'no valid recipients found'
      });
    }

    if (recipients.length > maxEmailsPerRequest) {
      return jsonOutput({
        ok: false,
        error: 'too many recipients in one request',
        maxAllowed: maxEmailsPerRequest,
        received: recipients.length
      });
    }

    const subject = safeString_(payload.subject) || 'Update from ' + getStoreName();
    const htmlTemplate = safeString_(payload.html);
    const fromName = safeString_(payload.fromName) || getDefaultFromName_();

    if (!subject) {
      return jsonOutput({
        ok: false,
        error: 'missing subject'
      });
    }

    if (!htmlTemplate) {
      return jsonOutput({
        ok: false,
        error: 'missing html body'
      });
    }

    const mailQuotaRemaining = MailApp.getRemainingDailyQuota();

    let attempted = 0;
    let sent = 0;
    let queuedForRetry = 0;
    let skipped = 0;
    const errors = [];
    const rowUpdates = [];

    recipients.forEach(function(recipient) {
      const email = safeString_(recipient.email).trim();
      const name = safeString_(recipient.name).trim();

      if (!email || !isValidEmail_(email)) {
        skipped += 1;
        if (recipient.rowIndex && statusCol !== undefined) {
          rowUpdates.push({
            rowIndex: recipient.rowIndex,
            status: CONFIG.statusValues.skipped,
            lastSentAt: ''
          });
        }
        return;
      }

      if (attempted >= mailQuotaRemaining) {
        queuedForRetry += 1;
        if (recipient.rowIndex && statusCol !== undefined) {
          rowUpdates.push({
            rowIndex: recipient.rowIndex,
            status: CONFIG.statusValues.queued,
            lastSentAt: ''
          });
        }
        return;
      }

      attempted += 1;

      try {
        const personalizedHtml = applyTemplate_(appendBrandFooter_(htmlTemplate), {
          name: name || 'Valued Customer',
          email: email,
          store_name: getStoreName(),
          first_name: extractFirstName_(name),
          instagram_url: getSocialUrl_('STORE_INSTAGRAM_URL', CONFIG.defaultSocialUrls.instagram),
          facebook_url: getSocialUrl_('STORE_FACEBOOK_URL', CONFIG.defaultSocialUrls.facebook),
          tiktok_url: getSocialUrl_('STORE_TIKTOK_URL', CONFIG.defaultSocialUrls.tiktok)
        });

        MailApp.sendEmail({
          to: email,
          subject: subject,
          htmlBody: personalizedHtml,
          name: fromName
        });

        sent += 1;

        if (recipient.rowIndex && statusCol !== undefined) {
          rowUpdates.push({
            rowIndex: recipient.rowIndex,
            status: CONFIG.statusValues.sent,
            lastSentAt: new Date()
          });
        }
      } catch (err) {
        errors.push({
          email: email,
          message: String(err)
        });

        if (recipient.rowIndex && statusCol !== undefined) {
          rowUpdates.push({
            rowIndex: recipient.rowIndex,
            status: CONFIG.statusValues.error,
            lastSentAt: ''
          });
        }
      }
    });

    applyRowUpdates_(sheet, rowUpdates, statusCol, lastSentAtCol);

    if (enableCampaignDedupe && campaignId) {
      markCampaignProcessed_(campaignId);
    }

    logLastRunSummary_({
      campaignId: campaignId,
      subject: subject,
      attempted: attempted,
      sent: sent,
      failed: attempted - sent,
      queuedForRetry: queuedForRetry,
      quotaRemainingBeforeSend: mailQuotaRemaining,
      skipped: skipped,
      timestamp: new Date().toISOString()
    });

    return jsonOutput({
      ok: true,
      campaignId: campaignId || '',
      attempted: attempted,
      sent: sent,
      failed: attempted - sent,
      queuedForRetry: queuedForRetry,
      quotaRemainingBeforeSend: mailQuotaRemaining,
      skipped: skipped,
      errors: errors,
      quotaRemainingAfterSend: MailApp.getRemainingDailyQuota()
    });
  } catch (err) {
    return jsonOutput({
      ok: false,
      error: String(err)
    });
  }
}

/* =========================
   Helpers
========================= */

function parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('missing request body');
  }

  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    throw new Error('invalid json payload');
  }

  return payload || {};
}

function authorizeRequest_(payload) {
  const token = safeString_(payload.token);
  const storedToken = PropertiesService.getScriptProperties().getProperty('SEDIFEX_SHARED_TOKEN');

  if (!storedToken) {
    return { ok: false, reason: 'missing script property SEDIFEX_SHARED_TOKEN' };
  }

  return { ok: token && token === storedToken };
}

function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getStoreName() {
  return (
    PropertiesService.getScriptProperties().getProperty('STORE_NAME') ||
    CONFIG.defaultStoreName
  );
}

function getDefaultFromName_() {
  return (
    PropertiesService.getScriptProperties().getProperty('DEFAULT_FROM_NAME') ||
    CONFIG.defaultFromName
  );
}

function getSocialUrl_(propertyKey, fallbackValue) {
  const value = safeString_(PropertiesService.getScriptProperties().getProperty(propertyKey)).trim();
  return value || fallbackValue;
}

function getBooleanProperty_(key, defaultValue) {
  const raw = PropertiesService.getScriptProperties().getProperty(key);
  if (raw === null || raw === '') return defaultValue;
  return String(raw).toLowerCase() === 'true';
}

function getHeaderMap_(headerRow) {
  const map = {};
  const normalized = headerRow.map(function(h) {
    return safeString_(h).trim().toLowerCase();
  });

  normalized.forEach(function(h, i) {
    if (h) map[h] = i;
  });

  return map;
}

function buildSheetRecipients_(values, cols) {
  const rows = values.slice(1);

  return rows.map(function(row, index) {
    return {
      rowIndex: index + 2,
      email: cols.emailCol !== undefined ? safeString_(row[cols.emailCol]).trim() : '',
      name: cols.nameCol !== undefined ? safeString_(row[cols.nameCol]).trim() : '',
      status: cols.statusCol !== undefined ? safeString_(row[cols.statusCol]).trim() : '',
      lastSentAt: cols.lastSentAtCol !== undefined ? row[cols.lastSentAtCol] : '',
      notes: cols.notesCol !== undefined ? safeString_(row[cols.notesCol]).trim() : ''
    };
  });
}

function buildPayloadRecipients_(payloadRecipients) {
  return payloadRecipients.map(function(r) {
    return {
      rowIndex: null,
      email: safeString_(r && r.email).trim(),
      name: safeString_(r && r.name).trim(),
      id: safeString_(r && r.id).trim()
    };
  });
}

function normalizeAndDedupeRecipients_(recipients) {
  const seen = {};
  const cleaned = [];

  recipients.forEach(function(r) {
    const email = safeString_(r.email).trim().toLowerCase();
    if (!email) return;
    if (seen[email]) return;
    seen[email] = true;

    cleaned.push({
      rowIndex: r.rowIndex || null,
      email: email,
      name: safeString_(r.name).trim(),
      id: safeString_(r.id).trim()
    });
  });

  return cleaned;
}

function applyTemplate_(html, data) {
  let output = safeString_(html);

  Object.keys(data).forEach(function(key) {
    const value = safeString_(data[key]);
    const regex = new RegExp('{{\\s*' + escapeRegex_(key) + '\\s*}}', 'gi');
    output = output.replace(regex, value);
  });

  return output;
}

function appendBrandFooter_(html) {
  const content = safeString_(html);
  if (content.indexOf('{{instagram_url}}') !== -1 ||
      content.indexOf('{{facebook_url}}') !== -1 ||
      content.indexOf('{{tiktok_url}}') !== -1) {
    return content;
  }

  return content + [
    '',
    '<hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;">',
    '<p style="margin:0 0 8px;font-size:14px;color:#6b7280;">Connect with us:</p>',
    '<p style="margin:0;font-size:14px;">',
    '  <a href="{{instagram_url}}" style="color:#111827;text-decoration:none;margin-right:12px;">Instagram</a>',
    '  <a href="{{facebook_url}}" style="color:#111827;text-decoration:none;margin-right:12px;">Facebook</a>',
    '  <a href="{{tiktok_url}}" style="color:#111827;text-decoration:none;">TikTok</a>',
    '</p>'
  ].join('\n');
}

function applyRowUpdates_(sheet, rowUpdates, statusCol, lastSentAtCol) {
  if (!rowUpdates || !rowUpdates.length) return;

  rowUpdates.forEach(function(update) {
    if (statusCol !== undefined) {
      sheet.getRange(update.rowIndex, statusCol + 1).setValue(update.status);
    }
    if (lastSentAtCol !== undefined && update.lastSentAt) {
      sheet.getRange(update.rowIndex, lastSentAtCol + 1).setValue(update.lastSentAt);
    }
  });
}

function isCampaignAlreadyProcessed_(campaignId) {
  const key = 'campaign_' + campaignId;
  const value = PropertiesService.getScriptProperties().getProperty(key);
  return value === 'done';
}

function markCampaignProcessed_(campaignId) {
  const key = 'campaign_' + campaignId;
  PropertiesService.getScriptProperties().setProperty(key, 'done');
}

function logLastRunSummary_(summary) {
  PropertiesService.getScriptProperties().setProperty(
    'LAST_RUN_SUMMARY',
    JSON.stringify(summary)
  );
}

function isValidEmail_(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function extractFirstName_(name) {
  const clean = safeString_(name).trim();
  if (!clean) return '';
  return clean.split(/\s+/)[0];
}

function safeString_(value) {
  return value === null || value === undefined ? '' : String(value);
}

function escapeRegex_(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

## Payload example from Sedifex
```json
{
  "token": "shared-secret",
  "campaignId": "cmp_2026_04_18_001",
  "fromName": "Acme Store",
  "subject": "Weekend Promo",
  "html": "<p>Hello {{name}}, enjoy 10% off this weekend.</p>",
  "recipients": [
    { "id": "cus_1", "name": "Ama", "email": "ama@example.com" },
    { "id": "cus_2", "name": "Kojo", "email": "kojo@example.com" }
  ]
}
```

## Important notes
- Keep customer records in Sedifex only (avoid duplicate manual entry).
- Google sending quotas apply.
- Recipients marked `QUEUED` are deferred and will send on the next script run (for example, a scheduled trigger or a manual rerun).
- Rotate shared tokens when ownership/staff changes.
