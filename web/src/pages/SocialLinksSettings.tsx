import React, { useEffect, useMemo, useState } from 'react'
import { Timestamp, doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import { useMemberships } from '../hooks/useMemberships'
import { useToast } from '../components/ToastProvider'
import './AccountOverview.css'

type PublicProfile = Record<string, string | null | undefined>
type StoreProfile = { name?: string | null; displayName?: string | null; publicProfile?: PublicProfile | null; socialLinks?: PublicProfile | null }
const fields = [
  ['logoUrl', 'Logo URL'],
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
  const [message, setMessage] = useState('')
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
    } catch (saveError) {
      console.error('[social-links] save failed', saveError)
      setMessage('Unable to save social links.')
    } finally {
      setSaving(false)
    }
  }

  if (error) return <div role="alert">{error}</div>
  return (
    <main className="account-overview">
      <header className="account-overview__section-header"><div><h1>Social links</h1><p className="account-overview__subtitle">Save public contact and social data once so your public page and website integrations can reuse it.</p></div></header>
      <div className="account-overview__banner" role="note"><p><strong>Account stays internal.</strong> This page is for customer-facing brand and contact details only.</p></div>
      {isLoading || loadingProfile ? <p>Loading social links…</p> : null}
      {!storeId && !isLoading ? <p>Select a workspace first.</p> : null}
      {storeId && !canEdit ? <p className="account-overview__error">You do not have permission to edit social links.</p> : null}
      {message ? <p className="account-overview__error" role="alert">{message}</p> : null}
      {storeId && canEdit ? <form className="account-overview__profile-form" onSubmit={saveSocialLinks}><section className="account-overview__card"><h2>{storeName || 'Public profile'}</h2><div className="account-overview__form-grid">{fields.map(([key, label]) => <label key={key}><span>{label}</span><input value={text(profile[key])} onChange={event => updateField(key, event.target.value)} /></label>)}</div></section><button className="button button--primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save public profile'}</button></form> : null}
    </main>
  )
}
