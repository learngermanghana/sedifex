import React, { useEffect, useMemo, useState } from 'react'
import { Timestamp, doc, getDoc, setDoc } from 'firebase/firestore'
import { uploadProductImage } from '../api/productImageUpload'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import { useMemberships } from '../hooks/useMemberships'
import { useToast } from '../components/ToastProvider'
import './AccountOverview.css'

type PublicProfile = Record<string, string | null | undefined>
type StoreProfile = { name?: string | null; displayName?: string | null; publicProfile?: PublicProfile | null; socialLinks?: PublicProfile | null }
const fields = [
  ['publicPhone', 'Phone number'],
  ['whatsappNumber', 'WhatsApp number'],
  ['telegramNumber', 'Messenger number or handle'],
  ['publicEmail', 'Public email'],
  ['websiteUrl', 'Website'],
  ['instagramHandle', 'Instagram handle'],
  ['facebookUrl', 'Facebook page URL'],
  ['tiktokHandle', 'TikTok handle'],
  ['youtubeUrl', 'YouTube URL'],
  ['xHandle', 'X / Twitter handle'],
  ['linkedinUrl', 'LinkedIn URL'],
] as const
const text = (value: unknown) => typeof value === 'string' ? value : ''
const nullable = (value: string) => value.trim() ? value.trim() : null

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
        const publicProfile = data?.publicProfile ?? {}
        const socialLinks = data?.socialLinks ?? {}
        setStoreName(text(data?.displayName) || text(data?.name))
        setProfile(Object.fromEntries(fields.map(([key]) => [key, text(publicProfile[key]) || text(socialLinks[key])])) as PublicProfile)
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
      const publicProfile = Object.fromEntries(fields.map(([key]) => [key, nullable(text(profile[key]))])) as PublicProfile
      await setDoc(doc(db, 'stores', storeId), {
        publicProfile,
        logoUrl: publicProfile.logoUrl,
        phoneNumber: publicProfile.publicPhone,
        whatsappNumber: publicProfile.whatsappNumber,
        telegramNumber: publicProfile.telegramNumber,
        publicEmail: publicProfile.publicEmail,
        websiteUrl: publicProfile.websiteUrl,
        socialLinks: publicProfile,
        publicProfileUpdatedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }, { merge: true })
      publish({ message: 'Social links saved.', tone: 'success' })
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
      <header className="account-overview__section-header"><div><h1>Public contact hub</h1><p className="account-overview__subtitle">Save logo, phone, WhatsApp, Telegram, and social handles once so Sedifex public pages and website integrations can pull the same data everywhere.</p></div></header>
      <div className="account-overview__banner" role="note"><p><strong>Account stays internal.</strong> This page is for customer-facing brand and contact details only.</p></div>
      <div className="account-overview__banner" role="note"><p><strong>No duplicate account records.</strong> This page only updates your workspace public profile fields and reuses the same source for integrations.</p></div>
      {isLoading || loadingProfile ? <p>Loading social links…</p> : null}
      {!storeId && !isLoading ? <p>Select a workspace first.</p> : null}
      {storeId && !canEdit ? <p className="account-overview__error">You do not have permission to edit social links.</p> : null}
      {message ? <p className="account-overview__error" role="alert">{message}</p> : null}
      {storeId && canEdit ? <form className="account-overview__profile-form" onSubmit={saveSocialLinks}><section className="account-overview__card"><h2>{storeName || 'Public profile'}</h2><div className="account-overview__form-grid">{fields.map(([key, label]) => <label key={key}><span>{label}</span><input value={text(profile[key])} onChange={event => updateField(key, event.target.value)} disabled={!isEditing || saving || uploadingLogo} /></label>)}</div></section>{isEditing ? <div style={{ display: 'flex', gap: '0.75rem' }}><button className="button" type="button" onClick={cancelEditing} disabled={saving || uploadingLogo}>Cancel</button><button className="button button--primary" type="submit" disabled={saving || uploadingLogo}>{saving ? 'Saving…' : 'Save public profile'}</button></div> : <button className="button button--primary" type="button" onClick={beginEditing}>Edit public profile</button>}<section className="account-overview__card"><h2>Logo</h2><div className="account-overview__form-grid"><label><span>Logo URL</span><input value={text(profile.logoUrl)} onChange={event => updateField('logoUrl', event.target.value)} disabled={!isEditing || saving || uploadingLogo} /></label></div><div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}><label><span>Logo upload</span><input type="file" accept="image/*" onChange={event => setLogoFile(event.target.files?.[0] ?? null)} disabled={!isEditing || saving || uploadingLogo} /></label><button className="button" type="button" onClick={uploadLogoFile} disabled={!isEditing || !logoFile || saving || uploadingLogo}>{uploadingLogo ? 'Uploading…' : 'Browse & upload logo'}</button></div></section></form> : null}
    </main>
  )
}
