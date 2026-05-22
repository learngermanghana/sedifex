import React, { useEffect, useMemo, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import PageSection from '../layout/PageSection'
import { useActiveStore } from '../hooks/useActiveStore'
import { db } from '../firebase'

type StoreProfile = {
  name: string
  logoUrl: string
  phone: string
}

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

function pickPhone(record: Record<string, unknown>) {
  return clean(record.phone) || clean(record.businessPhone) || clean(record.whatsapp) || clean(record.whatsappNumber)
}

export default function QuickPay() {
  const { storeId, isLoading } = useActiveStore()
  const [copyStatus, setCopyStatus] = useState<string | null>(null)
  const [profile, setProfile] = useState<StoreProfile>({ name: 'Your store', logoUrl: '', phone: '' })

  const quickPayUrl = useMemo(() => {
    const storeSegment = storeId ? encodeURIComponent(storeId) : 'your-store-id'
    return `https://pay.sedifex.com/s/${storeSegment}?mode=store`
  }, [storeId])

  const printUrl = '/quick-pay/print'

  const qrCodeUrl = useMemo(() => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(quickPayUrl)}`
  }, [quickPayUrl])

  const customerMessage = useMemo(() => {
    return `Pay ${profile.name} securely with Sedifex Quick Pay. Open this link, search what you want to buy or pay for, and complete payment: ${quickPayUrl}`
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
          phone: pickPhone(data),
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

  return (
    <PageSection
      title="Quick Pay"
      subtitle="Share one payment link or print a QR poster so customers can search items, pay, and have the order recorded in Sedifex."
      actions={
        <div className="flex flex-wrap gap-3">
          <button type="button" className="button button--ghost" onClick={handleCopyMessage}>
            Copy customer message
          </button>
          <button type="button" className="button button--primary" onClick={handleCopyLink}>
            Copy payment link
          </button>
        </div>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(340px,0.7fr)]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 text-2xl font-black text-white">
              {profile.logoUrl ? <img src={profile.logoUrl} alt="" className="h-full w-full object-cover" /> : profile.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Store payment link</p>
              <h3 className="mt-1 text-2xl font-bold text-slate-950">{profile.name}</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                This is the main link customers use after scanning your QR or receiving your payment link. They search products, services, or courses and pay securely.
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <label className="block text-sm font-semibold text-slate-700" htmlFor="quick-pay-link">
              Payment link
            </label>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <input
                id="quick-pay-link"
                className="min-h-12 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-950 outline-none focus:border-indigo-500"
                readOnly
                value={quickPayUrl}
                onFocus={event => event.currentTarget.select()}
              />
              <button type="button" className="button button--primary" onClick={handleCopyLink}>
                Copy link
              </button>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <label className="block text-sm font-semibold text-slate-700" htmlFor="quick-pay-message">
              Message to send to customers
            </label>
            <textarea
              id="quick-pay-message"
              className="mt-2 min-h-28 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm leading-6 text-slate-950 outline-none focus:border-indigo-500"
              readOnly
              value={customerMessage}
              onFocus={event => event.currentTarget.select()}
            />
            <div className="mt-3 flex flex-wrap gap-3">
              <button type="button" className="button button--ghost" onClick={handleCopyMessage}>
                Copy message
              </button>
              <a
                className="button button--ghost"
                href={`https://wa.me/?text=${encodeURIComponent(customerMessage)}`}
                target="_blank"
                rel="noreferrer"
              >
                Share on WhatsApp
              </a>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <a className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 text-decoration-none transition hover:bg-indigo-100" href={printUrl}>
              <p className="text-sm font-semibold uppercase tracking-wide text-indigo-700">Print poster</p>
              <h4 className="mt-2 text-lg font-bold text-slate-950">QR poster with store name</h4>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Open the print page to create a counter poster with your store name, QR code, and instructions.
              </p>
            </a>
            <a className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-decoration-none transition hover:bg-slate-100" href={quickPayUrl} target="_blank" rel="noreferrer">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Preview</p>
              <h4 className="mt-2 text-lg font-bold text-slate-950">Open customer page</h4>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Test the customer experience: search an item, select it, and start checkout.
              </p>
            </a>
          </div>

          {copyStatus ? <p className="mt-5 rounded-xl bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700">{copyStatus}</p> : null}
        </section>

        <aside className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-200">Live QR preview</p>
          <h3 className="mt-2 text-2xl font-bold">Scan to pay {profile.name}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Print this QR and place it at your counter, reception, flyer, or classroom notice board.
          </p>

          <div className="mt-5 rounded-3xl bg-white p-5">
            {isLoading ? (
              <div className="flex h-[280px] items-center justify-center text-sm text-slate-600">Preparing QR…</div>
            ) : (
              <img src={qrCodeUrl} alt="Quick Pay QR code" className="mx-auto h-[280px] w-[280px]" />
            )}
          </div>

          <a className="button button--primary mt-5 w-full justify-center" href={printUrl}>
            Open print page
          </a>

          <div className="mt-5 rounded-2xl border border-white/10 bg-white/10 p-4 text-sm leading-6 text-slate-200">
            <p className="font-semibold text-white">Recommended use</p>
            <p className="mt-1">
              Use one store QR for most businesses. Customers scan it, search what they want, select an item, and pay.
            </p>
          </div>
        </aside>
      </div>
    </PageSection>
  )
}
