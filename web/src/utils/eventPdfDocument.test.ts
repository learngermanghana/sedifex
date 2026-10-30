import { describe, expect, test } from 'vitest'
import { buildEventPdfDocument, pdfSafeText, wrapPdfText } from './eventPdfDocument'

describe('event PDF document builder', () => {
  test('normalizes unsupported punctuation for core PDF fonts', () => {
    expect(pdfSafeText('Décor — Sandra’s “event”')).toBe("Decor - Sandra's \"event\"")
  })

  test('wraps long content without losing words', () => {
    const lines = wrapPdfText('one two three four five six seven eight', 12)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.join(' ')).toContain('one two three')
    expect(lines.join(' ')).toContain('seven eight')
  })

  test('creates a valid multi-page event pack', () => {
    const entries = Array.from({ length: 180 }, (_, index) => ({
      text: `Checklist item ${index + 1}: confirm vendor responsibility and event-day readiness before the client arrival.`,
      style: 'bullet' as const,
    }))

    const pdf = buildEventPdfDocument({
      title: 'Sandra & Kojo Wedding - Event Pack',
      subtitle: 'Elite Core Events | Client: Sandra Asante',
      reference: 'ECE-2026-12345',
      sections: [
        { title: 'Event summary', entries: [{ text: 'Venue: Accra' }] },
        { title: 'Planning checklist', entries, pageBreakBefore: true },
      ],
    })

    const text = new TextDecoder('latin1').decode(pdf)
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text).toContain('/Type /Catalog')
    expect(text).toContain('PLANNING CHECKLIST')
    expect(text).toMatch(/\/Count [2-9]/)
  })

  test('paginates large event packs and labels each page with its total', () => {
    const pdf = buildEventPdfDocument({
      title: 'Annual Corporate Celebration and Fundraising Gala',
      reference: 'EVENT-2026-WITH-A-VERY-LONG-REFERENCE-NUMBER',
      sections: [
        {
          title: 'Planning checklist',
          entries: Array.from({ length: 160 }, (_, i) => ({
            text: String(i + 1) + '. Confirm guest arrangements, supplies, vendors and schedule before opening',
            style: 'bullet' as const,
          })),
          pageBreakBefore: true,
        },
        { title: 'Event program', entries: [{ text: '10:00 - Guest arrival' }] },
      ],
    })
    const content = new TextDecoder('latin1').decode(pdf)
    const totalPages = Number(content.match(/\/Count (\d+)/)?.[1] || 0)
    expect(totalPages).toBeGreaterThan(2)
    expect(content).toContain('Page 1 of ' + totalPages)
    expect(content).toContain('Page ' + totalPages + ' of ' + totalPages)
    expect(content).toContain('EVENT PROGRAM')
    expect(content).toContain('PLANNING CHECKLIST')
  })

  test('keeps short sections compact without forcing each onto a new page', () => {
    const pdf = buildEventPdfDocument({
      title: 'Small Event',
      sections: [
        { title: 'Event summary', entries: [{ text: 'Event: Small Event' }] },
        { title: 'Client brief', entries: [{ text: 'Venue: Accra' }], pageBreakBefore: true },
        { title: 'Package', entries: [{ text: 'Tables and catering' }], pageBreakBefore: true },
      ],
    })
    const content = new TextDecoder('latin1').decode(pdf)
    expect(content).toContain('/Count 1')
    expect(content).toContain('CLIENT BRIEF')
    expect(content).toContain('Tables and catering')
  })

})
