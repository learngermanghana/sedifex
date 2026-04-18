import React from 'react'
import DocsPageLayout from '../../components/docs/DocsPageLayout'

const APPS_SCRIPT_SAMPLE = `/**
 * Sedifex Bulk Email Web App endpoint
 * Deploy: Deploy > New deployment > Web app
 * Execute as: Me
 * Who has access: Anyone with the link (or restricted if you validate OAuth)
 */
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}')
    const token = payload?.token || ''

    // 1) Validate shared secret from Sedifex
    if (token !== PropertiesService.getScriptProperties().getProperty('SEDIFEX_SHARED_TOKEN')) {
      return jsonResponse({ ok: false, error: 'unauthorized' }, 401)
    }

    // 2) Sedifex remains source of truth (customers passed in payload)
    const campaignId = payload.campaignId || ''
    const subject = payload.subject || 'Update from your store'
    const html = payload.html || ''
    const recipients = Array.isArray(payload.recipients) ? payload.recipients : []

    let sent = 0
    const failures = []

    recipients.forEach((row) => {
      const email = (row?.email || '').toString().trim()
      if (!email) return

      try {
        MailApp.sendEmail({
          to: email,
          subject,
          htmlBody: html,
          name: payload.fromName || 'Sedifex Campaign',
          noReply: false,
        })
        sent += 1
      } catch (err) {
        failures.push({ email, error: String(err) })
      }
    })

    // 3) Optional logging in a tab named "send_logs"
    logSendResult(campaignId, sent, failures.length)

    return jsonResponse({
      ok: true,
      campaignId,
      attempted: recipients.length,
      sent,
      failed: failures.length,
      failures,
    })
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) }, 500)
  }
}

function logSendResult(campaignId, sent, failed) {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const sheet = ss.getSheetByName('send_logs') || ss.insertSheet('send_logs')
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['timestamp', 'campaignId', 'sent', 'failed'])
  }
  sheet.appendRow([new Date().toISOString(), campaignId, sent, failed])
}

function jsonResponse(data, statusCode) {
  return ContentService
    .createTextOutput(JSON.stringify({ statusCode, ...data }))
    .setMimeType(ContentService.MimeType.JSON)
}`

export default function BulkEmailGoogleSheetsPage() {
  return (
    <DocsPageLayout
      title="Bulk Email setup (Google Sheets + Apps Script)"
      subtitle="Connect each store's own Sheet and Apps Script while keeping Sedifex as the customer source of truth."
    >
      <section>
        <h2>Architecture (recommended)</h2>
        <ul>
          <li><strong>Sedifex = source of truth</strong> for customers and audience filtering.</li>
          <li>Each store owns its Google Sheet + Apps Script deployment.</li>
          <li>When a campaign is sent, Sedifex posts a JSON payload to the store's script endpoint.</li>
          <li>No duplicate client entry in Sheets.</li>
        </ul>
      </section>

      <section>
        <h2>Step 1: Create a Google Sheet for the store</h2>
        <ol>
          <li>Create a new Sheet in the store owner's Google account.</li>
          <li>(Optional) Add tabs like <code>send_logs</code> and <code>config</code>.</li>
          <li>Keep the Sheet URL handy so the owner can verify they connected the right file.</li>
        </ol>
      </section>

      <section>
        <h2>Step 2: Add Apps Script and deploy as a Web App</h2>
        <ol>
          <li>Open the Sheet, then go to <strong>Extensions → Apps Script</strong>.</li>
          <li>Paste this starter script and save.</li>
          <li>Set a Script Property called <code>SEDIFEX_SHARED_TOKEN</code>.</li>
          <li>
            Deploy as Web App and copy the deployment URL (this is what Sedifex will call).
          </li>
        </ol>
        <pre><code>{APPS_SCRIPT_SAMPLE}</code></pre>
      </section>

      <section>
        <h2>Step 3: Connect in Sedifex</h2>
        <ol>
          <li>Open <strong>Account → Integrations</strong>.</li>
          <li>Choose <strong>Bulk Email (Google Sheets)</strong>.</li>
          <li>Paste the Web App URL.</li>
          <li>Paste the same shared token used in Script Properties.</li>
          <li>Click <strong>Verify connection</strong>.</li>
        </ol>
      </section>

      <section>
        <h2>Step 4: Send a campaign</h2>
        <ol>
          <li>Select audience in Sedifex from your Customers data.</li>
          <li>Compose subject + content in Sedifex.</li>
          <li>Click send. Sedifex posts recipients JSON to the store script endpoint.</li>
          <li>Script sends via Google MailApp and returns delivery summary to Sedifex.</li>
        </ol>
      </section>

      <section>
        <h2>Payload example from Sedifex</h2>
        <pre><code>{`{
  "token": "shared-secret",
  "campaignId": "cmp_2026_04_18_001",
  "fromName": "Acme Store",
  "subject": "Weekend Promo",
  "html": "<p>Hello {{name}}, enjoy 10% off this weekend.</p>",
  "recipients": [
    { "id": "cus_1", "name": "Ama", "email": "ama@example.com" },
    { "id": "cus_2", "name": "Kojo", "email": "kojo@example.com" }
  ]
}`}</code></pre>
      </section>

      <section>
        <h2>Operational notes</h2>
        <ul>
          <li>Google quotas apply; add throttling and retries for high volume.</li>
          <li>Rotate shared tokens on staff/ownership changes.</li>
          <li>Keep send logs in both Sedifex and Sheets for troubleshooting.</li>
        </ul>
      </section>
    </DocsPageLayout>
  )
}
