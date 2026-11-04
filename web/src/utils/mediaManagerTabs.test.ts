import { describe, expect, it } from 'vitest'
import { legacyGalleryHref, mediaManagerTabHref, resolveMediaManagerTab } from './mediaManagerTabs'

describe('centralized Media Manager navigation', () => {
  it('opens pictures by default and accepts only recognized tabs', () => {
    expect(resolveMediaManagerTab(null)).toBe('pictures')
    expect(resolveMediaManagerTab('upload')).toBe('upload')
    expect(resolveMediaManagerTab('albums')).toBe('albums')
    expect(resolveMediaManagerTab('usage')).toBe('usage')
    expect(resolveMediaManagerTab('gallery')).toBe('pictures')
  })

  it('preserves the requested album in direct links', () => {
    expect(mediaManagerTabHref('albums', 'graduation-2026'))
      .toBe('/media-library?tab=albums&album=graduation-2026')
    expect(mediaManagerTabHref('pictures')).toBe('/media-library?tab=pictures')
  })

  it('redirects existing /gallery bookmarks to Albums without losing parameters', () => {
    expect(legacyGalleryHref('')).toBe('/media-library?tab=albums')
    expect(legacyGalleryHref('?album=photos&tab=upload'))
      .toBe('/media-library?album=photos&tab=albums')
  })
})
