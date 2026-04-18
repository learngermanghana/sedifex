# Sedifex Bulk Email: Google Sheets + Apps Script Setup

Use this guide when each store should own its Google Sheet and Apps Script deployment, while Sedifex remains the single source of truth for customers.

## Architecture
- Sedifex stores customers and campaign audience logic.
- Store owner provides a Google Apps Script Web App endpoint.
- Sedifex sends campaign payload (`subject`, `html`, recipients JSON) to that endpoint.
- Apps Script sends emails and returns a summary to Sedifex.

## Setup steps
1. Store owner creates a Google Sheet.
2. In **Extensions → Apps Script**, paste the Sedifex Apps Script sample.
3. Add Script Property: `SEDIFEX_SHARED_TOKEN`.
4. Deploy as **Web App** and copy deployment URL.
5. In Sedifex, open **Account → Integrations → Bulk Email (Google Sheets)**.
6. Paste Web App URL + shared token, then verify connection.

## Apps Script sample (starter)
```javascript
function doPost(e) {
  const payload = JSON.parse(e.postData.contents || '{}')
  const token = payload?.token || ''

  if (token !== PropertiesService.getScriptProperties().getProperty('SEDIFEX_SHARED_TOKEN')) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'unauthorized' }))
      .setMimeType(ContentService.MimeType.JSON)
  }

  const recipients = Array.isArray(payload.recipients) ? payload.recipients : []
  let sent = 0

  recipients.forEach((row) => {
    const email = (row?.email || '').toString().trim()
    if (!email) return

    MailApp.sendEmail({
      to: email,
      subject: payload.subject || 'Update from your store',
      htmlBody: payload.html || '',
      name: payload.fromName || 'Sedifex Campaign',
    })
    sent += 1
  })

  return ContentService.createTextOutput(JSON.stringify({
    ok: true,
    attempted: recipients.length,
    sent,
  })).setMimeType(ContentService.MimeType.JSON)
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
- Keep customer records in Sedifex only (no duplicate manual entry).
- Google sending quotas apply.
- Rotate shared tokens when ownership/staff changes.
