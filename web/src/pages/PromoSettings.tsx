import React, { useEffect, useMemo, useState } from 'react'
import { Timestamp, doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { uploadProductImage } from '../api/productImageUpload'
import { useActiveStore } from '../hooks/useActiveStore'
import { useMemberships } from '../hooks/useMemberships'
import { useToast } from '../components/ToastProvider'
import { buildPromoSlug } from '../utils/promoSlug'
import './AccountOverview.css'

type StorePromoProfile = {
  name?: string | null
  displayName?: string | null
  promoEnabled?: boolean
  promoTitle?: string | null
  promoSummary?: string | null
  promoStartDate?: string | null
  promoEndDate?: string | null
  promoSlug?: string | null
  promoWebsiteUrl?: string | null
  promoYoutubeUrl?: string | null
  promoTiktokUrl?: string | null
  promoImageUrl?: string | null
  promoImageAlt?: string | null
}

function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function nullable(value: string) {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function imagePath(storeId: string) {
  return `stores/${storeId}/promo.jpg`
}

export default function PromoSettings() {
  const { storeId, isLoading, error } = useActiveStore()
  const { memberships } = useMemberships()
  const { publish } = useToast()
  const [profile, setProfile] = useState<StorePromoProfile | null>(null)
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [tiktokUrl, setTiktokUrl] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [imageAlt, setImageAlt] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')

  const activeMembership = useMemo(() => {
    if (!storeId) return null
    return memberships.find(member => member.storeId === storeId) ?? null
  }, [memberships, storeId])
  const canEdit = activeMembership?.role === 'owner' || activeMembership?.role === 'staff'

  const publicSlug = useMemo(() => {
    if (!storeId) return ''
    return buildPromoSlug(profile?.promoSlug, profile?.displayName, profile?.name, storeId)
  }, [profile, storeId])
  const publicUrl = publicSlug ? `sedifex.com/${publicSlug}` : ''

  useEffect(() => {
    let cancelled = false
    async function loadPromo() {
      if (!storeId) {
        setProfile(null)
        return
      }
      setLoadingProfile(true)
      setMessage('')
      try {
        const snapshot = await getDoc(doc(db, 'stores', storeId))
        if (cancelled) return
        const data = snapshot.exists() ? snapshot.data() as StorePromoProfile : null
        setProfile(data)
        setTitle(text(data?.promoTitle))
        setSummary(text(data?.promoSummary))
        setStartDate(text(data?.promoStartDate))
        setEndDate(text(data?.promoEndDate))
        setWebsiteUrl(text(data?.promoWebsiteUrl))
        setYoutubeUrl(text(data?.promoYoutubeUrl))
        setTiktokUrl(text(data?.promoTiktokUrl))
        setImageUrl(text(data?.promoImageUrl))
        setImageAlt(text(data?.promoImageAlt))
      } catch (loadError) {
        console.error('[promo] load failed', loadError)
        if (!cancelled) setMessage('Unable to load promo details.')
      } finally {
        if (!cancelled) setLoadingProfile(false)
      }
    }
    void loadPromo()
    return () => {
      cancelled = true
    }
  }, [storeId])

  async function uploadImage() {
    if (!storeId || !imageFile) return
    setUploading(true)
    setMessage('')
    try {
      const url = await uploadProductImage(imageFile, { storagePath: imagePath(storeId) })
      setImageUrl(url)
      setImageFile(null)
      publish({ message: 'Promo image uploaded. Save the promo to apply it.', tone: 'success' })
    } catch (uploadError) {
      console.error('[promo] upload failed', uploadError)
      setMessage('Unable to upload promo image. Try a smaller file.')
    } finally {
      setUploading(false)
    }
  }

  async function savePromo(event: React.FormEvent) {
    event.preventDefault()
    if (!storeId || !canEdit) return
    setSaving(true)
    setMessage('')
    try {
      const slug = buildPromoSlug(profile?.promoSlug, profile?.displayName, profile?.name, storeId)
      const payload = {
        promoEnabled: true,
        promoTitle: nullable(title),
        promoSummary: nullable(summary),
        promoStartDate: nullable(startDate),
        promoEndDate: nullable(endDate),
        promoSlug: slug,
        promoWebsiteUrl: nullable(websiteUrl),
        promoYoutubeUrl: nullable(youtubeUrl),
        promoTiktokUrl: nullable(tiktokUrl),
        promoImageUrl: nullable(imageUrl),
        promoImageAlt: nullable(imageAlt),
        updatedAt: Timestamp.now(),
      }
      await setDoc(doc(db, 'stores', storeId), payload, { merge: true })
      setProfile(current => ({ ...(current ?? {}), ...payload }))
      publish({ message: 'Promo saved.', tone: 'success' })
    } catch (saveError) {
      console.error('[promo] save failed', saveError)
      setMessage('Unable to save promo details.')
    } finally {
      setSaving(false)
    }
  }

  if (error) return <div role="alert">{error}</div>

  return (
    <main className="account-overview">
      <header className="account-overview__section-header">
        <div>
          <h1>Promo</h1>
          <p className="account-overview__subtitle">Create the main offer customers should see on your Sedifex public link and connected website.</p>
        </div>
      </header>

      <div className="account-overview__banner" role="note">
        <p><strong>Public URL:</strong> {publicUrl || 'Save your promo to generate your public link.'}</p>
        <p>Your promo can work together with your gallery, inventory, services, and blog posts so customers see one organized public profile.</p>
      </div>

      {isLoading || loadingProfile ? <p>Loading promo…</p> : null}
      {!storeId && !isLoading ? <p>Select a workspace first.</p> : null}
      {storeId && !canEdit ? <p className="account-overview__error">You do not have permission to edit this promo.</p> : null}
      {message ? <p className="account-overview__error" role="alert">{message}</p> : null}

      {storeId && canEdit ? (
        <div className="account-overview__grid" style={{ alignItems: 'start' }}>
          <section className="account-overview__card">
            <h2>Promo details</h2>
            <form className="account-overview__profile-form" onSubmit={savePromo}>
              <label><span>Promo title</span><input value={title} onChange={event => setTitle(event.target.value)} placeholder="50% off beauty services this month" /></label>
              <label><span>Short summary</span><textarea rows={4} value={summary} onChange={event => setSummary(event.target.value)} placeholder="Explain the offer, event, admission, campaign, or promotion in simple customer language." /></label>
              <div className="account-overview__form-grid">
                <label><span>Start date</span><input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} /></label>
                <label><span>End date</span><input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} /></label>
              </div>
              <label><span>Website link</span><input type="url" value={websiteUrl} onChange={event => setWebsiteUrl(event.target.value)} placeholder="https://..." /></label>
              <label><span>YouTube link</span><input type="url" value={youtubeUrl} onChange={event => setYoutubeUrl(event.target.value)} placeholder="https://youtube.com/..." /></label>
              <label><span>TikTok link</span><input type="url" value={tiktokUrl} onChange={event => setTiktokUrl(event.target.value)} placeholder="https://tiktok.com/..." /></label>
              <button className="button button--primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save promo'}</button>
            </form>
          </section>

          <section className="account-overview__card">
            <h2>Promo image</h2>
            {imageUrl ? <img src={imageUrl} alt={imageAlt || title || 'Promo image'} style={{ width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 16, border: '1px solid #e5e7eb' }} /> : <p className="account-overview__hint">No promo image yet.</p>}
            <form className="account-overview__website-sync-test" onSubmit={event => event.preventDefault()}>
              <label><span>Upload image</span><input type="file" accept="image/*" onChange={event => setImageFile(event.target.files?.[0] ?? null)} /></label>
              <button type="button" className="button button--secondary" disabled={!imageFile || uploading} onClick={() => void uploadImage()}>{uploading ? 'Uploading…' : 'Upload image'}</button>
              <label><span>Or image URL</span><input type="url" value={imageUrl} onChange={event => setImageUrl(event.target.value)} /></label>
              <label><span>Image alt text</span><input value={imageAlt} onChange={event => setImageAlt(event.target.value)} placeholder="Short image description" /></label>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  )
}
