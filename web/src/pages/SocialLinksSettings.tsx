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
type StoreSettingsDoc = Record<string, unknown> & {
  websiteBuilder?: Record<string, unknown> | null
}

type ProfileField = readonly [string, string, string?]
type MediaUploadKey = 'logoUrl' | 'coverImageUrl' | 'socialShareImage'

const identityFields: ProfileField[] = [
  ['displayName', 'Business / store name', 'Used as the public business name on websites and marketplace pages.'],
  ['tagline', 'Short tagline', 'A short line for website hero sections, social previews, and public profile cards.'],
  ['businessDescription', 'Business description', 'Used by Website Builder, About sections, public pages, and SEO generators.'],
  ['openingHours', 'Opening hours', 'Example: Mon - Sat, 9:00 AM - 6:00 PM'],
  ['brandColor', 'Brand color', 'Example: #4f46e5'],
]

const contactFields: ProfileField[] = [
  ['publicPhone', 'Phone number'],
  ['whatsappNumber', 'WhatsApp number'],
  ['telegramNumber', 'Messenger number or handle'],
  ['publicEmail', 'Public email'],
  ['addressLine1', 'Address / location'],
  ['city', 'City'],
  ['country', 'Country'],
]

const socialFields: ProfileField[] = [
  ['websiteUrl', 'Existing website'],
  ['instagramHandle', 'Instagram handle or URL'],
  ['facebookUrl', 'Facebook page URL'],
  ['tiktokHandle', 'TikTok handle or URL'],
  ['youtubeUrl', 'YouTube URL'],
  ['xHandle', 'X / Twitter handle or URL'],
  ['linkedinUrl', 'LinkedIn URL'],
]

const mediaFields: ProfileField[] = [
  ['logoUrl', 'Logo URL'],
  ['coverImageUrl', 'Cover / banner image URL'],
  ['socialShareImage', 'Social share image URL'],
]

const mediaUploadOptions: Array<{ key: MediaUploadKey; label: string; buttonLabel: string; storageFolder: string }> = [
  { key: 'logoUrl', label: 'Logo upload', buttonLabel: 'Browse & upload logo', storageFolder: 'logos' },
  { key: 'coverImageUrl', label: 'Cover / banner upload', buttonLabel: 'Browse & upload banner', storageFolder: 'banners' },
  { key: 'socialShareImage', label: 'Social share upload', buttonLabel: 'Browse & upload social image', storageFolder: 'social-share' },
]

const fields = [...identityFields, ...contactFields, ...socialFields, ...mediaFields] as const
const socialOnlyKeys = new Set(socialFields.map(([key]) => key))

const text = (value: unknown) => typeof value === 'string' ? value : ''
const nullable = (value: string) => value.trim() ? value.trim() : null

function firstText(...values: unknown[]) {
  for (const value of values) {
    const normalized = text(value).trim()
    if (normalized) return normalized
  }
  return ''
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function normalizeWebsiteUrl(value: string | null) {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function normalizeBrandColor(value: string | null) {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed : null
}

function normalizeUrlLikeField(key: string, value: string | null) {
  if (key === 'websiteUrl' || key === 'facebookUrl' || key === 'youtubeUrl' || key === 'linkedinUrl' || key === 'logoUrl' || key === 'coverImageUrl' || key === 'socialShareImage') {
    return normalizeWebsiteUrl(value)
  }
  if (key === 'brandColor') return normalizeBrandColor(value)
  return value
}

function socialLinksForWebsiteBuilder(profile: PublicProfile) {
  return {
    facebook: text(profile.facebookUrl),
    instagram: text(profile.instagramHandle),
    tiktok: text(profile.tiktokHandle),
    youtube: text(profile.youtubeUrl),
    linkedin: text(profile.linkedinUrl),
    x: text(profile.xHandle),
    website: text(profile.websiteUrl),
  }
}

function buildSocialLinkAliases(profile: PublicProfile) {
  return {
    facebook: profile.facebookUrl ?? null,
    facebookUrl: profile.facebookUrl ?? null,
    instagram: profile.instagramHandle ?? null,
    instagramHandle: profile.instagramHandle ?? null,
    instagramUrl: profile.instagramHandle ?? null,
    tiktok: profile.tiktokHandle ?? null,
    tiktokHandle: profile.tiktokHandle ?? null,
    tiktokUrl: profile.tiktokHandle ?? null,
    youtube: profile.youtubeUrl ?? null,
    youtubeUrl: profile.youtubeUrl ?? null,
    linkedin: profile.linkedinUrl ?? null,
    linkedinUrl: profile.linkedinUrl ?? null,
    x: profile.xHandle ?? null,
    xHandle: profile.xHandle ?? null,
    twitterUrl: profile.xHandle ?? null,
    xUrl: profile.xHandle ?? null,
    website: profile.websiteUrl ?? null,
    websiteUrl: profile.websiteUrl ?? null,
    publicPhone: profile.publicPhone ?? null,
    whatsappNumber: profile.whatsappNumber ?? null,
    publicEmail: profile.publicEmail ?? null,
  }
}

function buildProfileFromSources(data: StoreProfile | null, settings: StoreSettingsDoc | null): PublicProfile {
  const publicProfile = getRecord(data?.publicProfile)
  const socialLinks = getRecord(data?.socialLinks)
  const website = getRecord(settings?.websiteBuilder)
  const websiteSocialLinks = getRecord(website.socialLinks)
  const businessIdentity = getRecord(website.businessIdentity)
  const seoSettings = getRecord(website.seoSettings)

  return {
    displayName: firstText(publicProfile.displayName, website.businessName, businessIdentity.businessName, data?.displayName, data?.name),
    tagline: firstText(publicProfile.tagline, website.tagline, businessIdentity.tagline, data?.tagline),
    businessDescription: firstText(publicProfile.businessDescription, website.description, businessIdentity.description, data?.description),
    openingHours: firstText(publicProfile.openingHours, website.openingHours, businessIdentity.openingHours, data?.openingHours),
    brandColor: firstText(publicProfile.brandColor, website.brandColor, businessIdentity.brandColor, data?.brandColor),
    publicPhone: firstText(publicProfile.publicPhone, website.phone, businessIdentity.phone, socialLinks.publicPhone, data?.phone, data?.phoneNumber, data?.storePhone, data?.contactPhone),
    whatsappNumber: firstText(publicProfile.whatsappNumber, website.whatsapp, businessIdentity.whatsapp, socialLinks.whatsappNumber, data?.whatsappNumber, data?.whatsapp, data?.waLink),
    telegramNumber: firstText(publicProfile.telegramNumber, socialLinks.telegramNumber, data?.telegramNumber),
    publicEmail: firstText(publicProfile.publicEmail, website.email, businessIdentity.email, socialLinks.publicEmail, data?.publicEmail, data?.email, data?.businessEmail, data?.ownerEmail),
    websiteUrl: firstText(publicProfile.websiteUrl, websiteSocialLinks.website, socialLinks.websiteUrl, socialLinks.website, data?.websiteUrl, data?.websiteLink, data?.promoWebsiteUrl, data?.storeWebsiteUrl),
    addressLine1: firstText(publicProfile.addressLine1, website.location, businessIdentity.location, data?.addressLine1, data?.address, data?.location),
    city: firstText(publicProfile.city, data?.city, data?.storeCity, data?.town),
    country: firstText(publicProfile.country, data?.country, data?.storeCountry),
    instagramHandle: firstText(publicProfile.instagramHandle, websiteSocialLinks.instagram, socialLinks.instagramHandle, socialLinks.instagram, data?.instagramHandle, data?.instagramUrl),
    facebookUrl: firstText(publicProfile.facebookUrl, websiteSocialLinks.facebook, socialLinks.facebookUrl, socialLinks.facebook, data?.facebookUrl),
    tiktokHandle: firstText(publicProfile.tiktokHandle, websiteSocialLinks.tiktok, socialLinks.tiktokHandle, socialLinks.tiktok, data?.tiktokHandle, data?.tiktokUrl),
    youtubeUrl: firstText(publicProfile.youtubeUrl, websiteSocialLinks.youtube, socialLinks.youtubeUrl, socialLinks.youtube, data?.youtubeUrl),
    xHandle: firstText(publicProfile.xHandle, websiteSocialLinks.x, socialLinks.xHandle, socialLinks.x, data?.xHandle, data?.twitterUrl, data?.xUrl),
    linkedinUrl: firstText(publicProfile.linkedinUrl, websiteSocialLinks.linkedin, socialLinks.linkedinUrl, data?.linkedinUrl),
    logoUrl: firstText(publicProfile.logoUrl, website.businessLogoUrl, businessIdentity.businessLogoUrl, socialLinks.logoUrl, data?.logoUrl, data?.storeLogoUrl, data?.businessLogoUrl),
    coverImageUrl: firstText(publicProfile.coverImageUrl, website.coverImageUrl, businessIdentity.coverImageUrl, data?.coverImageUrl, data?.bannerImageUrl),
    socialShareImage: firstText(publicProfile.socialShareImage, seoSettings.socialShareImage, data?.socialShareImage),
  }
}

function buildPublicProfilePayload(profile: PublicProfile): PublicProfile {
  return Object.fromEntries(fields.map(([key]) => {
    const raw = nullable(text(profile[key]))
    return [key, normalizeUrlLikeField(key, raw)]
  })) as PublicProfile
}

export default function SocialLinksSettings() {
  const { storeId, isLoading, error } = useActiveStore()
  const { memberships } = useMemberships()
  const { publish } = useToast()
  const [storeName, setStoreName] = useState('')
  const [profile, setProfile] = useState<PublicProfile>({})
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [saving, setSaving] = useState(false)
  const [mediaFiles, setMediaFiles] = useState<Partial<Record<MediaUploadKey, File>>>({})
  const [uploadingMediaKey, setUploadingMediaKey] = useState<MediaUploadKey | null>(null)
  const [message, setMessage] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const activeMembership = useMemo(() => storeId ? memberships.find(member => member.storeId === storeId) ?? null : null, [memberships, storeId])
  const canEdit = activeMembership?.role === 'owner' || activeMembership?.role === 'staff'
  const isUploadingMedia = Boolean(uploadingMediaKey)

  useEffect(() => {
    let cancelled = false
    async function loadProfile() {
      if (!storeId) return
      setLoadingProfile(true)
      try {
        const [storeSnapshot, settingsSnapshot] = await Promise.all([
          getDoc(doc(db, 'stores', storeId)),
          getDoc(doc(db, 'storeSettings', storeId)),
        ])
        if (cancelled) return
        const data = storeSnapshot.exists() ? storeSnapshot.data() as StoreProfile : null
        const settings = settingsSnapshot.exists() ? settingsSnapshot.data() as StoreSettingsDoc : null
        const nextProfile = buildProfileFromSources(data, settings)
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
    if (!canEdit || saving || isUploadingMedia) return
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
      const publicProfile = buildPublicProfilePayload(profile)
      const socialLinks = buildSocialLinkAliases(publicProfile)
      const websiteBuilderSocialLinks = socialLinksForWebsiteBuilder(publicProfile)
      const displayName = publicProfile.displayName ?? null
      const logoUrl = publicProfile.logoUrl ?? null
      const coverImageUrl = publicProfile.coverImageUrl ?? null
      const publicPhone = publicProfile.publicPhone ?? null
      const whatsappNumber = publicProfile.whatsappNumber ?? null
      const publicEmail = publicProfile.publicEmail ?? null
      const websiteUrl = publicProfile.websiteUrl ?? null
      const brandColor = publicProfile.brandColor ?? null
      const description = publicProfile.businessDescription ?? null
      const location = publicProfile.addressLine1 ?? null
      const now = Timestamp.now()

      await Promise.all([
        setDoc(doc(db, 'stores', storeId), {
          displayName,
          name: displayName,
          businessName: displayName,
          publicProfile,
          socialLinks,
          logoUrl,
          storeLogoUrl: logoUrl,
          businessLogoUrl: logoUrl,
          coverImageUrl,
          bannerImageUrl: coverImageUrl,
          socialShareImage: publicProfile.socialShareImage ?? null,
          tagline: publicProfile.tagline ?? null,
          description,
          openingHours: publicProfile.openingHours ?? null,
          brandColor,
          phone: publicPhone,
          phoneNumber: publicPhone,
          storePhone: publicPhone,
          contactPhone: publicPhone,
          whatsappNumber,
          whatsapp: whatsappNumber,
          waLink: whatsappNumber,
          telegramNumber: publicProfile.telegramNumber ?? null,
          publicEmail,
          email: publicEmail,
          businessEmail: publicEmail,
          websiteUrl,
          websiteLink: websiteUrl,
          storeWebsiteUrl: websiteUrl,
          addressLine1: location,
          address: location,
          location,
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
          publicProfileUpdatedAt: now,
          updatedAt: now,
        }, { merge: true }),
        setDoc(doc(db, 'storeSettings', storeId), {
          websiteBuilder: {
            businessName: displayName,
            tagline: publicProfile.tagline ?? null,
            description,
            phone: publicPhone,
            whatsapp: whatsappNumber,
            email: publicEmail,
            location,
            openingHours: publicProfile.openingHours ?? null,
            businessLogoUrl: logoUrl,
            coverImageUrl,
            brandColor,
            socialLinks: websiteBuilderSocialLinks,
            businessIdentity: {
              businessName: displayName,
              tagline: publicProfile.tagline ?? null,
              description,
              phone: publicPhone,
              whatsapp: whatsappNumber,
              email: publicEmail,
              location,
              openingHours: publicProfile.openingHours ?? null,
              businessLogoUrl: logoUrl,
              coverImageUrl,
              brandColor,
              socialLinks: websiteBuilderSocialLinks,
            },
            seoSettings: {
              socialShareImage: publicProfile.socialShareImage ?? null,
            },
            updatedAt: now,
          },
          publicProfile,
          socialLinks,
          updatedAt: now,
        }, { merge: true }),
      ])
      setStoreName(text(displayName))
      setProfile(publicProfile)
      publish({ message: 'Public profile saved and shared with Website Builder, Sedifex Market, and public pages.', tone: 'success' })
      setIsEditing(false)
    } catch (saveError) {
      console.error('[social-links] save failed', saveError)
      setMessage('Unable to save social links.')
    } finally {
      setSaving(false)
    }
  }

  async function uploadMediaFile(key: MediaUploadKey, label: string, storageFolder: string) {
    if (!storeId || !canEdit) return
    const file = mediaFiles[key]
    if (!file) {
      setMessage(`Choose a ${label.toLowerCase()} image first.`)
      return
    }
    setUploadingMediaKey(key)
    setMessage('')
    try {
      const uploadedUrl = await uploadProductImage(file, {
        storagePath: `stores/${storeId}/assets/${storageFolder}`,
      })
      setProfile(current => ({ ...current, [key]: uploadedUrl }))
      setMediaFiles(current => {
        const next = { ...current }
        delete next[key]
        return next
      })
      setIsEditing(true)
      publish({ tone: 'success', message: `${label} uploaded. Click Save shared profile to apply it everywhere.` })
    } catch (uploadError) {
      console.error('[social-links] media upload failed', uploadError)
      setMessage(`Unable to upload ${label.toLowerCase()}.`)
    } finally {
      setUploadingMediaKey(null)
    }
  }

  function renderField([key, label, hint]: ProfileField) {
    const isDescription = key === 'businessDescription'
    const isColor = key === 'brandColor'
    return (
      <label key={key}>
        <span>{label}</span>
        {isDescription ? (
          <textarea
            value={text(profile[key])}
            onFocus={beginEditing}
            onChange={event => updateField(key, event.target.value)}
            readOnly={!isEditing || saving || isUploadingMedia}
            aria-readonly={!isEditing || saving || isUploadingMedia}
            rows={4}
          />
        ) : isColor ? (
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            <input
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(text(profile[key])) ? text(profile[key]) : '#4f46e5'}
              onFocus={beginEditing}
              onChange={event => updateField(key, event.target.value)}
              disabled={!isEditing || saving || isUploadingMedia}
              style={{ width: 54, padding: 4 }}
            />
            <input
              value={text(profile[key])}
              onFocus={beginEditing}
              onChange={event => updateField(key, event.target.value)}
              readOnly={!isEditing || saving || isUploadingMedia}
              aria-readonly={!isEditing || saving || isUploadingMedia}
              placeholder="#4f46e5"
            />
          </div>
        ) : (
          <input
            value={text(profile[key])}
            onFocus={beginEditing}
            onChange={event => updateField(key, event.target.value)}
            readOnly={!isEditing || saving || isUploadingMedia}
            aria-readonly={!isEditing || saving || isUploadingMedia}
          />
        )}
        {hint ? <small>{hint}</small> : null}
        {socialOnlyKeys.has(key) && text(profile[key]).trim() ? <small>Shared social link</small> : null}
      </label>
    )
  }

  if (error) return <div role="alert">{error}</div>
  return (
    <main className="account-overview">
      <header className="account-overview__section-header">
        <div>
          <h1>Shared public profile</h1>
        </div>
      </header>
      {isLoading || loadingProfile ? <p>Loading shared public profile…</p> : null}
      {!storeId && !isLoading ? <p>Select a workspace first.</p> : null}
      {storeId && !canEdit ? <p className="account-overview__error">You do not have permission to edit this public profile.</p> : null}
      {message ? <p className="account-overview__error" role="alert">{message}</p> : null}
      {storeId && canEdit ? (
        <form className="account-overview__profile-form" onSubmit={saveSocialLinks}>
          <section className="account-overview__card" onClick={beginEditing}>
            <h2>{storeName || 'Business identity'}</h2>
            <p className="account-overview__subtitle">These fields are shared with Website Builder identity, public website headers, About sections, SEO helpers, and contact blocks.</p>
            <div className="account-overview__form-grid">
              {identityFields.map(renderField)}
            </div>
          </section>

          <section className="account-overview__card" onClick={beginEditing}>
            <h2>Contact details</h2>
            <p className="account-overview__subtitle">Used for website contact sections, booking forms, public pages, marketplace listings, and WhatsApp actions.</p>
            <div className="account-overview__form-grid">
              {contactFields.map(renderField)}
            </div>
          </section>

          <section className="account-overview__card" onClick={beginEditing}>
            <h2>Social media links</h2>
            <p className="account-overview__subtitle">These are the same links Website Builder saves under <code>websiteBuilder.socialLinks</code>.</p>
            <div className="account-overview__form-grid">
              {socialFields.map(renderField)}
            </div>
          </section>

          <section className="account-overview__card" onClick={beginEditing}>
            <h2>Logo and media</h2>
            <p className="account-overview__subtitle">Logo, banner, and social share images are shared with Website Builder and public previews.</p>
            <div className="account-overview__form-grid">
              {mediaFields.map(renderField)}
            </div>
            <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
              {mediaUploadOptions.map(option => (
                <div key={option.key} style={{ display: 'grid', gap: '0.5rem' }}>
                  <label>
                    <span>{option.label}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={event => {
                        beginEditing()
                        setMediaFiles(current => ({ ...current, [option.key]: event.target.files?.[0] ?? undefined }))
                      }}
                      disabled={saving || isUploadingMedia}
                    />
                  </label>
                  <button
                    className="button"
                    type="button"
                    onClick={() => uploadMediaFile(option.key, option.label.replace(' upload', ''), option.storageFolder)}
                    disabled={!mediaFiles[option.key] || saving || isUploadingMedia}
                  >
                    {uploadingMediaKey === option.key ? 'Uploading…' : option.buttonLabel}
                  </button>
                </div>
              ))}
            </div>
          </section>

          {isEditing ? (
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button className="button" type="button" onClick={cancelEditing} disabled={saving || isUploadingMedia}>Cancel</button>
              <button className="button button--primary" type="submit" disabled={saving || isUploadingMedia}>{saving ? 'Saving…' : 'Save shared profile'}</button>
            </div>
          ) : (
            <button className="button button--primary" type="button" onClick={beginEditing}>Edit shared profile</button>
          )}
        </form>
      ) : null}
    </main>
  )
}
