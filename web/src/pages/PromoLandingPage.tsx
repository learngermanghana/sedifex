import React, { useEffect, useState } from 'react'
import { collection, getDocs, limit, query, where } from 'firebase/firestore'
import { Link, useParams } from 'react-router-dom'

import { db } from '../firebase'
import './PromoLandingPage.css'

type PromoProfile = {
  storeName: string
  title: string | null
  summary: string | null
  startDate: string | null
  endDate: string | null
  websiteUrl: string | null
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
}

export default function PromoLandingPage() {
  const { slug = '' } = useParams()
  const [profile, setProfile] = useState<PromoProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

        const data = snapshot.docs[0].data() as Record<string, unknown>
        setProfile({
          storeName:
            (typeof data.displayName === 'string' && data.displayName.trim()) ||
            (typeof data.name === 'string' && data.name.trim()) ||
            'Sedifex Store',
          title: typeof data.promoTitle === 'string' ? data.promoTitle : null,
          summary: typeof data.promoSummary === 'string' ? data.promoSummary : null,
          startDate: typeof data.promoStartDate === 'string' ? data.promoStartDate : null,
          endDate: typeof data.promoEndDate === 'string' ? data.promoEndDate : null,
          websiteUrl: typeof data.promoWebsiteUrl === 'string' ? data.promoWebsiteUrl : null,
        })
      } catch (nextError) {
        console.error('[promo] Failed to load promo page', nextError)
        if (isMounted) {
          setProfile(null)
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
          <p>Loading promo…</p>
        </article>
      </main>
    )
  }

  if (error || !profile) {
    return (
      <main className="promo-page">
        <article className="promo-card">
          <h1>Promo unavailable</h1>
          <p>{error ?? 'This promo link is not active.'}</p>
          <p>
            <Link to="/">Go to Sedifex home</Link>
          </p>
        </article>
      </main>
    )
  }

  return (
    <main className="promo-page">
      <article className="promo-card">
        <p className="promo-label">Sedifex promo</p>
        <h1>{profile.title || `${profile.storeName} Promotion`}</h1>
        <p className="promo-store">Store: {profile.storeName}</p>
        <p>{profile.summary || 'Check out this offer from our store.'}</p>
        {(profile.startDate || profile.endDate) && (
          <p className="promo-dates">
            {profile.startDate || 'Now'} – {profile.endDate || 'Limited time'}
          </p>
        )}
        {profile.websiteUrl ? (
          <a href={profile.websiteUrl} target="_blank" rel="noreferrer noopener">
            Visit store website
          </a>
        ) : null}
      </article>
    </main>
  )
}
