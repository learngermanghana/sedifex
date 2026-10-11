import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { waitFor } from '@testing-library/dom'
const root = process.cwd()
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const data = JSON.parse(read('content/help-guides.json'))
afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals() })
it('renders every guide with complete content and discoverable canonical URLs without JavaScript', () => {
  for (const guide of data.guides) {
    const doc = new DOMParser().parseFromString(read(`public/help/${guide.slug}.html`), 'text/html')
    expect(doc.querySelector('h1')?.textContent).toBe(guide.title)
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(`https://sedifex.com/help/${guide.slug}.html`)
    for (const section of guide.sections) expect(doc.body.textContent).toContain(section.title)
    expect(read('public/sitemap.xml')).toContain(`/help/${guide.slug}.html`)
    expect(read(`public/help/${guide.slug}.txt`)).toContain('Never ask me to paste passwords')
  }
})
it('documents a read-only integration request with the canonical version and placeholder credentials', () => {
  const text = read('public/help/integrations.txt')
  expect(text).toContain('v1IntegrationProducts')
  expect(text).toContain('X-Sedifex-Contract-Version: 2026-04-13')
  expect(text).toContain('YOUR_INTEGRATION_KEY')
  expect(text).toContain('docs/integration-contract.md')
})
it('filters the guide index', () => {
  document.body.innerHTML = new DOMParser().parseFromString(read('public/help.html'), 'text/html').body.innerHTML
  new Function(read('public/help/help.js'))()
  const search = document.querySelector<HTMLInputElement>('#help-search')!
  search.value = 'integrations'; search.dispatchEvent(new Event('input'))
  const visible = [...document.querySelectorAll<HTMLElement>('[data-guide]')].filter(card => !card.hidden)
  expect(visible.length).toBeGreaterThan(0)
  expect(visible.length).toBeLessThan(data.guides.length)
})
it('copies the full guide and keeps a manual fallback when copying fails', async () => {
  document.body.innerHTML = new DOMParser().parseFromString(read('public/help/integrations.html'), 'text/html').body.innerHTML
  const text = read('public/help/integrations.txt')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => text }))
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  new Function(read('public/help/help.js'))()
  const button = document.querySelector<HTMLButtonElement>('[data-copy-url]')!
  button.click()
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(text))
  await waitFor(() => expect(button.disabled).toBe(false))
  writeText.mockRejectedValueOnce(new Error('Unavailable'))
  button.click()
  await waitFor(() => expect(document.querySelector('.copy-status')?.textContent).toContain('manually'))
  expect(document.querySelector('a[href="/help/integrations.txt"]')).toBeTruthy()
  expect(button.disabled).toBe(false)
})
