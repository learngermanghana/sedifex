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
  itemType: 'product' | 'service' | 'made_to_order'
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
    itemType?: 'product' | 'service' | 'made_to_order'
  }>
}

const CATALOG_PAGE_SIZE = 24

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
    return `Discover limited-time beauty and wellness deals from ${storeName}. Book now and enjoy premium care for less.`
  }

  const compact = value.replace(/\s+/g, ' ').trim()
  if (compact.length < 16) {
    return `Exclusive offer from ${storeName}. Secure your slot now and save on your next treatment.`
  }

  return compact
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

export default function PromoLandingPage() {
  const { slug = '' } = useParams()
  const [profile, setProfile] = useState<PromoProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [gallery, setGallery] = useState<PromoGalleryItem[]>([])
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([])
  const [activeGalleryImageId, setActiveGalleryImageId] = useState<string | null>(null)
  const [catalogSearchTerm, setCatalogSearchTerm] = useState('')
  const [catalogPage, setCatalogPage] = useState(1)

  const activeGalleryIndex = useMemo(() => {
    if (!activeGalleryImageId) {
      return -1
    }
    return gallery.findIndex(item => item.id === activeGalleryImageId)
  }, [activeGalleryImageId, gallery])

  const activeGalleryItem = activeGalleryIndex >= 0 ? gallery[activeGalleryIndex] : null
  const normalizedCatalogSearchTerm = catalogSearchTerm.trim().toLowerCase()
  const catalogItemsWithImages = useMemo(
    () => catalogItems.filter(item => typeof item.imageUrl === 'string' && item.imageUrl.trim().length > 0),
    [catalogItems],
  )
  const filteredCatalogItems = useMemo(() => {
    if (!normalizedCatalogSearchTerm) {
      return catalogItemsWithImages
    }

    return catalogItemsWithImages.filter(item => {
      const searchableText = [
        item.name,
        item.description ?? '',
        item.category ?? '',
        item.id,
        item.itemType,
      ]
        .join(' ')
        .toLowerCase()
      return searchableText.includes(normalizedCatalogSearchTerm)
    })
  }, [catalogItemsWithImages, normalizedCatalogSearchTerm])
  const totalCatalogPages = Math.max(1, Math.ceil(filteredCatalogItems.length / CATALOG_PAGE_SIZE))
  const currentCatalogPage = Math.min(catalogPage, totalCatalogPages)
  const paginatedCatalogItems = useMemo(() => {
    const start = (currentCatalogPage - 1) * CATALOG_PAGE_SIZE
    return filteredCatalogItems.slice(start, start + CATALOG_PAGE_SIZE)
  }, [currentCatalogPage, filteredCatalogItems])

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
        const promoUrl = `${getIntegrationEndpoint('integrationPromo')}?slug=${encodeURIComponent(
          normalizedSlug,
        )}`
        const galleryUrl = `${getIntegrationEndpoint('integrationGallery')}?slug=${encodeURIComponent(
          normalizedSlug,
        )}`
        const catalogUrl = `${getIntegrationEndpoint('integrationPublicCatalog')}?slug=${encodeURIComponent(
          normalizedSlug,
        )}`

        const [promoResponse, galleryResponse, catalogResponse] = await Promise.all([
          fetch(promoUrl, { method: 'GET' }),
          fetch(galleryUrl, { method: 'GET' }),
          fetch(catalogUrl, { method: 'GET' }),
        ])

        if (!promoResponse.ok) {
          if (promoResponse.status === 404) {
            setProfile(null)
            setGallery([])
            setError('Promo not found.')
            return
          }
          throw new Error(`Promo fetch failed with ${promoResponse.status}`)
        }
        if (!galleryResponse.ok) {
          throw new Error(`Gallery fetch failed with ${galleryResponse.status}`)
        }
        if (!catalogResponse.ok) {
          throw new Error(`Catalog fetch failed with ${catalogResponse.status}`)
        }

        const promoPayload = (await promoResponse.json()) as PromoApiResponse
        const galleryPayload = (await galleryResponse.json()) as PromoGalleryApiResponse
        const catalogPayload = (await catalogResponse.json()) as CatalogApiResponse
        const promo = promoPayload.promo
        const storeId = typeof promoPayload.storeId === 'string' ? promoPayload.storeId : ''
        if (!promo || !storeId) {
          setProfile(null)
          setGallery([])
          setError('This promo link is not active.')
          return
        }

        const publishedGallery = (galleryPayload.gallery ?? [])
          .map(item => {
            const id = typeof item.id === 'string' ? item.id : ''
            const url = typeof item.url === 'string' ? item.url.trim() : ''
            if (!id || !url) {
              return null
            }
            return {
              id,
              url,
              alt: typeof item.alt === 'string' && item.alt.trim() ? item.alt.trim() : null,
              caption:
                typeof item.caption === 'string' && item.caption.trim() ? item.caption.trim() : null,
              sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : 0,
            } satisfies PromoGalleryItem
          })
          .filter((item): item is PromoGalleryItem => item !== null)
          .sort((a, b) => a.sortOrder - b.sortOrder)

        const catalog = (catalogPayload.products ?? [])
          .map(item => {
            const id = typeof item.id === 'string' ? item.id : ''
            const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : ''
            if (!id || !name) {
              return null
            }
            return {
              id,
              name,
              description:
                typeof item.description === 'string' && item.description.trim()
                  ? item.description.trim()
                  : null,
              category:
                typeof item.category === 'string' && item.category.trim() ? item.category.trim() : null,
              price: typeof item.price === 'number' ? item.price : null,
              imageUrl:
                typeof item.imageUrl === 'string' && item.imageUrl.trim() ? item.imageUrl.trim() : null,
              imageAlt: typeof item.imageAlt === 'string' ? item.imageAlt : null,
              itemType:
                item.itemType === 'service'
                  ? 'service'
                  : item.itemType === 'made_to_order'
                    ? 'made_to_order'
                    : 'product',
            } satisfies CatalogItem
          })
          .filter((item): item is CatalogItem => item !== null)

        if (!isMounted) return

        setProfile({
          storeId,
          storeName:
            typeof promo.storeName === 'string' && promo.storeName.trim()
              ? promo.storeName.trim()
              : 'Sedifex Store',
          storePhone: typeof promo.phone === 'string' && promo.phone.trim() ? promo.phone.trim() : null,
          promoEnabled: promo.enabled === true,
          title: typeof promo.title === 'string' ? promo.title : null,
          summary: typeof promo.summary === 'string' ? promo.summary : null,
          startDate: typeof promo.startDate === 'string' ? promo.startDate : null,
          endDate: typeof promo.endDate === 'string' ? promo.endDate : null,
          websiteUrl: typeof promo.websiteUrl === 'string' ? promo.websiteUrl : null,
          youtubeUrl: typeof promo.youtubeUrl === 'string' ? promo.youtubeUrl : null,
          youtubeEmbedUrl:
            typeof promo.youtubeEmbedUrl === 'string'
              ? promo.youtubeEmbedUrl
              : toYoutubeEmbedUrl(typeof promo.youtubeUrl === 'string' ? promo.youtubeUrl : null),
          youtubeChannelId:
            typeof promo.youtubeChannelId === 'string' ? promo.youtubeChannelId : null,
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
                .filter(
                  (
                    item,
                  ): item is {
                    videoId: string
                    title: string | null
                    watchUrl: string
                    embedUrl: string
                    thumbnailUrl: string | null
                    publishedAt: string | null
                  } => item !== null,
                )
            : [],
          imageUrl: typeof promo.imageUrl === 'string' ? promo.imageUrl : null,
          imageAlt: typeof promo.imageAlt === 'string' ? promo.imageAlt : null,
        })
        setGallery(publishedGallery)
        setCatalogItems(catalog)
      } catch (nextError) {
        console.error('[promo] Failed to load promo page', nextError)
        if (isMounted) {
          setProfile(null)
          setGallery([])
          setCatalogItems([])
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
    if (!profile) {
      return
    }

    const pageTitle = profile.title?.trim() || `Special offers at ${profile.storeName}`
    const description = sanitizeSummary(profile.summary, profile.storeName)
    const normalizedSlug = normalizeSlug(decodeURIComponent(slug))
    const pageUrl = `https://sedifex.com/${encodeURIComponent(normalizedSlug)}`
    const imageUrl = profile.imageUrl || gallery[0]?.url || 'https://sedifex.com/logo-512.png'

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
  }, [gallery, profile, slug])

  useEffect(() => {
    if (!activeGalleryItem) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setActiveGalleryImageId(null)
        return
      }

      if (!gallery.length) {
        return
      }

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

  useEffect(() => {
    setCatalogPage(1)
  }, [normalizedCatalogSearchTerm])

  function openGalleryItem(itemId: string) {
    setActiveGalleryImageId(itemId)
  }

  function closeGalleryViewer() {
    setActiveGalleryImageId(null)
  }

  function showPreviousGalleryImage() {
    if (!gallery.length || activeGalleryIndex < 0) {
      return
    }
    const previousIndex = (activeGalleryIndex - 1 + gallery.length) % gallery.length
    setActiveGalleryImageId(gallery[previousIndex].id)
  }

  function showNextGalleryImage() {
    if (!gallery.length || activeGalleryIndex < 0) {
      return
    }
    const nextIndex = (activeGalleryIndex + 1) % gallery.length
    setActiveGalleryImageId(gallery[nextIndex].id)
  }

  if (loading) {
    return (
      <main className="promo-page">
        <article className="promo-card">
          <p className="promo-state">Loading promo…</p>
        </article>
      </main>
    )
  }

  if (error || !profile) {
    return (
      <main className="promo-page">
        <article className="promo-card">
          <h1 className="promo-error-title">Promo unavailable</h1>
          <p className="promo-state">{error ?? 'This promo link is not active.'}</p>
          <p>
            <Link to="/">Go to Sedifex home</Link>
          </p>
        </article>
      </main>
    )
  }

  const promoTitle = profile.title?.trim() || `Special offers at ${profile.storeName}`
  const promoSummary = sanitizeSummary(profile.summary, profile.storeName)
  const directChatLink = profile.storePhone ? `sms:${profile.storePhone}` : null
  const whatsappLink = buildWhatsAppLink(profile.storePhone, profile.storeName)
  const primaryPromoVideoEmbedUrl = profile.youtubeVideos[0]?.embedUrl ?? profile.youtubeEmbedUrl
  return (
    <main className="promo-page">
      <article className="promo-card">
        <header className="promo-site-header">
          <p className="promo-label">Sedifex store page</p>
          <h1>{profile.storeName}</h1>
          <p className="promo-summary">
            Everything we have publicly available for {profile.storeName} is arranged below like a full
            webpage: promo details, latest gallery updates, and products/services.
          </p>
          <nav className="promo-nav" aria-label="Promo sections">
            <a className="promo-nav__button" href="#promo-about">
              About
            </a>
            <a className="promo-nav__button" href="#promo-hero">
              Promo
            </a>
            <a className="promo-nav__button" href="#promo-gallery">
              Gallery
            </a>
            <a className="promo-nav__button" href="#promo-catalog">
              Products & services
            </a>
          </nav>
        </header>
        <section id="promo-about" className="promo-section promo-section--panel">
          <p className="promo-label">About this page</p>
          <p className="promo-summary">
            This public Sedifex page helps {profile.storeName} get SEO presence with a free URL.
            Promo updates, gallery images, and available products/services are organized here
            automatically.
          </p>
        </section>
        <div className="promo-section-divider" aria-hidden="true" />
        <section id="promo-hero" className="promo-section promo-section--panel">
          <p className="promo-label">Sedifex promo</p>
          {!profile.promoEnabled ? (
            <p className="promo-meta">No active promo is running right now. Check back soon.</p>
          ) : null}
          {profile.imageUrl ? (
            <img
              className="promo-image"
              src={profile.imageUrl}
              alt={profile.imageAlt || `${profile.storeName} promo image`}
              loading="lazy"
            />
          ) : null}
          <h1>{promoTitle}</h1>
          <p className="promo-store">Store: {profile.storeName}</p>
          {profile.storePhone ? (
            <p className="promo-meta">
              Contact: <a href={`tel:${profile.storePhone}`}>{profile.storePhone}</a>
            </p>
          ) : null}
          {directChatLink || whatsappLink ? (
            <div className="promo-contact-actions">
              {directChatLink ? (
                <a className="promo-nav__button" href={directChatLink}>
                  Direct chat
                </a>
              ) : null}
              {whatsappLink ? (
                <a className="promo-nav__button" href={whatsappLink} target="_blank" rel="noreferrer noopener">
                  Contact on WhatsApp
                </a>
              ) : null}
            </div>
          ) : null}
          <p className="promo-summary">{promoSummary}</p>
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
          {profile.youtubeVideos.length > 1 ? (
            <div className="promo-video-list" role="list" aria-label="Latest YouTube videos">
              {profile.youtubeVideos.map(video => (
                <a
                  key={video.videoId}
                  className="promo-video-list__item"
                  href={video.watchUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  role="listitem"
                >
                  {video.thumbnailUrl ? (
                    <img
                      className="promo-video-list__thumb"
                      src={video.thumbnailUrl}
                      alt={video.title ?? `${profile.storeName} video thumbnail`}
                      loading="lazy"
                    />
                  ) : null}
                  <span className="promo-video-list__meta">
                    <strong>{video.title ?? 'Latest upload'}</strong>
                    {formatPublishedDate(video.publishedAt) ? (
                      <small>Published {formatPublishedDate(video.publishedAt)}</small>
                    ) : null}
                  </span>
                </a>
              ))}
            </div>
          ) : null}
          {(profile.startDate || profile.endDate) && (
            <p className="promo-dates">
              Offer window: {profile.startDate || 'Now'} – {profile.endDate || 'Limited time'}
            </p>
          )}
          {profile.websiteUrl ? (
            <a
              className="promo-cta"
              href={profile.websiteUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              Shop now
            </a>
          ) : null}
        </section>
        <div className="promo-section-divider" aria-hidden="true" />
        <section id="promo-gallery" className="promo-section promo-section--panel">
          <div className="promo-gallery-header">
            <h2>Gallery</h2>
            <p>Latest highlights from {profile.storeName}.</p>
          </div>
          {gallery.length ? (
            <div className="promo-gallery-grid" role="list" aria-label="Promo gallery">
              {gallery.map(item => (
                <figure key={item.id} className="promo-gallery-item" role="listitem">
                  <button
                    type="button"
                    className="promo-gallery-item__image-button"
                    onClick={() => openGalleryItem(item.id)}
                    aria-label={`Open image ${item.alt || item.caption || item.id}`}
                  >
                    <img
                      src={item.url}
                      alt={item.alt || `${profile.storeName} gallery image`}
                      loading="lazy"
                    />
                  </button>
                  {item.caption ? <figcaption>{item.caption}</figcaption> : null}
                </figure>
              ))}
            </div>
          ) : (
            <p className="promo-gallery-empty">Gallery updates will appear here soon.</p>
          )}
        </section>
        {activeGalleryItem ? (
          <div
            className="promo-gallery-viewer"
            role="dialog"
            aria-modal="true"
            aria-label="Gallery image viewer"
            onClick={closeGalleryViewer}
          >
            <div className="promo-gallery-viewer__content" onClick={event => event.stopPropagation()}>
              <button
                type="button"
                className="promo-gallery-viewer__close"
                aria-label="Close image viewer"
                onClick={closeGalleryViewer}
              >
                ×
              </button>
              <button
                type="button"
                className="promo-gallery-viewer__nav"
                onClick={showPreviousGalleryImage}
                aria-label="View previous image"
              >
                ‹
              </button>
              <figure className="promo-gallery-viewer__figure">
                <img
                  src={activeGalleryItem.url}
                  alt={activeGalleryItem.alt || `${profile?.storeName || 'Store'} gallery image`}
                />
                {activeGalleryItem.caption ? <figcaption>{activeGalleryItem.caption}</figcaption> : null}
              </figure>
              <button
                type="button"
                className="promo-gallery-viewer__nav"
                onClick={showNextGalleryImage}
                aria-label="View next image"
              >
                ›
              </button>
            </div>
          </div>
        ) : null}
        <div className="promo-section-divider" aria-hidden="true" />
        <section id="promo-catalog" className="promo-section promo-section--panel">
            <div className="promo-gallery-header">
              <h2>Products & services</h2>
              <p>Available offerings from {profile.storeName}.</p>
            </div>
            <div className="promo-catalog-controls">
              <label className="promo-catalog-search">
                <span>Search products</span>
                <input
                  type="search"
                  value={catalogSearchTerm}
                  onChange={event => setCatalogSearchTerm(event.target.value)}
                  placeholder="Search by name, category, part number, or description"
                />
              </label>
              <p className="promo-meta">
                Showing {paginatedCatalogItems.length} of {filteredCatalogItems.length} matching items
              </p>
            </div>
            {filteredCatalogItems.length ? (
              <div className="promo-gallery-grid" role="list" aria-label="Store catalog">
                {paginatedCatalogItems.map(item => (
                  <article key={item.id} className="promo-gallery-item" role="listitem">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.imageAlt || `${item.name} image`}
                        loading="lazy"
                      />
                    ) : null}
                    <div>
                      <strong>{item.name}</strong>
                      <p className="promo-summary">
                        {item.description || `${item.itemType === 'service' ? 'Service' : 'Product'} available`}
                      </p>
                      <p className="promo-meta">
                        {item.category || 'General'} · {item.itemType === 'service' ? 'Service' : 'Product'}
                        {typeof item.price === 'number' ? ` · ${item.price.toFixed(2)}` : ''}
                      </p>
                      <p className="promo-meta">Part #: {item.id}</p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="promo-gallery-empty">
                {catalogItemsWithImages.length
                  ? 'No products or services with images match your search yet.'
                  : 'Products and services with pictures will appear here soon.'}
              </p>
            )}
            {filteredCatalogItems.length > CATALOG_PAGE_SIZE ? (
              <nav className="promo-pagination" aria-label="Catalog page navigation">
                <button
                  type="button"
                  className="promo-nav__button"
                  onClick={() => setCatalogPage(page => Math.max(1, page - 1))}
                  disabled={currentCatalogPage === 1}
                >
                  Previous
                </button>
                <span className="promo-meta">
                  Page {currentCatalogPage} of {totalCatalogPages}
                </span>
                <button
                  type="button"
                  className="promo-nav__button"
                  onClick={() => setCatalogPage(page => Math.min(totalCatalogPages, page + 1))}
                  disabled={currentCatalogPage >= totalCatalogPages}
                >
                  Next
                </button>
              </nav>
            ) : null}
        </section>
      </article>
    </main>
  )
}
