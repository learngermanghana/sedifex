import SafeFirebaseImage from '../components/SafeFirebaseImage'
import React, { useEffect, useMemo, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import PageSection from '../layout/PageSection'
import { useActiveStore } from '../hooks/useActiveStore'
import { db } from '../firebase'
import './QuickPay.css'

type StoreProfile = {
  name: string
  logoUrl: string
}

type QuickPayTab = 'link' | 'print' | 'message'

function copyToClipboard(value: string) {
  if (!navigator.clipboard) return Promise.reject(new Error('Clipboard unavailable'))
  return navigator.clipboard.writeText(value)
}

function clean(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function pickStoreName(record: Record<string, unknown>, fallback: string) {
  return clean(record.businessName) || clean(record.storeName) || clean(record.name) || clean(record.displayName) || fallback
}

function pickLogo(record: Record<string, unknown>) {
  return clean(record.logoUrl) || clean(record.logo) || clean(record.photoUrl) || clean(record.imageUrl)
}

function getInitial(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || 'S'
}

export default function QuickPay() {
  const { storeId, isLoading } = useActiveStore()
  const [activeTab, setActiveTab] = useState<QuickPayTab>('link')
  const [copyStatus, setCopyStatus] = useState<string | null>(null)
  const [profile, setProfile] = useState<StoreProfile>({ name: 'Your store', logoUrl: '' })

  const quickPayUrl = useMemo(() => {
    const storeSegment = storeId ? encodeURIComponent(storeId) : 'your-store-id'
    return `https://pay.sedifex.com/s/${storeSegment}?mode=store`
  }, [storeId])

  const printUrl = '/quick-pay/print'

  const customerMessage = useMemo(() => {
    return [
      `Hello, you can pay ${profile.name} securely with Sedifex Quick Pay.`,
      '',
      `Payment link: ${quickPayUrl}`,
      '',
      'Steps:',
      '1. Open the link',
      '2. Search what you want',
      '3. Select product, service, or course',
      '4. Pay securely',
    ].join('\n')
  }, [profile.name, quickPayUrl])

  useEffect(() => {
    let mounted = true

    async function loadStoreProfile() {
      if (!storeId) return
      try {
        const snapshot = await getDoc(doc(db, 'stores', storeId))
        if (!mounted || !snapshot.exists()) return
        const data = snapshot.data() as Record<string, unknown>
        setProfile({
          name: pickStoreName(data, storeId),
          logoUrl: pickLogo(data),
        })
      } catch (error) {
        console.warn('[quick-pay] Unable to load store profile', error)
      }
    }

    void loadStoreProfile()
    return () => {
      mounted = false
    }
  }, [storeId])

  async function handleCopyLink() {
    try {
      await copyToClipboard(quickPayUrl)
      setCopyStatus('Payment link copied.')
    } catch {
      setCopyStatus('Copy failed. Select and copy the link manually.')
    }
  }

  async function handleCopyMessage() {
    try {
      await copyToClipboard(customerMessage)
      setCopyStatus('Customer message copied.')
    } catch {
      setCopyStatus('Copy failed. Select and copy the message manually.')
    }
  }

  const displayName = isLoading ? 'Preparing store…' : profile.name
  const storeInitial = getInitial(profile.name)

  return (
    <PageSection
      title="Quick Pay"
      subtitle="Use one simple payment link, a clean print poster, and a ready customer message."
    >
      <div className="quick-pay-admin">
        <section className="quick-pay-admin__hero">
          <div className="quick-pay-admin__store">
            <div className="quick-pay-admin__avatar" aria-hidden="true">
              {profile.logoUrl ? <SafeFirebaseImage src={profile.logoUrl} alt="" /> : <span>{storeInitial}</span>}
            </div>
            <div>
              <p className="quick-pay-admin__eyebrow">Quick Pay setup</p>
              <h3>{displayName}</h3>
              <p>Share the payment link with customers or print the counter poster when you need a QR code.</p>
            </div>
          </div>
        </section>

        <div className="quick-pay-admin__tabs" role="tablist" aria-label="Quick Pay tools">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'link'}
            className={activeTab === 'link' ? 'is-active' : ''}
            onClick={() => setActiveTab('link')}
          >
            Payment link
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'print'}
            className={activeTab === 'print' ? 'is-active' : ''}
            onClick={() => setActiveTab('print')}
          >
            Print poster
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'message'}
            className={activeTab === 'message' ? 'is-active' : ''}
            onClick={() => setActiveTab('message')}
          >
            Customer message
          </button>
        </div>

        {activeTab === 'link' ? (
          <section className="quick-pay-admin__panel" role="tabpanel">
            <div className="quick-pay-admin__panel-header">
              <div>
                <p className="quick-pay-admin__eyebrow">Main customer payment link</p>
                <h3>Send customers here to pay</h3>
                <p>Customers open this link, search what they want, select the item, and pay securely.</p>
              </div>
              <a className="quick-pay-admin__small-link" href={quickPayUrl} target="_blank" rel="noreferrer">
                Preview customer page
              </a>
            </div>

            <div className="quick-pay-admin__link-box">
              <label htmlFor="quick-pay-link">Payment link</label>
              <div className="quick-pay-admin__link-row">
                <input
                  id="quick-pay-link"
                  readOnly
                  value={quickPayUrl}
                  onFocus={event => event.currentTarget.select()}
                />
                <button type="button" className="button button--primary" onClick={handleCopyLink}>
                  Copy payment link
                </button>
              </div>
              <p>This is the most important link. Add it to WhatsApp, Instagram, flyers, SMS, or your website.</p>
            </div>
          </section>
        ) : null}

        {activeTab === 'print' ? (
          <section className="quick-pay-admin__panel" role="tabpanel">
            <div className="quick-pay-admin__panel-header">
              <div>
                <p className="quick-pay-admin__eyebrow">Print page link</p>
                <h3>Counter QR poster</h3>
                <p>The QR code image stays on the print page only, so this Quick Pay page stays clean.</p>
              </div>
            </div>

            <div className="quick-pay-admin__print-card">
              <div>
                <h4>Open the half-page poster</h4>
                <p>The poster shows only the store name, QR code, and payment steps. Use it for your counter, reception, classroom, or flyer.</p>
                <code>{printUrl}</code>
              </div>
              <a className="button button--primary" href={printUrl}>
                Open print page
              </a>
            </div>
          </section>
        ) : null}

        {activeTab === 'message' ? (
          <section className="quick-pay-admin__panel" role="tabpanel">
            <div className="quick-pay-admin__panel-header">
              <div>
                <p className="quick-pay-admin__eyebrow">Message to customer</p>
                <h3>Ready-to-send payment message</h3>
                <p>Copy this message and send it by WhatsApp, SMS, email, or social media inbox.</p>
              </div>
              <button type="button" className="button button--ghost" onClick={handleCopyMessage}>
                Copy message
              </button>
            </div>

            <div className="quick-pay-admin__message-card">
              <p>
                Hello, you can pay <strong>{profile.name}</strong> securely with Sedifex Quick Pay.
              </p>
              <div>
                <span>Payment link</span>
                <strong>{quickPayUrl}</strong>
              </div>
              <ol>
                <li>Open the link</li>
                <li>Search what you want</li>
                <li>Select product, service, or course</li>
                <li>Pay securely</li>
              </ol>
            </div>
          </section>
        ) : null}

        {copyStatus ? <p className="quick-pay-admin__status">{copyStatus}</p> : null}
      </div>
    </PageSection>
  )
}
