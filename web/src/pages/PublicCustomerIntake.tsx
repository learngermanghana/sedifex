import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { BrowserQRCodeSvgWriter } from '@zxing/browser'
import { EncodeHintType, QRCodeDecoderErrorCorrectionLevel } from '@zxing/library'
import './PublicCustomerIntake.css'

type IntakeProfile = {
  storeName: string | null
  tagline: string
}

type SubmissionState = 'idle' | 'submitting' | 'success' | 'error'

export default function PublicCustomerIntake() {
  const { storeId = '', mode } = useParams<{ storeId: string; mode?: string }>()
  const [profile, setProfile] = useState<IntakeProfile>({ storeName: null, tagline: 'Join our customer list.' })
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [submissionState, setSubmissionState] = useState<SubmissionState>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [qrSvg, setQrSvg] = useState('')

  const isQrMode = mode === 'qr'
  const intakeUrl = useMemo(() => {
    if (!storeId || typeof window === 'undefined') return ''
    return `${window.location.origin}/join-customers/${encodeURIComponent(storeId)}`
  }, [storeId])

  useEffect(() => {
    let active = true

    async function loadProfile() {
      if (!storeId) {
        setLoadingProfile(false)
        setMessage('Invalid store link.')
        return
      }

      try {
        const response = await fetch(`/api/public-customer-intake?storeId=${encodeURIComponent(storeId)}`)
        const payload = (await response.json()) as {
          storeName?: string | null
          tagline?: string | null
          error?: string
        }
        if (!active) return

        if (!response.ok) {
          setProfile({ storeName: null, tagline: 'Join our customer list.' })
          setMessage(payload.error ?? 'This customer link is unavailable.')
          return
        }

        setProfile({
          storeName: payload.storeName?.trim() || null,
          tagline: payload.tagline?.trim() || 'Join our customer list.',
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
  }, [storeId])

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
    if (!storeId) return

    setSubmissionState('submitting')
    setMessage(null)

    try {
      const response = await fetch('/api/public-customer-intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          name,
          phone,
          email,
          notes,
        }),
      })

      const payload = (await response.json()) as { ok?: boolean; error?: string }
      if (!response.ok || !payload.ok) {
        setSubmissionState('error')
        setMessage(payload.error ?? 'Could not submit details. Please try again.')
        return
      }

      setSubmissionState('success')
      setMessage('Thanks! Your details have been saved.')
      setName('')
      setPhone('')
      setEmail('')
      setNotes('')
    } catch (error) {
      console.error('[public-customer-intake] Failed to submit profile', error)
      setSubmissionState('error')
      setMessage('Network error. Please try again.')
    }
  }

  const title = profile.storeName || 'Sedifex'

  if (isQrMode) {
    return (
      <main className="public-customer-intake public-customer-intake--qr">
        <section className="public-customer-intake__card">
          <p className="public-customer-intake__kicker">Customer Invite</p>
          <h1>Hello, kindly scan to join our customer list.</h1>
          <p>{profile.storeName ? `You are joining ${profile.storeName}.` : 'You are joining our customer list.'}</p>
          <p>After scanning, submit your details and download or print this card if needed.</p>
          {qrSvg ? (
            <div
              className="public-customer-intake__qr"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
              aria-label="Customer intake QR code"
            />
          ) : (
            <div className="public-customer-intake__qr public-customer-intake__qr--empty">QR unavailable</div>
          )}
          <p className="public-customer-intake__link">{intakeUrl}</p>
          <button type="button" className="button button--primary" onClick={() => window.print()}>
            Print poster
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="public-customer-intake">
      <section className="public-customer-intake__card">
        <p className="public-customer-intake__kicker">{title}</p>
        <h1>Join our customer list</h1>
        <p>{profile.tagline}</p>

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
