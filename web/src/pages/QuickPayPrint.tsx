import React, { useEffect, useMemo, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { Link, useSearchParams } from 'react-router-dom'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'

type StorePrintProfile = {
  name: string
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

export default function QuickPayPrint() {
  const { storeId, isLoading } = useActiveStore()
  const [searchParams] = useSearchParams()
  const mode = searchParams.get('mode') || 'store'
  const [profile, setProfile] = useState<StorePrintProfile>({
    name: 'Your business',
  })

  const quickPayUrl = useMemo(() => {
    const storeSegment = storeId ? encodeURIComponent(storeId) : 'your-store-id'
    return `https://pay.sedifex.com/s/${storeSegment}?mode=${encodeURIComponent(mode)}`
  }, [mode, storeId])

  const qrCodeUrl = useMemo(() => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=760x760&data=${encodeURIComponent(quickPayUrl)}`
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

  const displayName = isLoading ? 'Preparing store…' : profile.name

  return (
    <main className="quick-pay-print-main min-h-screen bg-slate-100 px-4 py-6 text-slate-950 print:bg-white print:p-0">
      <style>{`
        .quick-pay-poster {
          width: min(100%, 148mm);
          min-height: 210mm;
        }

        @media print {
          @page {
            size: A5 portrait;
            margin: 0;
          }

          html,
          body,
          #root {
            width: 148mm !important;
            height: 210mm !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            background: white !important;
          }

          body * {
            visibility: hidden !important;
          }

          .quick-pay-print-main,
          .quick-pay-print-main * {
            visibility: visible !important;
          }

          .quick-pay-print-main {
            position: fixed !important;
            inset: 0 !important;
            width: 148mm !important;
            height: 210mm !important;
            min-height: 210mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            display: flex !important;
            align-items: stretch !important;
            justify-content: center !important;
          }

          .quick-pay-print-toolbar,
          .no-print {
            display: none !important;
          }

          .quick-pay-poster {
            width: 148mm !important;
            height: 210mm !important;
            min-height: 210mm !important;
            margin: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }
        }
      `}</style>

      <div className="quick-pay-print-toolbar no-print mx-auto mb-4 flex max-w-3xl flex-wrap items-center justify-between gap-3">
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

      <section className="quick-pay-poster mx-auto flex flex-col items-center justify-between rounded-[2rem] bg-white px-8 py-10 text-center shadow-2xl sm:px-12 print:px-[13mm] print:py-[14mm]">
        <div className="w-full">
          <h1 className="break-words text-4xl font-black tracking-tight text-slate-950 print:text-[30px] print:leading-tight">
            {displayName}
          </h1>
          <p className="mt-3 text-2xl font-extrabold text-indigo-700 print:text-[22px]">Scan to Pay</p>
        </div>

        <div className="my-8 w-full print:my-[10mm]">
          <div className="mx-auto flex aspect-square w-full max-w-[118mm] items-center justify-center rounded-[1.5rem] border-[10px] border-slate-950 bg-white p-3 print:max-w-[112mm] print:rounded-none print:border-[6px] print:p-[3mm]">
            <img src={qrCodeUrl} alt={`${displayName} Quick Pay QR code`} className="h-full w-full object-contain" />
          </div>
        </div>

        <div className="w-full max-w-[116mm] rounded-[1.5rem] bg-slate-950 px-7 py-6 text-left text-white print:max-w-[112mm] print:rounded-xl print:px-[8mm] print:py-[7mm]">
          <h2 className="text-center text-2xl font-black print:text-[20px]">How to pay</h2>
          <ol className="mt-5 list-decimal space-y-3 pl-6 text-xl font-semibold leading-snug print:mt-[5mm] print:space-y-[3mm] print:text-[16px]">
            <li>Open your phone camera</li>
            <li>Scan the QR code</li>
            <li>Select product, service, or course</li>
            <li>Pay securely</li>
          </ol>
        </div>
      </section>
    </main>
  )
}
