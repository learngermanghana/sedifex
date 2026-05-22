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
    <main className="quick-pay-print-main min-h-screen bg-slate-100 px-3 py-4 text-slate-950 sm:px-6 sm:py-8 print:bg-white print:p-0">
      <style>{`
        .quick-pay-print-main {
          box-sizing: border-box;
          width: 100%;
          overflow-x: hidden;
        }

        .quick-pay-poster {
          box-sizing: border-box;
          width: 100%;
          max-width: 520px;
          min-height: auto;
        }

        .quick-pay-qr-frame {
          box-sizing: border-box;
          width: min(100%, 340px);
          max-width: 100%;
          aspect-ratio: 1 / 1;
        }

        .quick-pay-steps {
          width: 100%;
          max-width: 420px;
        }

        @media (min-width: 640px) {
          .quick-pay-poster {
            max-width: 560px;
            min-height: 760px;
          }

          .quick-pay-qr-frame {
            width: min(100%, 420px);
          }

          .quick-pay-steps {
            max-width: 440px;
          }
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
            overflow: hidden !important;
          }

          .quick-pay-print-toolbar,
          .no-print {
            display: none !important;
          }

          .quick-pay-poster {
            width: 148mm !important;
            max-width: 148mm !important;
            height: 210mm !important;
            min-height: 210mm !important;
            margin: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            padding: 14mm 13mm !important;
          }

          .quick-pay-qr-frame {
            width: 112mm !important;
            height: 112mm !important;
            max-width: 112mm !important;
            border-width: 6px !important;
            border-radius: 0 !important;
            padding: 3mm !important;
          }

          .quick-pay-steps {
            max-width: 112mm !important;
            border-radius: 12px !important;
            padding: 7mm 8mm !important;
          }
        }
      `}</style>

      <div className="quick-pay-print-toolbar no-print mx-auto mb-4 flex w-full max-w-[520px] flex-wrap items-center justify-between gap-3">
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

      <section className="quick-pay-poster mx-auto flex flex-col items-center justify-between rounded-[1.5rem] bg-white px-5 py-7 text-center shadow-xl sm:rounded-[2rem] sm:px-10 sm:py-10">
        <div className="w-full">
          <h1 className="break-words text-3xl font-black tracking-tight text-slate-950 sm:text-4xl print:text-[30px] print:leading-tight">
            {displayName}
          </h1>
          <p className="mt-2 text-xl font-extrabold text-indigo-700 sm:mt-3 sm:text-2xl print:text-[22px]">Scan to Pay</p>
        </div>

        <div className="my-6 flex w-full justify-center sm:my-8 print:my-[10mm]">
          <div className="quick-pay-qr-frame flex items-center justify-center rounded-[1.25rem] border-[6px] border-slate-950 bg-white p-2 sm:rounded-[1.5rem] sm:border-[10px] sm:p-3">
            <img src={qrCodeUrl} alt={`${displayName} Quick Pay QR code`} className="h-full w-full object-contain" />
          </div>
        </div>

        <div className="quick-pay-steps rounded-[1.25rem] bg-slate-950 px-5 py-5 text-left text-white sm:rounded-[1.5rem] sm:px-7 sm:py-6">
          <h2 className="text-center text-xl font-black sm:text-2xl print:text-[20px]">How to pay</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-base font-semibold leading-snug sm:mt-5 sm:space-y-3 sm:pl-6 sm:text-xl print:mt-[5mm] print:space-y-[3mm] print:text-[16px]">
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
