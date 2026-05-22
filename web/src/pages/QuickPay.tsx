import React, { useEffect, useMemo, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import PageSection from '../layout/PageSection'
import { useActiveStore } from '../hooks/useActiveStore'
import { db } from '../firebase'

type StoreProfile = {
  name: string
  logoUrl: string
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

export default function QuickPay() {
  const { storeId, isLoading } = useActiveStore()
  const [copyStatus, setCopyStatus] = useState<string | null>(null)
  const [profile, setProfile] = useState<StoreProfile>({ name: 'Your store', logoUrl: '' })

  const quickPayUrl = useMemo(() => {
    const storeSegment = storeId ? encodeURIComponent(storeId) : 'your-store-id'
    return `https://pay.sedifex.com/s/${storeSegment}?mode=store`
  }, [storeId])

  const printUrl = '/quick-pay/print'

  const qrCodeUrl = useMemo(() => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(quickPayUrl)}`
  }, [quickPayUrl])

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

  return (
    <PageSection
      title="Quick Pay"
      subtitle="Use one simple payment link and one clean QR poster for customer payments."
    >
      <div className="space-y-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
          <section className="overflow-hidden rounded-3xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-slate-50 p-4 shadow-sm sm:p-6 lg:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 text-xl font-black text-white sm:h-16 sm:w-16 sm:text-2xl">
                {profile.logoUrl ? <img src={profile.logoUrl} alt="" className="h-full w-full object-cover" /> : profile.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-700 sm:text-sm">Main customer payment link</p>
                <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{displayName}</h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                  Send this link to customers. They open it, search what they want, select the item, and pay securely.
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-indigo-100 bg-white p-3 shadow-sm sm:p-4">
              <label className="block text-sm font-bold text-slate-800" htmlFor="quick-pay-link">
                Payment link
              </label>
              <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                <input
                  id="quick-pay-link"
                  className="min-h-12 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-950 outline-none focus:border-indigo-500 sm:text-base"
                  readOnly
                  value={quickPayUrl}
                  onFocus={event => event.currentTarget.select()}
                />
                <button type="button" className="button button--primary min-h-12 justify-center whitespace-nowrap" onClick={handleCopyLink}>
                  Copy payment link
                </button>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500 sm:text-sm">
                This is the most important link. Add it to WhatsApp, Instagram, flyers, SMS, or your website.
              </p>
            </div>
          </section>

          <aside className="rounded-3xl border border-slate-200 bg-slate-950 p-4 text-white shadow-sm sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-200 sm:text-sm">Print page link</p>
            <h3 className="mt-2 text-2xl font-black tracking-tight">Counter QR poster</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Open the half-page poster with only the store name, QR code, and payment steps.
            </p>

            <div className="mt-5 rounded-2xl bg-white p-3">
              {isLoading ? (
                <div className="flex h-48 items-center justify-center text-sm text-slate-600">Preparing QR…</div>
              ) : (
                <img src={qrCodeUrl} alt="Quick Pay QR code" className="mx-auto h-48 w-48" />
              )}
            </div>

            <a className="button button--primary mt-5 w-full justify-center" href={printUrl}>
              Open print page
            </a>
            <p className="mt-3 break-all rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-indigo-100">
              {printUrl}
            </p>
          </aside>
        </div>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 lg:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 sm:text-sm">Message to customer</p>
              <h3 className="mt-2 text-2xl font-black text-slate-950">Ready-to-send payment message</h3>
            </div>
            <button type="button" className="button button--ghost justify-center whitespace-nowrap" onClick={handleCopyMessage}>
              Copy message
            </button>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
            <p className="text-base font-semibold leading-7 text-slate-950">
              Hello, you can pay <span className="font-black">{profile.name}</span> securely with Sedifex Quick Pay.
            </p>

            <div className="mt-4 rounded-2xl border border-indigo-100 bg-white p-3 sm:p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-700">Payment link</p>
              <p className="mt-2 break-all text-sm font-semibold leading-6 text-slate-950 sm:text-base">{quickPayUrl}</p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl bg-white p-4 text-sm font-semibold text-slate-700">1. Open the link</div>
              <div className="rounded-2xl bg-white p-4 text-sm font-semibold text-slate-700">2. Search what you want</div>
              <div className="rounded-2xl bg-white p-4 text-sm font-semibold text-slate-700">3. Select product, service, or course</div>
              <div className="rounded-2xl bg-white p-4 text-sm font-semibold text-slate-700">4. Pay securely</div>
            </div>
          </div>
        </section>

        {copyStatus ? <p className="rounded-xl bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700">{copyStatus}</p> : null}
      </div>
    </PageSection>
  )
}
