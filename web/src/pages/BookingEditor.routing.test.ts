import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const editor = readFileSync(new URL('./BookingEditor.tsx', import.meta.url), 'utf8')
const bookingSync = readFileSync(new URL('../../../functions/src/integrationBookingSync.ts', import.meta.url), 'utf8')
const appsScriptTemplate = readFileSync(new URL('../../../docs/booking-apps-script-template.md', import.meta.url), 'utf8')

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
  })

  it('requires a matching store ID and explicit BCC in the Apps Script template', () => {
    expect(appsScriptTemplate).toContain("requireSecret: true")
    expect(appsScriptTemplate).toContain("SEDIFEX_EXPECTED_STORE_ID")
    expect(appsScriptTemplate).toContain("error: 'store-id-mismatch'")
    expect(appsScriptTemplate).toContain("const bcc = str_(branding.notificationBccEmail || '')")
    expect(appsScriptTemplate).not.toContain('branding.notificationBccEmail || branding.supportEmail')
  })
})
