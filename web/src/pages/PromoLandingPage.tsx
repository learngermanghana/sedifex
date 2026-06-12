import SafeFirebaseImage from '../components/SafeFirebaseImage'
import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { normalizeGhanaPhoneDigits } from '../utils/phone'

import './PromoLandingPage.css'

type PromoProfile = {
  storeId: string
  storeName: string
  storePhone: string | null
  promoEnabled: boolean
  title: string | null
  summary: string | null
  startDate: string | null
  endDate: string | null
  websiteUrl: string | null
  youtubeUrl: string | null
  youtubeEmbedUrl: string | null
  youtubeChannelId: string | null
  youtubeVideos: Array<{
    videoId: string
    title: string | null
    watchUrl: string
    embedUrl: string
    thumbnailUrl: string | null
    publishedAt: string | null
  }>
  imageUrl: string | null
  imageAlt: string | null
}

type PromoGalleryItem = {
  id: string
  url: string
  alt: string | null
  caption: string | null
  sortOrder: number
}

type BlogPost = {
  id: string
  title: string
  slug: string
  excerpt: string | null
  content: string
  imageUrl: string | null
  tags: string[]
  linkUrl: string | null
}

type PromoApiResponse = {
  promo?: {
    enabled?: boolean
    slug?: string | null
    title?: string | null
    summary?: string | null
    startDate?: string | null
    endDate?: string | null
    websiteUrl?: string | null
    youtubeUrl?: string | null
    youtubeEmbedUrl?: string | null
    youtubeChannelId?: string | null
    youtubeVideos?: Array<{
      videoId?: string | null
      title?: string | null
      watchUrl?: string | null
      embedUrl?: string | null
      thumbnailUrl?: string | null
      publishedAt?: string | null
    }>
    imageUrl?: string | null
    imageAlt?: string | null
    phone?: string | null
    storeName?: string | null
  }
  storeId?: string
}

type PromoGalleryApiResponse = {
  gallery?: Array<{
    id?: string
    url?: string
    alt?: string | null
    caption?: string | null
    sortOrder?: number
    isPublished?: boolean
  }>
}

type CatalogItem = {
  id: string
  name: string
  description: string | null
  category: string | null
  price: number | null
  imageUrl: string | null
  imageAlt: string | null
  itemType: 'product' | 'service' | 'course' | 'made_to_order'
}

type CatalogApiResponse = {
  products?: Array<{
    id?: string
    name?: string
    description?: string | null
    category?: string | null
    price?: number | null
    imageUrl?: string | null
    imageAlt?: string | null
    itemType?: 'product' | 'service' | 'course' | 'made_to_order'
  }>
}

type BlogApiResponse = {
  items?: Array<{
    id?: string
    title?: string
    slug?: string
    excerpt?: string | null
    content?: string
    imageUrl?: string | null
    linkUrl?: string | null
    tags?: string[]
  }>
}

type CatalogFilter = 'all' | 'product' | 'service' | 'course' | 'made_to_order'

const FEATURED_CATALOG_LIMIT = 6
const FEATURED_BLOG_LIMIT = 3
const FEATURED_GALLERY_LIMIT = 6
const CATALOG_DESCRIPTION_PREVIEW_LENGTH = 150
const BLOG_DESCRIPTION_PREVIEW_LENGTH = 150

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
}

function sanitizeSummary(value: string | null, storeName: string): string {
  if (!value) {
    return `Everything publicly available for ${storeName} is organized here: offers, products, services, courses, blog updates, and gallery highlights.`
  }

  const compact = value.replace(/\s+/g, ' ').trim()
  if (compact.length < 16) {
    return `Explore offers, updates, and available services from ${storeName}.`
  }

  return compact
}

function compactText(value: string | null | undefined, fallback = ''): string {
  const normalized = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  return normalized || fallback
}

function previewText(value: string | null | undefined, length: number): string {
  const normalized = compactText(value)
  if (!normalized) return ''
  if (normalized.length <= length) return normalized
  return `${normalized.slice(0, length).replace(/\s+\S*$/, '').trim()}…`
}

function toYoutubeEmbedUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const parsed = new URL(value)
    const hostname = parsed.hostname.toLowerCase()
    if (hostname === 'youtu.be') {
      const id = parsed.pathname.replace(/^\/+/, '').split('/')[0]?.trim()
      return id ? `https://www.youtube.com/embed/${id}` : null
    }
    if (hostname === 'www.youtube.com' || hostname === 'youtube.com' || hostname === 'm.youtube.com') {
      const watchId = parsed.searchParams.get('v')?.trim()
      if (watchId) return `https://www.youtube.com/embed/${watchId}`
      const parts = parsed.pathname.split('/').filter(Boolean)
      const embedIndex = parts.findIndex(part => part === 'embed' || part === 'shorts')
      if (embedIndex >= 0 && parts[embedIndex + 1]) {
        return `https://www.youtube.com/embed/${parts[embedIndex + 1].trim()}`
      }
    }
  } catch {
    return null
  }
  return null
}

function formatPublishedDate(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function normalizePhoneForLinks(value: string | null): string | null {
  if (!value) return null
  const digits = normalizeGhanaPhoneDigits(value)
  return digits || null
}

function buildWhatsAppLink(phone: string | null, storeName: string): string | null {
  const normalized = normalizePhoneForLinks(phone)
  if (!normalized) return null
  const text = encodeURIComponent(`Hello ${storeName}, I saw your Sedifex page and need more details.`)
  return `https://wa.me/${normalized}?text=${text}`
}

function getIntegrationEndpoint(path: string): string {
  const functionsRegion = import.meta.env.VITE_FB_FUNCTIONS_REGION ?? 'us-central1'
  const projectId = import.meta.env.VITE_FB_PROJECT_ID
  if (!projectId) {
    throw new Error('Missing Firebase project configuration for promo endpoint')
  }
  return `https://${functionsRegion}-${projectId}.cloudfunctions.net/${path}`
}

function setOrCreateMetaTag(attribute: 'name' | 'property', key: string, content: string) {
  let tag = document.head.querySelector(`meta[${attribute}="${key}"]`) as HTMLMetaElement | null
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attribute, key)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

function catalogTypeLabel(type: CatalogItem['itemType']) {
  if (type === 'course') return 'Course'
  if (type === 'service') return 'Service'
  if (type === 'made_to_order') return 'Made to order'
  return 'Product'
}

function formatPrice(value: number | null) {
  if (typeof value !== 'number') return null
  return `GHS ${value.toFixed(2)}`
}

function itemMatchesSearch(item: CatalogItem, searchTerm: string) {
  if (!searchTerm) return true
  const searchableText = [item.name, item.description ?? '', item.category ?? '', item.id, item.itemType]
    .join(' ')
    .toLowerCase()
  return searchableText.includes(searchTerm)
}

function blogMatchesSearch(item: BlogPost, searchTerm: string) {
  if (!searchTerm) return true
  const searchableText = [item.title, item.excerpt ?? '', item.content, item.slug, ...(item.tags ?? [])]
    .join(' ')
    .toLowerCase()
  return searchableText.includes(searchTerm)
}

function galleryMatchesSearch(item: PromoGalleryItem, searchTerm: string) {
  if (!searchTerm) return true
  const searchableText = [item.alt ?? '', item.caption ?? '', item.id].join(' ').toLowerCase()
  return searchableText.includes(searchTerm)
}

export default function PromoLandingPage() {
  const { slug = '' } = useParams()
  const [profile, setProfile] = useState<PromoProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [gallery, setGallery] = useState<PromoGalleryItem[]>([])
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([])
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([])
  const [activeGalleryImageId, setActiveGalleryImageId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>('all')
  const [expandedCatalogDescriptions, setExpandedCatalogDescriptions] = useState<Record<string, boolean>>({})

  const activeGalleryIndex = useMemo(() => {
    if (!activeGalleryImageId) return -1
    return gallery.findIndex(item => item.id === activeGalleryImageId)
  }, [activeGalleryImageId, gallery])

  const activeGalleryItem = activeGalleryIndex >= 0 ? gallery[activeGalleryIndex] : null
  const normalizedSearchTerm = searchTerm.trim().toLowerCase()

  const catalogItemsWithImages = useMemo(
    () => catalogItems.filter(item => typeof item.imageUrl === 'string' && item.imageUrl.trim().length > 0),
    [catalogItems],
  )

  const filteredCatalogItems = useMemo(() => {
    return catalogItemsWithImages.filter(item => {
      const matchesType = catalogFilter === 'all' || item.itemType === catalogFilter
      return matchesType && itemMatchesSearch(item, normalizedSearchTerm)
    })
  }, [catalogFilter, catalogItemsWithImages, normalizedSearchTerm])

  const filteredBlogPosts = useMemo(
    () => blogPosts.filter(item => blogMatchesSearch(item, normalizedSearchTerm)),
    [blogPosts, normalizedSearchTerm],
  )

  const filteredGallery = useMemo(
    () => gallery.filter(item => galleryMatchesSearch(item, normalizedSearchTerm)),
    [gallery, normalizedSearchTerm],
  )

  const featuredCatalogItems = filteredCatalogItems.slice(0, FEATURED_CATALOG_LIMIT)
  const featuredBlogPosts = filteredBlogPosts.slice(0, FEATURED_BLOG_LIMIT)
  const featuredGalleryItems = filteredGallery.slice(0, FEATURED_GALLERY_LIMIT)
  const productsCount = catalogItemsWithImages.filter(item => item.itemType === 'product' || item.itemType === 'made_to_order').length
  const servicesCount = catalogItemsWithImages.filter(item => item.itemType === 'service').length
  const coursesCount = catalogItemsWithImages.filter(item => item.itemType === 'course').length

  function getCatalogDescriptionPreview(value: string): { text: string; isTruncated: boolean } {
    const normalized = value.replace(/\s+/g, ' ').trim()
    if (normalized.length <= CATALOG_DESCRIPTION_PREVIEW_LENGTH) {
      return { text: normalized, isTruncated: false }
    }
    const clipped = normalized.slice(0, CATALOG_DESCRIPTION_PREVIEW_LENGTH)
    const safeClip = clipped.replace(/\s+\S*$/, '').trim()
    return { text: `${safeClip}…`, isTruncated: true }
  }

  function toggleCatalogDescription(itemId: string) {
    setExpandedCatalogDescriptions(previous => ({
      ...previous,
      [itemId]: !previous[itemId],
    }))
  }

  useEffect(() => {
    let isMounted = true

    async function loadPromo() {
      const normalizedSlug = normalizeSlug(decodeURIComponent(slug))
      if (!normalizedSlug) {
        if (isMounted) {
          setProfile(null)
          setLoading(false)
          setError('Invalid promo link.')
        }
        return
      }

      try {
        setLoading(true)
        setError(null)
        const promoUrl = `${getIntegrationEndpoint('integrationPromo')}?slug=${encodeURIComponent(normalizedSlug)}`
        const galleryUrl = `${getIntegrationEndpoint('integrationGallery')}?slug=${encodeURIComponent(normalizedSlug)}`
        const catalogUrl = `${getIntegrationEndpoint('integrationPublicCatalog')}?slug=${encodeURIComponent(normalizedSlug)}`

        const [promoResponse, galleryResponse, catalogResponse] = await Promise.all([
          fetch(promoUrl, { method: 'GET' }),
          fetch(galleryUrl, { method: 'GET' }),
          fetch(catalogUrl, { method: 'GET' }),
        ])

        if (!promoResponse.ok) {
          if (promoResponse.status === 404) {
            setProfile(null)
            setGallery([])
            setBlogPosts([])
            setError('Promo not found.')
            return
          }
          throw new Error(`Promo fetch failed with ${promoResponse.status}`)
        }
        if (!galleryResponse.ok) throw new Error(`Gallery fetch failed with ${galleryResponse.status}`)
        if (!catalogResponse.ok) throw new Error(`Catalog fetch failed with ${catalogResponse.status}`)

        const promoPayload = (await promoResponse.json()) as PromoApiResponse
        const galleryPayload = (await galleryResponse.json()) as PromoGalleryApiResponse
        const catalogPayload = (await catalogResponse.json()) as CatalogApiResponse
        const promo = promoPayload.promo
        const storeId = typeof promoPayload.storeId === 'string' ? promoPayload.storeId : ''
        if (!promo || !storeId) {
          setProfile(null)
          setGallery([])
          setCatalogItems([])
          setBlogPosts([])
          setError('This promo link is not active.')
          return
        }

        let blogItems: BlogPost[] = []
        try {
          const blogResponse = await fetch(`/api/public-blog?${new URLSearchParams({ storeId }).toString()}`)
          if (blogResponse.ok) {
            const blogPayload = (await blogResponse.json()) as BlogApiResponse
            blogItems = (blogPayload.items ?? [])
              .map(item => {
                const id = typeof item.id === 'string' ? item.id : ''
                const title = typeof item.title === 'string' && item.title.trim() ? item.title.trim() : ''
                const postSlug = typeof item.slug === 'string' && item.slug.trim() ? item.slug.trim() : id
                if (!id || !title || !postSlug) return null
                return {
                  id,
                  title,
                  slug: postSlug,
                  excerpt: typeof item.excerpt === 'string' ? item.excerpt : null,
                  content: typeof item.content === 'string' ? item.content : '',
                  imageUrl: typeof item.imageUrl === 'string' && item.imageUrl.trim() ? item.imageUrl.trim() : null,
                  linkUrl: typeof item.linkUrl === 'string' && item.linkUrl.trim() ? item.linkUrl.trim() : null,
                  tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : [],
                } satisfies BlogPost
              })
              .filter((item): item is BlogPost => item !== null)
          }
        } catch (blogError) {
          console.warn('[promo] Public blog preview unavailable', blogError)
        }

        const publishedGallery = (galleryPayload.gallery ?? [])
          .map(item => {
            const id = typeof item.id === 'string' ? item.id : ''
            const url = typeof item.url === 'string' ? item.url.trim() : ''
            if (!id || !url) return null
            return {
              id,
              url,
              alt: typeof item.alt === 'string' && item.alt.trim() ? item.alt.trim() : null,
              caption: typeof item.caption === 'string' && item.caption.trim() ? item.caption.trim() : null,
              sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : 0,
            } satisfies PromoGalleryItem
          })
          .filter((item): item is PromoGalleryItem => item !== null)
          .sort((a, b) => a.sortOrder - b.sortOrder)

        const catalog = (catalogPayload.products ?? [])
          .map(item => {
            const id = typeof item.id === 'string' ? item.id : ''
            const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : ''
            if (!id || !name) return null
            return {
              id,
              name,
              description: typeof item.description === 'string' && item.description.trim() ? item.description.trim() : null,
              category: typeof item.category === 'string' && item.category.trim() ? item.category.trim() : null,
              price: typeof item.price === 'number' ? item.price : null,
              imageUrl: typeof item.imageUrl === 'string' && item.imageUrl.trim() ? item.imageUrl.trim() : null,
              imageAlt: typeof item.imageAlt === 'string' ? item.imageAlt : null,
              itemType:
                item.itemType === 'service'
                  ? 'service'
                  : item.itemType === 'course'
                    ? 'course'
                    : item.itemType === 'made_to_order'
                    ? 'made_to_order'
                    : 'product',
            } satisfies CatalogItem
          })
          .filter((item): item is CatalogItem => item !== null)

        if (!isMounted) return

        setProfile({
          storeId,
          storeName: typeof promo.storeName === 'string' && promo.storeName.trim() ? promo.storeName.trim() : 'Sedifex Store',
          storePhone: typeof promo.phone === 'string' && promo.phone.trim() ? promo.phone.trim() : null,
          promoEnabled: promo.enabled === true,
          title: typeof promo.title === 'string' ? promo.title : null,
          summary: typeof promo.summary === 'string' ? promo.summary : null,
          startDate: typeof promo.startDate === 'string' ? promo.startDate : null,
          endDate: typeof promo.endDate === 'string' ? promo.endDate : null,
          websiteUrl: typeof promo.websiteUrl === 'string' ? promo.websiteUrl : null,
          youtubeUrl: typeof promo.youtubeUrl === 'string' ? promo.youtubeUrl : null,
          youtubeEmbedUrl: typeof promo.youtubeEmbedUrl === 'string' ? promo.youtubeEmbedUrl : toYoutubeEmbedUrl(typeof promo.youtubeUrl === 'string' ? promo.youtubeUrl : null),
          youtubeChannelId: typeof promo.youtubeChannelId === 'string' ? promo.youtubeChannelId : null,
          youtubeVideos: Array.isArray(promo.youtubeVideos)
            ? promo.youtubeVideos
                .map(item => {
                  const videoId = typeof item.videoId === 'string' ? item.videoId.trim() : ''
                  const watchUrl = typeof item.watchUrl === 'string' ? item.watchUrl.trim() : ''
                  const embedUrl = typeof item.embedUrl === 'string' ? item.embedUrl.trim() : ''
                  if (!videoId || !watchUrl || !embedUrl) return null
                  return {
                    videoId,
                    title: typeof item.title === 'string' ? item.title : null,
                    watchUrl,
                    embedUrl,
                    thumbnailUrl: typeof item.thumbnailUrl === 'string' ? item.thumbnailUrl : null,
                    publishedAt: typeof item.publishedAt === 'string' ? item.publishedAt : null,
                  }
                })
                .filter((item): item is PromoProfile['youtubeVideos'][number] => item !== null)
            : [],
          imageUrl: typeof promo.imageUrl === 'string' ? promo.imageUrl : null,
          imageAlt: typeof promo.imageAlt === 'string' ? promo.imageAlt : null,
        })
        setGallery(publishedGallery)
        setCatalogItems(catalog)
        setBlogPosts(blogItems)
      } catch (nextError) {
        console.error('[promo] Failed to load promo page', nextError)
        if (isMounted) {
          setProfile(null)
          setGallery([])
          setCatalogItems([])
          setBlogPosts([])
          setError('Unable to load this promo right now.')
        }
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    void loadPromo()

    return () => {
      isMounted = false
    }
  }, [slug])

  useEffect(() => {
    if (!profile) return

    const pageTitle = profile.title?.trim() || `${profile.storeName} | Public store page`
    const description = sanitizeSummary(profile.summary, profile.storeName)
    const normalizedSlug = normalizeSlug(decodeURIComponent(slug))
    const pageUrl = `https://sedifex.com/${encodeURIComponent(normalizedSlug)}`
    const imageUrl = profile.imageUrl || gallery[0]?.url || catalogItems.find(item => item.imageUrl)?.imageUrl || 'https://sedifex.com/logo-512.png'

    document.title = `${pageTitle} | Sedifex`
    setOrCreateMetaTag('name', 'description', description)
    setOrCreateMetaTag('name', 'robots', 'index,follow,max-image-preview:large')
    setOrCreateMetaTag('property', 'og:type', 'website')
    setOrCreateMetaTag('property', 'og:title', pageTitle)
    setOrCreateMetaTag('property', 'og:description', description)
    setOrCreateMetaTag('property', 'og:url', pageUrl)
    setOrCreateMetaTag('property', 'og:image', imageUrl)
    setOrCreateMetaTag('name', 'twitter:card', 'summary_large_image')
    setOrCreateMetaTag('name', 'twitter:title', pageTitle)
    setOrCreateMetaTag('name', 'twitter:description', description)
    setOrCreateMetaTag('name', 'twitter:image', imageUrl)
  }, [catalogItems, gallery, profile, slug])

  useEffect(() => {
    if (!activeGalleryItem) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setActiveGalleryImageId(null)
        return
      }

      if (!gallery.length) return

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        const nextIndex = (activeGalleryIndex + 1) % gallery.length
        setActiveGalleryImageId(gallery[nextIndex].id)
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        const previousIndex = (activeGalleryIndex - 1 + gallery.length) % gallery.length
        setActiveGalleryImageId(gallery[previousIndex].id)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeGalleryIndex, activeGalleryItem, gallery])

  function openGalleryItem(itemId: string) {
    setActiveGalleryImageId(itemId)
  }

  function closeGalleryViewer() {
    setActiveGalleryImageId(null)
  }

  function showPreviousGalleryImage() {
    if (!gallery.length || activeGalleryIndex < 0) return
    const previousIndex = (activeGalleryIndex - 1 + gallery.length) % gallery.length
    setActiveGalleryImageId(gallery[previousIndex].id)
  }

  function showNextGalleryImage() {
    if (!gallery.length || activeGalleryIndex < 0) return
    const nextIndex = (activeGalleryIndex + 1) % gallery.length
    setActiveGalleryImageId(gallery[nextIndex].id)
  }

  if (loading) {
    return (
      <main className="promo-page promo-public-page">
        <article className="promo-shell">
          <p className="promo-state">Loading public page…</p>
        </article>
      </main>
    )
  }

  if (error || !profile) {
    return (
      <main className="promo-page promo-public-page">
        <article className="promo-shell">
          <h1 className="promo-error-title">Page unavailable</h1>
          <p className="promo-state">{error ?? 'This public page is not active.'}</p>
          <p><Link to="/">Go to Sedifex home</Link></p>
        </article>
      </main>
    )
  }

  const promoTitle = profile.title?.trim() || `Special offers at ${profile.storeName}`
  const promoSummary = sanitizeSummary(profile.summary, profile.storeName)
  const directChatLink = profile.storePhone ? `sms:${profile.storePhone}` : null
  const whatsappLink = buildWhatsAppLink(profile.storePhone, profile.storeName)
  const primaryPromoVideoEmbedUrl = profile.youtubeVideos[0]?.embedUrl ?? profile.youtubeEmbedUrl
  const avatarText = profile.storeName.trim().charAt(0).toUpperCase() || 'S'
  const hasSearchResults = featuredCatalogItems.length || featuredBlogPosts.length || featuredGalleryItems.length

  return (
    <main className="promo-page promo-public-page">
      <article className="promo-shell">
        <header className="promo-public-hero">
          <div className="promo-public-hero__avatar">{avatarText}</div>
          <div className="promo-public-hero__copy">
            <p className="promo-label">Sedifex public page</p>
            <h1>{profile.storeName}</h1>
            <p>{promoSummary}</p>
            <div className="promo-public-hero__actions">
              {profile.websiteUrl ? <a className="promo-button promo-button--primary" href={profile.websiteUrl} target="_blank" rel="noreferrer noopener">Visit website</a> : null}
              {whatsappLink ? <a className="promo-button" href={whatsappLink} target="_blank" rel="noreferrer noopener">WhatsApp</a> : null}
              {directChatLink ? <a className="promo-button" href={directChatLink}>Direct chat</a> : null}
            </div>
          </div>
          <div className="promo-public-hero__stats" aria-label="Page summary">
            <span><strong>{catalogItemsWithImages.length}</strong> Items</span>
            <span><strong>{blogPosts.length}</strong> Posts</span>
            <span><strong>{gallery.length}</strong> Photos</span>
          </div>
        </header>

        <nav className="promo-public-tabs" aria-label="Public page sections">
          <a href="#promo-about">About</a>
          <a href="#promo-catalog">Products & services</a>
          <a href="#promo-blog">Blog</a>
          <a href="#promo-gallery">Gallery</a>
          <a href="#promo-hero">Promo</a>
        </nav>

        <section className="promo-search-panel" aria-label="Search this public page">
          <div>
            <p className="promo-label">Search page</p>
            <h2>Find products, services, courses, blog posts, or gallery updates.</h2>
          </div>
          <label className="promo-public-search">
            <span>Search {profile.storeName}</span>
            <input
              type="search"
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              placeholder="Search offers, services, courses, blog posts..."
            />
          </label>
        </section>

        <section id="promo-about" className="promo-section promo-about-panel">
          <div>
            <p className="promo-label">About this page</p>
            <h2>Everything from {profile.storeName}, organized in one place.</h2>
          </div>
          <p>
            This public Sedifex page helps customers discover available products, services, courses,
            blog updates, promo details, and gallery highlights without searching across many links.
          </p>
        </section>

        <section id="promo-catalog" className="promo-section promo-public-section">
          <div className="promo-section-heading">
            <div>
              <p className="promo-label">Products & services</p>
              <h2>Available offerings</h2>
              <p>Showing a few public items first. Use search and filters to narrow the page.</p>
            </div>
            <div className="promo-filter-tabs" aria-label="Catalog filters">
              <button type="button" className={catalogFilter === 'all' ? 'is-active' : ''} onClick={() => setCatalogFilter('all')}>All</button>
              <button type="button" className={catalogFilter === 'product' ? 'is-active' : ''} onClick={() => setCatalogFilter('product')}>Products ({productsCount})</button>
              <button type="button" className={catalogFilter === 'service' ? 'is-active' : ''} onClick={() => setCatalogFilter('service')}>Services ({servicesCount})</button>
              <button type="button" className={catalogFilter === 'course' ? 'is-active' : ''} onClick={() => setCatalogFilter('course')}>Courses ({coursesCount})</button>
            </div>
          </div>
          {featuredCatalogItems.length ? (
            <div className="promo-catalog-grid" role="list" aria-label="Featured catalog items">
              {featuredCatalogItems.map(item => {
                const descriptionPreview = item.description ? getCatalogDescriptionPreview(item.description) : null
                return (
                  <article key={item.id} className="promo-catalog-card" role="listitem">
                    {item.imageUrl ? <SafeFirebaseImage src={item.imageUrl} alt={item.imageAlt || `${item.name} image`} loading="lazy" /> : null}
                    <div className="promo-catalog-card__body">
                      <span className="promo-pill">{catalogTypeLabel(item.itemType)}</span>
                      <h3>{item.name}</h3>
                      {item.description ? (
                        <>
                          <p>{expandedCatalogDescriptions[item.id] ? item.description : descriptionPreview?.text}</p>
                          {descriptionPreview?.isTruncated ? (
                            <button type="button" className="promo-description-toggle" onClick={() => toggleCatalogDescription(item.id)}>
                              {expandedCatalogDescriptions[item.id] ? 'View less' : 'View more'}
                            </button>
                          ) : null}
                        </>
                      ) : <p>{catalogTypeLabel(item.itemType)} available from {profile.storeName}.</p>}
                      <div className="promo-catalog-card__meta">
                        <span>{item.category || 'General'}</span>
                        {formatPrice(item.price) ? <strong>{formatPrice(item.price)}</strong> : null}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <p className="promo-empty-state">
              {catalogItemsWithImages.length ? 'No products, services, or courses match your search.' : 'Products and services with pictures will appear here soon.'}
            </p>
          )}
          {filteredCatalogItems.length > FEATURED_CATALOG_LIMIT ? (
            <p className="promo-section-footnote">Showing {FEATURED_CATALOG_LIMIT} of {filteredCatalogItems.length}. Search a specific name or category to narrow the list.</p>
          ) : null}
        </section>

        <section id="promo-blog" className="promo-section promo-public-section">
          <div className="promo-section-heading">
            <div>
              <p className="promo-label">Blog & updates</p>
              <h2>Latest articles</h2>
              <p>Helpful updates, offers, guides, and announcements from {profile.storeName}.</p>
            </div>
            {blogPosts.length ? <Link className="promo-button" to={`/public-blog/${profile.storeId}`}>Open blog</Link> : null}
          </div>
          {featuredBlogPosts.length ? (
            <div className="promo-blog-grid">
              {featuredBlogPosts.map(post => (
                <article key={post.id} className="promo-blog-card">
                  {post.imageUrl ? <SafeFirebaseImage src={post.imageUrl} alt={post.title} loading="lazy" /> : null}
                  <div>
                    <p className="promo-label">Article</p>
                    <h3>{post.title}</h3>
                    <p>{previewText(post.excerpt || post.content, BLOG_DESCRIPTION_PREVIEW_LENGTH)}</p>
                    <Link to={`/public-blog/${profile.storeId}/${post.slug}`}>Read article</Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="promo-empty-state">Blog updates will appear here when this store publishes posts.</p>
          )}
        </section>

        <section id="promo-gallery" className="promo-section promo-public-section">
          <div className="promo-section-heading">
            <div>
              <p className="promo-label">Gallery</p>
              <h2>Latest highlights</h2>
              <p>Recent photos and public updates from {profile.storeName}.</p>
            </div>
          </div>
          {featuredGalleryItems.length ? (
            <div className="promo-gallery-grid promo-gallery-grid--modern" role="list" aria-label="Promo gallery">
              {featuredGalleryItems.map(item => (
                <figure key={item.id} className="promo-gallery-item promo-gallery-item--modern" role="listitem">
                  <button type="button" className="promo-gallery-item__image-button" onClick={() => openGalleryItem(item.id)} aria-label={`Open image ${item.alt || item.caption || item.id}`}>
                    <SafeFirebaseImage src={item.url} alt={item.alt || `${profile.storeName} gallery image`} loading="lazy" />
                  </button>
                  {item.caption ? <figcaption>{item.caption}</figcaption> : null}
                </figure>
              ))}
            </div>
          ) : <p className="promo-empty-state">Gallery updates will appear here soon.</p>}
          {filteredGallery.length > FEATURED_GALLERY_LIMIT ? <p className="promo-section-footnote">Showing {FEATURED_GALLERY_LIMIT} of {filteredGallery.length} gallery images.</p> : null}
        </section>

        <section id="promo-hero" className="promo-section promo-public-section promo-offer-card">
          <div className="promo-offer-card__header">
            <div>
              <p className="promo-label">Current promo</p>
              <h2>{promoTitle}</h2>
            </div>
            {!profile.promoEnabled ? <span className="promo-status-pill">No active promo</span> : <span className="promo-status-pill is-active">Active promo</span>}
          </div>
          {profile.imageUrl ? <SafeFirebaseImage className="promo-image" src={profile.imageUrl} alt={profile.imageAlt || `${profile.storeName} promo image`} loading="lazy" /> : null}
          <p>{promoSummary}</p>
          {profile.storePhone ? <p className="promo-meta">Contact: <a href={`tel:${profile.storePhone}`}>{profile.storePhone}</a></p> : null}
          {primaryPromoVideoEmbedUrl ? (
            <div className="promo-video-wrapper">
              <iframe
                className="promo-video"
                src={primaryPromoVideoEmbedUrl}
                title={`${profile.storeName} promo video`}
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
          ) : null}
          {(profile.startDate || profile.endDate) && <p className="promo-dates">Offer window: {profile.startDate || 'Now'} – {profile.endDate || 'Limited time'}</p>}
          <div className="promo-public-hero__actions">
            {profile.websiteUrl ? <a className="promo-button promo-button--primary" href={profile.websiteUrl} target="_blank" rel="noreferrer noopener">Visit website</a> : null}
            {whatsappLink ? <a className="promo-button" href={whatsappLink} target="_blank" rel="noreferrer noopener">Contact on WhatsApp</a> : null}
          </div>
        </section>

        {normalizedSearchTerm && !hasSearchResults ? <p className="promo-empty-state promo-empty-state--global">No public content matches “{searchTerm}”. Try another word.</p> : null}

        {activeGalleryItem ? (
          <div className="promo-gallery-viewer" role="dialog" aria-modal="true" aria-label="Gallery image viewer" onClick={closeGalleryViewer}>
            <div className="promo-gallery-viewer__content" onClick={event => event.stopPropagation()}>
              <button type="button" className="promo-gallery-viewer__close" aria-label="Close image viewer" onClick={closeGalleryViewer}>×</button>
              <button type="button" className="promo-gallery-viewer__nav" onClick={showPreviousGalleryImage} aria-label="View previous image">‹</button>
              <figure className="promo-gallery-viewer__figure">
                <SafeFirebaseImage src={activeGalleryItem.url} alt={activeGalleryItem.alt || `${profile?.storeName || 'Store'} gallery image`} />
                {activeGalleryItem.caption ? <figcaption>{activeGalleryItem.caption}</figcaption> : null}
              </figure>
              <button type="button" className="promo-gallery-viewer__nav" onClick={showNextGalleryImage} aria-label="View next image">›</button>
            </div>
          </div>
        ) : null}
      </article>
    </main>
  )
}
