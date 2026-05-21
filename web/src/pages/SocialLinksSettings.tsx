import React, { useEffect, useMemo, useState } from 'react'
import { Timestamp, doc, getDoc, setDoc } from 'firebase/firestore'
import { uploadProductImage } from '../api/productImageUpload'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import { useMemberships } from '../hooks/useMemberships'
import { useToast } from '../components/ToastProvider'
import './AccountOverview.css'

type PublicProfile = Record<string, string | null | undefined>
type StoreProfile = Record<string, unknown> & {
  name?: string | null
  displayName?: string | null
  publicProfile?: PublicProfile | null
  socialLinks?: PublicProfile | null
}

const fields = [
  ['displayName', 'Business / store name'],
  ['publicPhone', 'Phone number'],
  ['whatsappNumber', 'WhatsApp number'],
  ['telegramNumber', 'Messenger number or handle'],
  ['publicEmail', 'Public email'],
  ['websiteUrl', 'Website'],
  ['addressLine1', 'Address'],
  ['city', 'City'],
  ['country', 'Country'],
  ['instagramHandle', 'Instagram handle'],
  ['facebookUrl', 'Facebook page URL'],
  ['tiktokHandle', 'TikTok handle'],
  ['youtubeUrl', 'YouTube URL'],
  ['xHandle', 'X / Twitter handle'],
  ['linkedinUrl', 'LinkedIn URL'],
] as const

const text = (value: unknown) => typeof value === 'string' ? value : ''
const nullable = (value: string) => value.trim() ? value.trim() : null

function firstText(...values: unknown[]) {
  for (const value of values) {
    const normalized = text(value).trim()
    if (normalized) return normalized
  }
  return ''
}

function normalizeWebsiteUrl(value: string | null) {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function buildProfileFromStore(data: StoreProfile | null): PublicProfile {
  const publicProfile = data?.publicProfile ?? {}
  const socialLinks = data?.socialLinks ?? {}

  return {
    displayName: firstText(publicProfile.displayName, data?.displayName, data?.name),
    publicPhone: firstText(publicProfile.publicPhone, socialLinks.publicPhone, data?.phone, data?.phoneNumber, data?.storePhone, data?.contactPhone),
    whatsappNumber: firstText(publicProfile.whatsappNumber, socialLinks.whatsappNumber, data?.whatsappNumber, data?.waLink),
    telegramNumber: firstText(publicProfile.telegramNumber, socialLinks.telegramNumber, data?.telegramNumber),
    publicEmail: firstText(publicProfile.publicEmail, socialLinks.publicEmail, data?.publicEmail, data?.email, data?.ownerEmail),
    websiteUrl: firstText(publicProfile.websiteUrl, socialLinks.websiteUrl, data?.websiteUrl, data?.websiteLink, data?.promoWebsiteUrl, data?.storeWebsiteUrl),
    addressLine1: firstText(publicProfile.addressLine1, data?.addressLine1, data?.address),
    city: firstText(publicProfile.city, data?.city, data?.storeCity, data?.town),
    country: firstText(publicProfile.country, data?.country, data?.storeCountry),
    instagramHandle: firstText(publicProfile.instagramHandle, socialLinks.instagramHandle, data?.instagramHandle, data?.instagramUrl),
    facebookUrl: firstText(publicProfile.facebookUrl, socialLinks.facebookUrl, data?.facebookUrl),
    tiktokHandle: firstText(publicProfile.tiktokHandle, socialLinks.tiktokHandle, data?.tiktokHandle, data?.tiktokUrl),
    youtubeUrl: firstText(publicProfile.youtubeUrl, socialLinks.youtubeUrl, data?.youtubeUrl),
    xHandle: firstText(publicProfile.xHandle, socialLinks.xHandle, data?.xHandle, data?.twitterUrl, data?.xUrl),
    linkedinUrl: firstText(publicProfile.linkedinUrl, socialLinks.linkedinUrl, data?.linkedinUrl),
    logoUrl: firstText(publicProfile.logoUrl, socialLinks.logoUrl, data?.logoUrl, data?.storeLogoUrl),
  }
}

export default function SocialLinksSettings() {
  const { storeId, isLoading, error } = useActiveStore()
  const { memberships } = useMemberships()
  const { publish } = useToast()
  const [storeName, setStoreName] = useState('')
  const [profile, setProfile] = useState<PublicProfile>({})
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [saving, setSaving] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [message, setMessage] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const activeMembership = useMemo(() => storeId ? memberships.find(member => member.storeId === storeId) ?? null : null, [memberships, storeId])
  const canEdit = activeMembership?.role === 'owner' || activeMembership?.role === 'staff'

  useEffect(() => {
    let cancelled = false
    async function loadProfile() {
      if (!storeId) return
      setLoadingProfile(true)
      try {
        const snapshot = await getDoc(doc(db, 'stores', storeId))
        if (cancelled) return
        const data = snapshot.exists() ? snapshot.data() as StoreProfile : null
        const nextProfile = buildProfileFromStore(data)
        setStoreName(firstText(nextProfile.displayName, data?.displayName, data?.name))
        setProfile(nextProfile)
        setIsEditing(false)
      } catch (loadError) {
        console.error('[social-links] load failed', loadError)
        if (!cancelled) setMessage('Unable to load social links.')
      } finally {
        if (!cancelled) setLoadingProfile(false)
      }
    }
    void loadProfile()
    return () => { cancelled = true }
  }, [storeId])

  function updateField(key: string, value: string) {
    setProfile(current => ({ ...current, [key]: value }))
  }

  function beginEditing() {
    if (!canEdit || saving || uploadingLogo) return
    setMessage('')
    setIsEditing(true)
  }

  function cancelEditing() {
    setMessage('')
    setIsEditing(false)
  }

  async function saveSocialLinks(event: React.FormEvent) {
    event.preventDefault()
    if (!storeId || !canEdit) return
    setSaving(true)
    setMessage('')
    try {
      const publicProfile = Object.fromEntries(fields.map(([key]) => [key, key === 'websiteUrl' ? normalizeWebsiteUrl(nullable(text(profile[key]))) : nullable(text(profile[key]))])) as PublicProfile
      const logoUrl = nullable(text(profile.logoUrl))
      const publicPhone = publicProfile.publicPhone ?? null
      const whatsappNumber = publicProfile.whatsappNumber ?? null
      const publicEmail = publicProfile.publicEmail ?? null
      const websiteUrl = publicProfile.websiteUrl ?? null
      const displayName = publicProfile.displayName ?? null

      await setDoc(doc(db, 'stores', storeId), {
        displayName,
        name: displayName,
        publicProfile: { ...publicProfile, logoUrl },
        socialLinks: { ...publicProfile, logoUrl },
        logoUrl,
        storeLogoUrl: logoUrl,
        phone: publicPhone,
        phoneNumber: publicPhone,
        storePhone: publicPhone,
        contactPhone: publicPhone,
        whatsappNumber,
        waLink: whatsappNumber,
        telegramNumber: publicProfile.telegramNumber ?? null,
        publicEmail,
        email: publicEmail,
        websiteUrl,
        websiteLink: websiteUrl,
        storeWebsiteUrl: websiteUrl,
        addressLine1: publicProfile.addressLine1 ?? null,
        city: publicProfile.city ?? null,
        storeCity: publicProfile.city ?? null,
        country: publicProfile.country ?? null,
        storeCountry: publicProfile.country ?? null,
        instagramHandle: publicProfile.instagramHandle ?? null,
        instagramUrl: publicProfile.instagramHandle ?? null,
        facebookUrl: publicProfile.facebookUrl ?? null,
        tiktokHandle: publicProfile.tiktokHandle ?? null,
        tiktokUrl: publicProfile.tiktokHandle ?? null,
        youtubeUrl: publicProfile.youtubeUrl ?? null,
        xHandle: publicProfile.xHandle ?? null,
        twitterUrl: publicProfile.xHandle ?? null,
        xUrl: publicProfile.xHandle ?? null,
        linkedinUrl: publicProfile.linkedinUrl ?? null,
        publicProfileUpdatedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }, { merge: true })
      setStoreName(text(displayName))
      publish({ message: 'Public profile saved for Sedifex Market and website integrations.', tone: 'success' })
      setIsEditing(false)
    } catch (saveError) {
      console.error('[social-links] save failed', saveError)
      setMessage('Unable to save social links.')
    } finally {
      setSaving(false)
    }
  }

  async function uploadLogoFile() {
    if (!storeId || !canEdit) return
    if (!logoFile) {
      setMessage('Choose a logo image first.')
      return
    }
    setUploadingLogo(true)
    setMessage('')
    try {
      const uploadedUrl = await uploadProductImage(logoFile, {
        storagePath: `stores/${storeId}/assets/logo.jpg`,
      })
      setProfile(current => ({ ...current, logoUrl: uploadedUrl }))
      setLogoFile(null)
      setIsEditing(true)
      publish({ tone: 'success', message: 'Logo uploaded. Click Save public profile to apply everywhere.' })
    } catch (uploadError) {
      console.error('[social-links] logo upload failed', uploadError)
      setMessage('Unable to upload logo.')
    } finally {
      setUploadingLogo(false)
    }
  }

  if (error) return <div role="alert">{error}</div>
  return (
    <main className="account-overview">
      <header className="account-overview__section-header">
        <div>
          <h1>Public business profile</h1>
          <p className="account-overview__subtitle">Save business name, website, logo, phone, WhatsApp, address, and social links once so Sedifex Market, client websites, booking forms, and integrations can pull the same data everywhere.</p>
        </div>
      </header>
      <div className="account-overview__banner" role="note"><p><strong>Source for public apps.</strong> Website integrations, marketplace pages, booking pages, and external apps should read these store profile fields from <code>stores/{storeId}</code>.</p></div>
      <div className="account-overview__banner" role="note"><p><strong>Click any box to edit.</strong> You can still use the Edit button, but the inputs now enter edit mode when focused.</p></div>
      {isLoading || loadingProfile ? <p>Loading public profile…</p> : null}
      {!storeId && !isLoading ? <p>Select a workspace first.</p> : null}
      {storeId && !canEdit ? <p className="account-overview__error">You do not have permission to edit this public profile.</p> : null}
      {message ? <p className="account-overview__error" role="alert">{message}</p> : null}
      {storeId && canEdit ? (
        <form className="account-overview__profile-form" onSubmit={saveSocialLinks}>
          <section className="account-overview__card" onClick={beginEditing}>
            <h2>{storeName || 'Public profile'}</h2>
            <div className="account-overview__form-grid">
              {fields.map(([key, label]) => (
                <label key={key}>
                  <span>{label}</span>
                  <input
                    value={text(profile[key])}
                    onFocus={beginEditing}
                    onChange={event => updateField(key, event.target.value)}
                    readOnly={!isEditing || saving || uploadingLogo}
                    aria-readonly={!isEditing || saving || uploadingLogo}
                  />
                </label>
              ))}
            </div>
          </section>
          <section className="account-overview__card" onClick={beginEditing}>
            <h2>Logo</h2>
            <div className="account-overview__form-grid">
              <label>
                <span>Logo URL</span>
                <input
                  value={text(profile.logoUrl)}
                  onFocus={beginEditing}
                  onChange={event => updateField('logoUrl', event.target.value)}
                  readOnly={!isEditing || saving || uploadingLogo}
                  aria-readonly={!isEditing || saving || uploadingLogo}
                />
              </label>
            </div>
            <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <label>
                <span>Logo upload</span>
                <input type="file" accept="image/*" onChange={event => { beginEditing(); setLogoFile(event.target.files?.[0] ?? null) }} disabled={saving || uploadingLogo} />
              </label>
              <button className="button" type="button" onClick={uploadLogoFile} disabled={!logoFile || saving || uploadingLogo}>{uploadingLogo ? 'Uploading…' : 'Browse & upload logo'}</button>
            </div>
          </section>
          {isEditing ? (
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button className="button" type="button" onClick={cancelEditing} disabled={saving || uploadingLogo}>Cancel</button>
              <button className="button button--primary" type="submit" disabled={saving || uploadingLogo}>{saving ? 'Saving…' : 'Save public profile'}</button>
            </div>
          ) : (
            <button className="button button--primary" type="button" onClick={beginEditing}>Edit public profile</button>
          )}
        </form>
      ) : null}
    </main>
  )
}
