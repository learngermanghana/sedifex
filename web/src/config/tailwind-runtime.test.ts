import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('shared Tailwind utilities', () => {
  it('keeps utility styles for pages that still use Tailwind after the website editor was retired', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
    const configIndex = html.indexOf('window.tailwind.config')
    const runtimeIndex = html.indexOf('src="https://cdn.tailwindcss.com"')

    expect(configIndex).toBeGreaterThan(-1)
    expect(html).toMatch(/corePlugins:\s*\{\s*preflight:\s*false/)
    expect(runtimeIndex).toBeGreaterThan(configIndex)
    expect(html).not.toContain('website-template-enhancements')
    expect(html).not.toContain('website-template-apply-bridge')
  })
})
