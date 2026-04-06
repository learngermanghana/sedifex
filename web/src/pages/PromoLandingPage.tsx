import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import './PromoLandingPage.css'

type PromoProfile = {
  storeId: string
  storeName: string
  promoEnabled: boolean
  title: string | null
  summary: string | null
  startDate: string | null
  endDate: string | null
  websiteUrl: string | null
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
    imageUrl?: string | null
    imageAlt?: string | null
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

type PromoSectionTab = 'about' | 'promo' | 'gallery' | 'catalog'

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

function getIntegrationEndpoint(path: string): string {
  const functionsRegion = import.meta.env.VITE_FB_FUNCTIONS_REGION ?? 'us-central1'
  const projectId = import.meta.env.VITE_FB_PROJECT_ID
  if (!projectId) {
    throw new Error('Missing Firebase project configuration for promo endpoint')
  }
  return `https://${functionsRegion}-${projectId}.cloudfunctions.net/${path}`
}

export default function PromoLandingPage() {
  const { slug = '' } = useParams()
  const [profile, setProfile] = useState<PromoProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [gallery, setGallery] = useState<PromoGalleryItem[]>([])
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([])
  const [activeTab, setActiveTab] = useState<PromoSectionTab>('about')

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
              imageUrl: typeof item.imageUrl === 'string' ? item.imageUrl : null,
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
          promoEnabled: promo.enabled === true,
          title: typeof promo.title === 'string' ? promo.title : null,
          summary: typeof promo.summary === 'string' ? promo.summary : null,
          startDate: typeof promo.startDate === 'string' ? promo.startDate : null,
          endDate: typeof promo.endDate === 'string' ? promo.endDate : null,
          websiteUrl: typeof promo.websiteUrl === 'string' ? promo.websiteUrl : null,
          imageUrl: typeof promo.imageUrl === 'string' ? promo.imageUrl : null,
          imageAlt: typeof promo.imageAlt === 'string' ? promo.imageAlt : null,
        })
        setGallery(publishedGallery)
        setCatalogItems(catalog)
        setActiveTab('about')
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
  return (
    <main className="promo-page">
      <nav className="promo-nav" aria-label="Promo sections">
        <button
          type="button"
          className={`promo-nav__button ${activeTab === 'about' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('about')}
        >
          About
        </button>
        <button
          type="button"
          className={`promo-nav__button ${activeTab === 'promo' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('promo')}
        >
          Promo
        </button>
        <button
          type="button"
          className={`promo-nav__button ${activeTab === 'gallery' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('gallery')}
        >
          Gallery
        </button>
        <button
          type="button"
          className={`promo-nav__button ${activeTab === 'catalog' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('catalog')}
        >
          Products & services
        </button>
      </nav>
      <article className="promo-card">
        {activeTab === 'about' && (
        <section id="promo-about" className="promo-section">
          <p className="promo-label">About this page</p>
          <h1>{profile.storeName}</h1>
          <p className="promo-summary">
            This public Sedifex page helps {profile.storeName} get SEO presence with a free URL.
            Promo updates, gallery images, and available products/services are organized here
            automatically.
          </p>
        </section>
        )}
        {activeTab === 'promo' && (
        <section id="promo-hero" className="promo-section">
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
          <p className="promo-summary">{promoSummary}</p>
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
        )}
        {activeTab === 'gallery' && (
        <section id="promo-gallery" className="promo-section">
          <div className="promo-gallery-header">
            <h2>Gallery</h2>
            <p>Latest highlights from {profile.storeName}.</p>
          </div>
          {gallery.length ? (
            <div className="promo-gallery-grid" role="list" aria-label="Promo gallery">
              {gallery.map(item => (
                <figure key={item.id} className="promo-gallery-item" role="listitem">
                  <img
                    src={item.url}
                    alt={item.alt || `${profile.storeName} gallery image`}
                    loading="lazy"
                  />
                  {item.caption ? <figcaption>{item.caption}</figcaption> : null}
                </figure>
              ))}
            </div>
          ) : (
            <p className="promo-gallery-empty">Gallery updates will appear here soon.</p>
          )}
        </section>
        )}
        {activeTab === 'catalog' && (
          <section id="promo-catalog" className="promo-section">
            <div className="promo-gallery-header">
              <h2>Products & services</h2>
              <p>Available offerings from {profile.storeName}.</p>
            </div>
            {catalogItems.length ? (
              <div className="promo-gallery-grid" role="list" aria-label="Store catalog">
                {catalogItems.map(item => (
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
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="promo-gallery-empty">Products and services will appear here soon.</p>
            )}
          </section>
        )}
      </article>
    </main>
  )
}
