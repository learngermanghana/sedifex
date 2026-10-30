export type EventPdfEntryStyle = 'body' | 'subheading' | 'bullet' | 'muted'

export type EventPdfEntry = {
  text: string
  style?: EventPdfEntryStyle
}

export type EventPdfSection = {
  title: string
  entries: EventPdfEntry[]
  pageBreakBefore?: boolean
}

export type EventPdfDocumentInput = {
  title: string
  subtitle?: string
  reference?: string
  generatedLabel?: string
  sections: EventPdfSection[]
}

type RenderLine = {
  text: string
  font: 'F1' | 'F2'
  size: number
  x: number
  leading: number
  before: number
  after: number
}

const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const MARGIN_X = 54
const TOP_Y = 730
const BOTTOM_Y = 58
const BODY_WIDTH = PAGE_WIDTH - MARGIN_X * 2

export function pdfSafeText(value: unknown) {
  return String(value ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/•/g, '-')
    .replace(/×/g, 'x')
    .replace(/·/g, '-')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

function escapePdfText(value: string) {
  return pdfSafeText(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

function approxChars(width: number, size: number) {
  return Math.max(18, Math.floor(width / Math.max(4.6, size * 0.52)))
}

export function wrapPdfText(value: string, maxChars: number) {
  const paragraphs = String(value ?? '').replace(/\r\n?/g, '\n').split('\n')
  const lines: string[] = []

  for (const paragraph of paragraphs) {
    const clean = pdfSafeText(paragraph)
    if (!clean) {
      lines.push('')
      continue
    }

    const words = clean.split(/\s+/)
    let current = ''
    for (const word of words) {
      if (!current) {
        if (word.length <= maxChars) {
          current = word
        } else {
          for (let index = 0; index < word.length; index += maxChars) {
            const part = word.slice(index, index + maxChars)
            if (part.length === maxChars) lines.push(part)
            else current = part
          }
        }
        continue
      }

      const next = `${current} ${word}`
      if (next.length <= maxChars) {
        current = next
      } else {
        lines.push(current)
        if (word.length <= maxChars) {
          current = word
        } else {
          current = ''
          for (let index = 0; index < word.length; index += maxChars) {
            const part = word.slice(index, index + maxChars)
            if (part.length === maxChars) lines.push(part)
            else current = part
          }
        }
      }
    }
    if (current) lines.push(current)
  }

  return lines.length ? lines : ['']
}

function bodyLines(entry: EventPdfEntry): RenderLine[] {
  const style = entry.style ?? 'body'
  if (style === 'subheading') {
    return wrapPdfText(entry.text, approxChars(BODY_WIDTH, 11)).map((text, index) => ({
      text,
      font: 'F2' as const,
      size: 11,
      x: MARGIN_X,
      leading: 15,
      before: index === 0 ? 7 : 0,
      after: index === 0 ? 2 : 0,
    }))
  }
  if (style === 'bullet') {
    return wrapPdfText(entry.text, approxChars(BODY_WIDTH - 16, 10)).map((text, index) => ({
      text: `${index === 0 ? '- ' : '  '}${text}`,
      font: 'F1' as const,
      size: 10,
      x: MARGIN_X + 12,
      leading: 14,
      before: 0,
      after: 0,
    }))
  }
  if (style === 'muted') {
    return wrapPdfText(entry.text, approxChars(BODY_WIDTH, 9)).map(text => ({
      text,
      font: 'F1' as const,
      size: 9,
      x: MARGIN_X,
      leading: 13,
      before: 0,
      after: 0,
    }))
  }
  return wrapPdfText(entry.text, approxChars(BODY_WIDTH, 10)).map(text => ({
    text,
    font: 'F1' as const,
    size: 10,
    x: MARGIN_X,
    leading: 14,
    before: 0,
    after: 0,
  }))
}

function textCommand(line: RenderLine, y: number) {
  return `BT /${line.font} ${line.size} Tf 1 0 0 1 ${line.x} ${y} Tm (${escapePdfText(line.text)}) Tj ET\n`
}

function headerCommand(title: string, reference: string) {
  // The running title and reference have separate reserved columns.
  // Truncation here never changes the full title in the document body.
  const shortTitle = title.length > 52 ? title.slice(0, 49) + '...' : title
  const shortReference = reference.length > 22 ? reference.slice(0, 19) + '...' : reference
  const commands = [`BT /F2 8 Tf 1 0 0 1 ${MARGIN_X} 765 Tm (${escapePdfText(shortTitle)}) Tj ET\n`]
  if (shortReference) commands.push(`BT /F1 8 Tf 1 0 0 1 438 765 Tm (${escapePdfText(shortReference)}) Tj ET\n`)
  commands.push(`0.88 G ${MARGIN_X} 754 m ${PAGE_WIDTH - MARGIN_X} 754 l S\n`)
  return commands.join('')
}

function footerCommand(pageNumber: number) {
  return `0.88 G ${MARGIN_X} 43 m ${PAGE_WIDTH - MARGIN_X} 43 l S\nBT /F1 8 Tf 1 0 0 1 ${MARGIN_X} 28 Tm (Generated with Sedifex) Tj ET\nBT /F1 8 Tf 1 0 0 1 490 28 Tm (Page ${pageNumber} PAGE_TOTAL) Tj ET\n`
}

function newPage(headerTitle: string, reference: string, pageNumber: number) {
  return {
    y: TOP_Y,
    content: `${headerCommand(headerTitle, reference)}${footerCommand(pageNumber)}`,
  }
}

export function buildEventPdfDocument(input: EventPdfDocumentInput): Uint8Array {
  const title = pdfSafeText(input.title) || 'Event document'
  const subtitle = pdfSafeText(input.subtitle)
  const reference = pdfSafeText(input.reference)
  const generatedLabel = pdfSafeText(input.generatedLabel || `Generated ${new Date().toLocaleString('en-GB')}`)
  const pages: string[] = []
  let pageNumber = 1
  let page = newPage(title, reference, pageNumber)

  function flushPage() {
    pages.push(page.content)
    pageNumber += 1
    page = newPage(title, reference, pageNumber)
  }

  function ensureSpace(height: number) {
    if (page.y - height < BOTTOM_Y) flushPage()
  }

  function draw(line: RenderLine) {
    ensureSpace(line.before + line.leading + line.after)
    page.y -= line.before
    page.content += textCommand(line, page.y)
    page.y -= line.leading + line.after
  }

  wrapPdfText(title, approxChars(BODY_WIDTH, 20)).forEach((line, index) => {
    draw({ text: line, font: 'F2', size: 20, x: MARGIN_X, leading: 25, before: index === 0 ? 8 : 0, after: 0 })
  })
  if (subtitle) {
    wrapPdfText(subtitle, approxChars(BODY_WIDTH, 12)).forEach(line => {
      draw({ text: line, font: 'F1', size: 12, x: MARGIN_X, leading: 17, before: 1, after: 0 })
    })
  }
  if (reference) draw({ text: `Reference: ${reference}`, font: 'F2', size: 10, x: MARGIN_X, leading: 15, before: 8, after: 0 })
  draw({ text: generatedLabel, font: 'F1', size: 9, x: MARGIN_X, leading: 14, before: 0, after: 10 })

  for (const section of input.sections) {
    // Keep sections together where practical, but do not waste a whole page
    // for every short section in a combined Event Pack.
    if (section.pageBreakBefore && page.y < TOP_Y - 300) flushPage()
    ensureSpace(78)

    // A shaded section heading makes multi-section event packs easy to scan.
    const barY = page.y - 26
    page.content += `0.92 0.95 0.99 rg ${MARGIN_X} ${barY} ${BODY_WIDTH} 29 re f\n`
    page.content += textCommand({
      text: section.title.toUpperCase(), font: 'F2', size: 12,
      x: MARGIN_X + 11, leading: 16, before: 0, after: 0,
    }, page.y - 17)
    page.y -= 42

    if (!section.entries.length) {
      draw({ text: 'No records yet.', font: 'F1', size: 10, x: MARGIN_X + 4, leading: 14, before: 0, after: 6 })
      continue
    }
    for (const entry of section.entries) {
      // Avoid a lonely subheading at the foot of a page.
      if (entry.style === 'subheading') ensureSpace(48)
      const lines = bodyLines(entry)
      lines.forEach((line, index) => {
        const inset = entry.style === 'subheading' ? 4 : 0
        draw({ ...line, x: line.x + inset, after: index === lines.length - 1 ? 3 : line.after })
      })
    }
    page.y -= 7
  }

  pages.push(page.content)
  const completedPages = pages.map(content => content.replace(/PAGE_TOTAL/g, `of ${pages.length}`))

  const encoder = new TextEncoder()
  const objects = new Map<number, Uint8Array>()
  const catalogId = 1
  const pagesId = 2
  const regularFontId = 3
  const boldFontId = 4
  const pageObjectIds: number[] = []

  objects.set(regularFontId, encoder.encode(`${regularFontId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`))
  objects.set(boldFontId, encoder.encode(`${boldFontId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`))

  completedPages.forEach((content, index) => {
    const pageId = 5 + index * 2
    const contentId = pageId + 1
    pageObjectIds.push(pageId)
    const contentBytes = encoder.encode(content)
    objects.set(contentId, encoder.encode(`${contentId} 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n${content}\nendstream\nendobj\n`))
    objects.set(pageId, encoder.encode(`${pageId} 0 obj\n<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >> >>\nendobj\n`))
  })

  objects.set(pagesId, encoder.encode(`${pagesId} 0 obj\n<< /Type /Pages /Kids [${pageObjectIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>\nendobj\n`))
  objects.set(catalogId, encoder.encode(`${catalogId} 0 obj\n<< /Type /Catalog /Pages ${pagesId} 0 R >>\nendobj\n`))

  const maxObjectId = 4 + completedPages.length * 2
  const header = encoder.encode('%PDF-1.4\n')
  const ordered: Uint8Array[] = []
  const offsets = new Array(maxObjectId + 1).fill(0)
  let offset = header.length

  for (let id = 1; id <= maxObjectId; id += 1) {
    const bytes = objects.get(id)
    if (!bytes) throw new Error(`Missing PDF object ${id}`)
    offsets[id] = offset
    ordered.push(bytes)
    offset += bytes.length
  }

  const xrefOffset = offset
  let xref = `xref\n0 ${maxObjectId + 1}\n0000000000 65535 f \n`
  for (let id = 1; id <= maxObjectId; id += 1) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  const trailer = `trailer\n<< /Size ${maxObjectId + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  const parts = [header, ...ordered, encoder.encode(xref), encoder.encode(trailer)]
  const length = parts.reduce((sum, bytes) => sum + bytes.length, 0)
  const result = new Uint8Array(length)
  let cursor = 0
  for (const bytes of parts) {
    result.set(bytes, cursor)
    cursor += bytes.length
  }
  return result
}

export function downloadEventPdfBytes(bytes: Uint8Array, fileName: string) {
  const browserBytes = new Uint8Array(bytes.byteLength)
  browserBytes.set(bytes)
  const blob = new Blob([browserBytes.buffer], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Keep the Blob URL alive long enough for slow/mobile browsers and for
  // the explicit fallback download link shown by EventPdfExportDock.
  window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000)
  return url
}
