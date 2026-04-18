import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { BrowserQRCodeSvgWriter } from '@zxing/browser'
import { EncodeHintType, QRCodeDecoderErrorCorrectionLevel } from '@zxing/library'
import './PublicCustomerIntake.css'

type IntakeProfile = {
  storeName: string | null
  tagline: string
  headline: string
  cta: string
  accentColor: string
  logoUrl: string | null
  vanityPath: string
}

type SubmissionState = 'idle' | 'submitting' | 'success' | 'error'

function normalizeAccentColor(input: string | null | undefined): string {
  if (!input) return '#4f46e5'
  return /^#[0-9a-fA-F]{6}$/.test(input) ? input : '#4f46e5'
}

export default function PublicCustomerIntake() {
  const { inviteId = '', mode } = useParams<{ inviteId: string; mode?: string }>()
  const [profile, setProfile] = useState<IntakeProfile>({
    storeName: null,
    tagline: 'Share your details below to join our customer list.',
    headline: 'Hello, kindly scan to join our customer list.',
    cta: 'Join now for updates and priority support.',
    accentColor: '#4f46e5',
    logoUrl: null,
    vanityPath: '',
  })
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [submissionState, setSubmissionState] = useState<SubmissionState>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [consentChecked, setConsentChecked] = useState(false)
  const [qrSvg, setQrSvg] = useState('')
  const [variant, setVariant] = useState<'a4' | 'a5'>('a4')
  const [formStartedAt] = useState(() => Date.now())
  const [websiteTrap, setWebsiteTrap] = useState('')

  const isQrMode = mode === 'qr'
  const intakeUrl = useMemo(() => {
    if (!inviteId || typeof window === 'undefined') return ''
    return `${window.location.origin}/join-customers/${encodeURIComponent(inviteId)}`
  }, [inviteId])
  const fallbackLink = useMemo(() => profile.vanityPath || intakeUrl, [profile.vanityPath, intakeUrl])

  useEffect(() => {
    let active = true

    async function loadProfile() {
      if (!inviteId) {
        setLoadingProfile(false)
        setMessage('Invalid customer invite link.')
        return
      }

      try {
        const response = await fetch(`/api/public-customer-intake?inviteId=${encodeURIComponent(inviteId)}`)
        const payload = (await response.json()) as {
          storeName?: string | null
          tagline?: string | null
          headline?: string | null
          cta?: string | null
          accentColor?: string | null
          logoUrl?: string | null
          vanityPath?: string | null
          error?: string
        }
        if (!active) return

        if (!response.ok) {
          setProfile({
            storeName: null,
            tagline: 'Share your details below to join our customer list.',
            headline: 'Hello, kindly scan to join our customer list.',
            cta: 'Join now for updates and priority support.',
            accentColor: '#4f46e5',
            logoUrl: null,
            vanityPath: '',
          })
          setMessage(payload.error ?? 'This customer link is unavailable.')
          return
        }

        setProfile({
          storeName: payload.storeName?.trim() || null,
          tagline: payload.tagline?.trim() || 'Share your details below to join our customer list.',
          headline: payload.headline?.trim() || 'Hello, kindly scan to join our customer list.',
          cta: payload.cta?.trim() || 'Join now for updates and priority support.',
          accentColor: normalizeAccentColor(payload.accentColor),
          logoUrl: payload.logoUrl?.trim() || null,
          vanityPath: payload.vanityPath?.trim() || '',
        })
      } catch (error) {
        if (!active) return
        console.error('[public-customer-intake] Failed to load store profile', error)
        setMessage('Unable to load this customer link right now.')
      } finally {
        if (active) setLoadingProfile(false)
      }
    }

    void loadProfile()
    return () => {
      active = false
    }
  }, [inviteId])

  useEffect(() => {
    if (!isQrMode || !intakeUrl) return
    try {
      const writer = new BrowserQRCodeSvgWriter()
      const hints = new Map()
      hints.set(EncodeHintType.ERROR_CORRECTION, QRCodeDecoderErrorCorrectionLevel.H)
      const svg = writer.write(intakeUrl, 512, 512, hints).outerHTML
      setQrSvg(svg)
    } catch (error) {
      console.error('[public-customer-intake] Failed to render QR code', error)
      setQrSvg('')
    }
  }, [isQrMode, intakeUrl])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!inviteId) return

    if (!consentChecked) {
      setSubmissionState('error')
      setMessage('Please agree to be contacted before submitting.')
      return
    }

    setSubmissionState('submitting')
    setMessage(null)

    try {
      const response = await fetch('/api/public-customer-intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteId,
          name,
          phone,
          email,
          notes,
          consent: true,
          consentSource: 'public-customer-intake',
          submittedFrom: 'link',
          formStartedAt,
          website: websiteTrap,
          utmSource:
            typeof window !== 'undefined' ? new URL(window.location.href).searchParams.get('utm_source') : null,
        }),
      })

      const payload = (await response.json()) as { ok?: boolean; error?: string; whatsappLink?: string | null }
      if (!response.ok || !payload.ok) {
        setSubmissionState('error')
        setMessage(payload.error ?? 'Could not submit details. Please try again.')
        return
      }

      setSubmissionState('success')
      setMessage(payload.whatsappLink ? 'Saved. You can now close this page or continue on WhatsApp.' : 'Saved. You can now close this page.')
      setName('')
      setPhone('')
      setEmail('')
      setNotes('')
      setConsentChecked(false)
      setWebsiteTrap('')
    } catch (error) {
      console.error('[public-customer-intake] Failed to submit profile', error)
      setSubmissionState('error')
      setMessage('Network error. Please try again.')
    }
  }

  const title = profile.storeName || 'Sedifex'

  if (isQrMode) {
    return (
      <main className={`public-customer-intake public-customer-intake--qr public-customer-intake--${variant}`}>
        <section className="public-customer-intake__card" style={{ borderColor: `${profile.accentColor}33` }}>
          {profile.logoUrl ? <img src={profile.logoUrl} alt={`${title} logo`} className="public-customer-intake__logo" /> : null}
          <p className="public-customer-intake__kicker" style={{ color: profile.accentColor }}>Customer Invite</p>
          <h1 className="public-customer-intake__headline">{profile.headline}</h1>
          <p>{profile.storeName ? `You are joining ${profile.storeName} customer list.` : 'You are joining our customer list.'}</p>
          <p>{profile.cta}</p>
          <p className="public-customer-intake__fallback">
            This QR code stays active unless the business rotates or revokes the invite link.
          </p>
          {qrSvg ? (
            <div
              className="public-customer-intake__qr"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
              aria-label="Customer intake QR code"
            />
          ) : (
            <div className="public-customer-intake__qr public-customer-intake__qr--empty">QR unavailable</div>
          )}
          {fallbackLink ? (
            <a className="public-customer-intake__link" href={fallbackLink} target="_blank" rel="noreferrer">
              {fallbackLink}
            </a>
          ) : (
            <p className="public-customer-intake__link">Link unavailable. Please request a new invite link.</p>
          )}
          <p className="public-customer-intake__fallback">If QR fails, type this link in your browser.</p>
          <div className="customers-page__form-actions">
            <button type="button" className="button button--ghost" onClick={() => setVariant(variant === 'a4' ? 'a5' : 'a4')}>
              Switch to {variant === 'a4' ? 'A5' : 'A4'}
            </button>
            <button type="button" className="button button--primary" onClick={() => window.print()}>
              Print / Save PDF
            </button>
          </div>
          <p className="public-customer-intake__powered-by">Powered by Sedifex</p>
        </section>
      </main>
    )
  }

  return (
    <main className="public-customer-intake">
      <section className="public-customer-intake__card" style={{ borderColor: `${profile.accentColor}33` }}>
        {profile.logoUrl ? <img src={profile.logoUrl} alt={`${title} logo`} className="public-customer-intake__logo" /> : null}
        <p className="public-customer-intake__kicker" style={{ color: profile.accentColor }}>{title}</p>
        <h1>{profile.storeName ? `Join ${profile.storeName} customer list` : 'Join our customer list'}</h1>
        <p className="public-customer-intake__intro">{profile.tagline}</p>

        {loadingProfile ? <p className="public-customer-intake__status">Loading…</p> : null}

        <form className="public-customer-intake__form" onSubmit={submit}>
          <label>
            Full name
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="Your full name"
              required
              autoComplete="name"
            />
          </label>
          <label>
            Phone
            <input
              value={phone}
              onChange={event => setPhone(event.target.value)}
              placeholder="e.g. 024 000 0000"
              autoComplete="tel"
            />
          </label>
          <label>
            Email
            <input
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="you@example.com"
              type="email"
              autoComplete="email"
            />
          </label>
          <label>
            Notes (optional)
            <textarea
              value={notes}
              onChange={event => setNotes(event.target.value)}
              rows={3}
              placeholder="Any note you want us to know"
            />
          </label>
          <label className="public-customer-intake__consent">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={event => setConsentChecked(event.target.checked)}
              required
            />
            I agree to be contacted by this business about products, services, and updates.
          </label>
          <input
            className="public-customer-intake__bot-trap"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={websiteTrap}
            onChange={event => setWebsiteTrap(event.target.value)}
            placeholder="website"
          />
          <button
            type="submit"
            className="button button--primary"
            disabled={submissionState === 'submitting' || loadingProfile}
          >
            {submissionState === 'submitting' ? 'Submitting…' : 'Save my details'}
          </button>
        </form>

        {message ? (
          <p
            className={`public-customer-intake__status ${
              submissionState === 'error' ? 'public-customer-intake__status--error' : ''
            }`}
            role="status"
          >
            {message}
          </p>
        ) : null}
      </section>
    </main>
  )
}
