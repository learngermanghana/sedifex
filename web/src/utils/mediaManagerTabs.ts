export type MediaManagerTab = 'pictures' | 'albums' | 'upload' | 'usage'

const validTabs: ReadonlySet<string> = new Set(['pictures', 'albums', 'upload', 'usage'])

export function resolveMediaManagerTab(value: string | null): MediaManagerTab {
  return value && validTabs.has(value) ? value as MediaManagerTab : 'pictures'
}

export function mediaManagerTabHref(tab: MediaManagerTab, albumId?: string): string {
  const params = new URLSearchParams({ tab })
  if (tab === 'albums' && albumId) params.set('album', albumId)
  return '/media-library?' + params.toString()
}

export function legacyGalleryHref(search: string): string {
  const params = new URLSearchParams(search)
  params.set('tab', 'albums')
  return '/media-library?' + params.toString()
}
