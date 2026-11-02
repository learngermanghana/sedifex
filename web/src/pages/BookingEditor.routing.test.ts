import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const editor = readFileSync('src/pages/BookingEditor.tsx', 'utf8')
const bookingSync = readFileSync('../functions/src/integrationBookingSync.ts', 'utf8')
const appsScriptTemplate = readFileSync('../docs/booking-apps-script-template.md', 'utf8')

describe('store-isolated booking Apps Script delivery', () => {
  it('never posts booking/customer data to a shared Apps Script URL from the client', () => {
    expect(editor).not.toContain('script.google.com')
    expect(editor).not.toContain('syncBookingToSheet(')
    expect(editor).not.toContain('bookingAppsScriptUrl')
  })

  it('stores its workspace ID for the server-side sync handler', () => {
    expect(editor).toMatch(/bookingId: targetId,\s*booking_id: targetId,\s*storeId,\s*store_id: storeId,\s*syncStatus: 'pending'/)
    expect(bookingSync).toContain('const storeId = firstText([data.storeId, data.store_id], 180)')
    expect(bookingSync).toContain('const config = await loadBookingSyncConfig(storeId)')
    expect(bookingSync).toContain('postToAppsScript(config.url, payload, config.secret)')
    expect(bookingSync).toContain('if (result.ok === false)')
  })

  it('requires a matching store ID and explicit BCC in the Apps Script template', () => {
    expect(appsScriptTemplate).toContain("requireSecret: true")
    expect(appsScriptTemplate).toContain("const got = str_(body.secret || '')")
    expect(appsScriptTemplate).toContain("SEDIFEX_EXPECTED_STORE_ID")
    expect(appsScriptTemplate).toContain("error: 'store-id-mismatch'")
    expect(appsScriptTemplate).toContain("const bcc = str_(branding.notificationBccEmail || '')")
    expect(appsScriptTemplate).not.toContain('branding.notificationBccEmail || branding.supportEmail')
  })
})
