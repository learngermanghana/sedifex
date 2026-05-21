import React, { useEffect, useMemo, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { Link, useSearchParams } from 'react-router-dom'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'

type StorePrintProfile = {
  name: string
  logoUrl: string
  phone: string
}

function clean(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function pickStoreName(record: Record<string, unknown>, fallback: string) {
  return (
    clean(record.businessName) ||
    clean(record.storeName) ||
    clean(record.name) ||
    clean(record.displayName) ||
    fallback
  )
}

function pickLogoUrl(record: Record<string, unknown>) {
  return clean(record.logoUrl) || clean(record.logo) || clean(record.photoUrl) || ''
}

function pickPhone(record: Record<string, unknown>) {
  return clean(record.phone) || clean(record.businessPhone) || clean(record.whatsapp) || clean(record.whatsappNumber) || ''
}

export default function QuickPayPrint() {
  const { storeId, isLoading } = useActiveStore()
  const [searchParams] = useSearchParams()
  const mode = searchParams.get('mode') || 'store'
  const [profile, setProfile] = useState<StorePrintProfile>({
    name: 'Your business',
    logoUrl: '',
    phone: '',
  })

  const quickPayUrl = useMemo(() => {
    const storeSegment = storeId ? encodeURIComponent(storeId) : 'your-store-id'
    return `https://pay.sedifex.com/s/${storeSegment}?mode=${encodeURIComponent(mode)}`
  }, [mode, storeId])

  const qrCodeUrl = useMemo(() => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=520x520&data=${encodeURIComponent(quickPayUrl)}`
  }, [quickPayUrl])

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
          logoUrl: pickLogoUrl(data),
          phone: pickPhone(data),
        })
      } catch (error) {
        console.warn('[quick-pay-print] Unable to load store profile', error)
      }
    }

    void loadStoreProfile()
    return () => {
      mounted = false
    }
  }, [storeId])

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-950 print:bg-white print:p-0">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          .no-print { display: none !important; }
          .poster-shell { min-height: 100vh; border-radius: 0 !important; box-shadow: none !important; }
        }
      `}</style>

      <div className="no-print mx-auto mb-4 flex max-w-4xl flex-wrap items-center justify-between gap-3">
        <Link className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700" to="/quick-pay">
          Back to Quick Pay
        </Link>
        <button
          type="button"
          className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          onClick={() => window.print()}
        >
          Print poster
        </button>
      </div>

      <section className="poster-shell mx-auto flex max-w-4xl flex-col items-center overflow-hidden rounded-[2rem] bg-white shadow-2xl print:max-w-none">
        <div className="w-full bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 px-8 py-10 text-center text-white print:px-12">
          <div className="mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl border border-white/20 bg-white/10">
            {profile.logoUrl ? (
              <img src={profile.logoUrl} alt={`${profile.name} logo`} className="h-full w-full object-cover" />
            ) : (
              <span className="text-4xl font-black">{profile.name.slice(0, 1).toUpperCase()}</span>
            )}
          </div>
          <p className="mt-6 text-sm font-semibold uppercase tracking-[0.35em] text-indigo-200">Sedifex Quick Pay</p>
          <h1 className="mt-4 text-5xl font-black tracking-tight print:text-6xl">Scan to Pay</h1>
          <p className="mt-4 text-2xl font-semibold text-white">{isLoading ? 'Preparing store…' : profile.name}</p>
        </div>

        <div className="grid w-full flex-1 gap-8 px-8 py-10 md:grid-cols-[1fr_0.8fr] print:grid-cols-[1fr_0.8fr] print:px-12 print:py-12">
          <div className="flex flex-col justify-center">
            <div className="rounded-[2rem] border-4 border-slate-950 bg-white p-5 shadow-xl">
              <img src={qrCodeUrl} alt="Quick Pay QR code" className="mx-auto h-[360px] w-[360px] print:h-[420px] print:w-[420px]" />
            </div>
            <p className="mt-5 break-all text-center text-sm font-medium text-slate-500">{quickPayUrl}</p>
          </div>

          <div className="flex flex-col justify-center gap-5">
            <div className="rounded-3xl bg-slate-950 p-6 text-white">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-200">How it works</p>
              <ol className="mt-5 space-y-4 text-lg font-semibold">
                <li>1. Open your camera</li>
                <li>2. Scan this QR code</li>
                <li>3. Search what you want</li>
                <li>4. Pay securely</li>
              </ol>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <h2 className="text-2xl font-black text-slate-950">Pay for products, services, or courses</h2>
              <p className="mt-3 text-base leading-7 text-slate-600">
                Your order and receipt will be recorded automatically for {profile.name}.
              </p>
              {profile.phone ? (
                <p className="mt-4 text-base font-semibold text-slate-950">Need help? Call or WhatsApp: {profile.phone}</p>
              ) : null}
            </div>
          </div>
        </div>

        <footer className="w-full border-t border-slate-200 bg-slate-50 px-8 py-5 text-center text-sm font-semibold text-slate-500 print:px-12">
          Powered by Sedifex • Quick Pay QR
        </footer>
      </section>
    </main>
  )
}
