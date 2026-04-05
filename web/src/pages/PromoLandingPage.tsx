import React, { useEffect, useState } from 'react'
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore'
import { Link, useParams } from 'react-router-dom'

import { db } from '../firebase'
import './PromoLandingPage.css'

type PromoProfile = {
  storeId: string
  storeName: string
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

export default function PromoLandingPage() {
  const { slug = '' } = useParams()
  const [profile, setProfile] = useState<PromoProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [gallery, setGallery] = useState<PromoGalleryItem[]>([])

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

        const storesQuery = query(
          collection(db, 'stores'),
          where('promoSlug', '==', normalizedSlug),
          limit(1),
        )
        const snapshot = await getDocs(storesQuery)

        if (!isMounted) return
        if (snapshot.empty) {
          setProfile(null)
          setError('Promo not found.')
          return
        }

        const storeDoc = snapshot.docs[0]
        const data = storeDoc.data() as Record<string, unknown>
        const galleryRef = collection(db, 'stores', storeDoc.id, 'promoGallery')
        const gallerySnapshot = await getDocs(query(galleryRef, orderBy('sortOrder', 'asc'), limit(36)))

        const publishedGallery = gallerySnapshot.docs
          .map(itemDoc => {
            const itemData = itemDoc.data() as Record<string, unknown>
            if (itemData.isPublished !== true || typeof itemData.url !== 'string' || !itemData.url.trim()) {
              return null
            }
            return {
              id: itemDoc.id,
              url: itemData.url.trim(),
              alt:
                typeof itemData.alt === 'string' && itemData.alt.trim() ? itemData.alt.trim() : null,
              caption:
                typeof itemData.caption === 'string' && itemData.caption.trim()
                  ? itemData.caption.trim()
                  : null,
              sortOrder: typeof itemData.sortOrder === 'number' ? itemData.sortOrder : 0,
            } satisfies PromoGalleryItem
          })
          .filter((item): item is PromoGalleryItem => item !== null)

        setProfile({
          storeId: storeDoc.id,
          storeName:
            (typeof data.displayName === 'string' && data.displayName.trim()) ||
            (typeof data.name === 'string' && data.name.trim()) ||
            'Sedifex Store',
          title: typeof data.promoTitle === 'string' ? data.promoTitle : null,
          summary: typeof data.promoSummary === 'string' ? data.promoSummary : null,
          startDate: typeof data.promoStartDate === 'string' ? data.promoStartDate : null,
          endDate: typeof data.promoEndDate === 'string' ? data.promoEndDate : null,
          websiteUrl: typeof data.promoWebsiteUrl === 'string' ? data.promoWebsiteUrl : null,
          imageUrl: typeof data.promoImageUrl === 'string' ? data.promoImageUrl : null,
          imageAlt: typeof data.promoImageAlt === 'string' ? data.promoImageAlt : null,
        })
        setGallery(publishedGallery)
      } catch (nextError) {
        console.error('[promo] Failed to load promo page', nextError)
        if (isMounted) {
          setProfile(null)
          setGallery([])
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
        <a href="#promo-hero">Hero</a>
        <a href="#promo-gallery">Gallery</a>
      </nav>
      <article className="promo-card">
        <section id="promo-hero" className="promo-section">
        <p className="promo-label">Sedifex promo</p>
        {profile.imageUrl ? (
          <img
            className="promo-image"
            src={profile.imageUrl}
            alt={profile.imageAlt || `${profile.storeName} promo image`}
            loading="lazy"
          />
        ) : null}
        <h1>{profile.title || `Special offers at ${profile.storeName}`}</h1>
        <p className="promo-store">Store: {profile.storeName}</p>
        <p className="promo-summary">
          {profile.summary ||
            `Discover limited-time beauty and wellness deals from ${profile.storeName}. Book now and enjoy premium care for less.`}
        </p>
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
      </article>
    </main>
  )
}
