import SafeFirebaseImage from '../components/SafeFirebaseImage'
import React, { useEffect, useMemo, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { Link, useSearchParams } from 'react-router-dom'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'

type StorePrintProfile = {
  name: string
  websiteUrl: string
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

function pickWebsiteUrl(record: Record<string, unknown>) {
  return (
    clean(record.websiteUrl) ||
    clean(record.website) ||
    clean(record.businessWebsite) ||
    clean(record.publicWebsite) ||
    clean(record.siteUrl) ||
    clean(record.domain) ||
    ''
  )
}

function formatWebsiteUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  const label = trimmed.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '')
  return { href, label }
}

export default function QuickPayPrint() {
  const { storeId, isLoading } = useActiveStore()
  const [searchParams] = useSearchParams()
  const mode = searchParams.get('mode') || 'store'
  const [profile, setProfile] = useState<StorePrintProfile>({
    name: 'Your business',
    websiteUrl: '',
  })

  const quickPayUrl = useMemo(() => {
    const storeSegment = storeId ? encodeURIComponent(storeId) : 'your-store-id'
    return `https://pay.sedifex.com/s/${storeSegment}?mode=${encodeURIComponent(mode)}`
  }, [mode, storeId])

  const qrCodeUrl = useMemo(() => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=560x560&margin=0&data=${encodeURIComponent(quickPayUrl)}`
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
          websiteUrl: pickWebsiteUrl(data),
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
  const formattedWebsite = useMemo(() => formatWebsiteUrl(profile.websiteUrl), [profile.websiteUrl])

  return (
    <main className="quick-pay-print-main">
      <style>{`
        .quick-pay-print-main,
        .quick-pay-print-main * {
          box-sizing: border-box;
        }

        .quick-pay-print-main {
          width: 100%;
          min-height: 100dvh;
          margin: 0;
          overflow-x: hidden;
          background: #eef2f7;
          color: #0f172a;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 16px;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .quick-pay-print-toolbar {
          width: min(100%, 560px);
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin: 0 auto 14px;
        }

        .quick-pay-print-back,
        .quick-pay-print-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 42px;
          border-radius: 14px;
          padding: 0 16px;
          font-size: 14px;
          font-weight: 900;
          text-decoration: none;
          cursor: pointer;
        }

        .quick-pay-print-back {
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #334155;
        }

        .quick-pay-print-button {
          border: 0;
          background: #4f46e5;
          color: #ffffff;
          box-shadow: 0 12px 24px rgba(79, 70, 229, 0.22);
        }

        .quick-pay-poster {
          width: min(100%, 560px);
          min-height: 720px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          margin: 0 auto;
          padding: 34px 32px 26px;
          border: 1px solid #e2e8f0;
          border-radius: 32px;
          background: #ffffff;
          text-align: center;
          box-shadow: 0 28px 70px rgba(15, 23, 42, 0.14);
        }

        .quick-pay-poster-title {
          width: 100%;
        }

        .quick-pay-poster-title h1 {
          margin: 0;
          overflow-wrap: anywhere;
          color: #0f172a;
          font-size: clamp(30px, 8vw, 42px);
          line-height: 1.05;
          font-weight: 950;
          letter-spacing: -0.04em;
        }

        .quick-pay-poster-title p {
          margin: 10px 0 0;
          color: #4f46e5;
          font-size: clamp(20px, 5vw, 26px);
          line-height: 1.2;
          font-weight: 950;
        }

        .quick-pay-qr-wrap {
          width: 100%;
          display: flex;
          justify-content: center;
        }

        .quick-pay-qr-frame {
          width: min(100%, 310px);
          aspect-ratio: 1 / 1;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 8px solid #0f172a;
          border-radius: 22px;
          background: #ffffff;
          padding: 10px;
        }

        .quick-pay-qr-frame img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .quick-pay-steps {
          width: 100%;
          max-width: 440px;
          border-radius: 24px;
          background: #0f172a;
          color: #ffffff;
          padding: 20px 24px;
          text-align: left;
        }

        .quick-pay-steps h2 {
          margin: 0;
          color: #ffffff;
          text-align: center;
          font-size: 22px;
          line-height: 1.2;
          font-weight: 950;
        }

        .quick-pay-steps ol {
          margin: 14px 0 0;
          padding-left: 24px;
          display: grid;
          gap: 8px;
          color: #ffffff;
          font-size: 16px;
          line-height: 1.35;
          font-weight: 750;
        }

        .quick-pay-poster-footer {
          display: grid;
          gap: 4px;
          width: 100%;
        }

        .quick-pay-store-site,
        .quick-pay-powered {
          width: 100%;
          margin: 0;
          color: #475569;
          line-height: 1.35;
          font-weight: 850;
          text-align: center;
        }

        .quick-pay-store-site {
          font-size: 13px;
        }

        .quick-pay-powered {
          font-size: 12px;
        }

        .quick-pay-store-site span,
        .quick-pay-powered span {
          color: #0f172a;
          font-weight: 950;
        }

        .quick-pay-store-site a,
        .quick-pay-powered a {
          color: #4f46e5;
          font-weight: 950;
          text-decoration: none;
          overflow-wrap: anywhere;
        }

        @media (max-width: 520px) {
          .quick-pay-print-main {
            padding: 12px;
          }

          .quick-pay-poster {
            min-height: auto;
            padding: 24px 18px 20px;
            border-radius: 24px;
            gap: 16px;
          }

          .quick-pay-qr-frame {
            width: min(100%, 280px);
            border-width: 6px;
            border-radius: 18px;
            padding: 8px;
          }

          .quick-pay-steps {
            padding: 17px;
            border-radius: 20px;
          }

          .quick-pay-steps ol {
            font-size: 15px;
          }

          .quick-pay-store-site,
          .quick-pay-powered {
            font-size: 11px;
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
            background: #ffffff !important;
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
            background: #ffffff !important;
            overflow: hidden !important;
            display: block !important;
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
            padding: 11mm 11mm 7mm !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            gap: 4.5mm !important;
          }

          .quick-pay-poster-title h1 {
            font-size: 28px !important;
            line-height: 1.08 !important;
          }

          .quick-pay-poster-title p {
            margin-top: 5px !important;
            font-size: 19px !important;
          }

          .quick-pay-qr-frame {
            width: 80mm !important;
            height: 80mm !important;
            border-width: 5px !important;
            border-radius: 0 !important;
            padding: 3mm !important;
          }

          .quick-pay-steps {
            max-width: 118mm !important;
            border-radius: 12px !important;
            padding: 5mm 7mm !important;
          }

          .quick-pay-steps h2 {
            font-size: 18px !important;
          }

          .quick-pay-steps ol {
            margin-top: 3.5mm !important;
            gap: 2mm !important;
            font-size: 14px !important;
          }

          .quick-pay-poster-footer {
            gap: 1.5mm !important;
          }

          .quick-pay-store-site,
          .quick-pay-powered {
            font-size: 10.5px !important;
            line-height: 1.2 !important;
          }
        }
      `}</style>

      <div className="quick-pay-print-toolbar no-print">
        <Link className="quick-pay-print-back" to="/quick-pay">
          Back to Quick Pay
        </Link>
        <button type="button" className="quick-pay-print-button" onClick={() => window.print()}>
          Print poster
        </button>
      </div>

      <section className="quick-pay-poster">
        <div className="quick-pay-poster-title">
          <h1>{displayName}</h1>
          <p>Scan to Pay</p>
        </div>

        <div className="quick-pay-qr-wrap">
          <div className="quick-pay-qr-frame">
            <SafeFirebaseImage src={qrCodeUrl} alt={`${displayName} Quick Pay QR code`} />
          </div>
        </div>

        <div className="quick-pay-steps">
          <h2>How to pay</h2>
          <ol>
            <li>Open your phone camera</li>
            <li>Scan the QR code</li>
            <li>Select product, service, or course</li>
            <li>Pay securely</li>
          </ol>
        </div>

        <footer className="quick-pay-poster-footer">
          {formattedWebsite ? (
            <p className="quick-pay-store-site">
              <span>Store website:</span> <a href={formattedWebsite.href}>{formattedWebsite.label}</a>
            </p>
          ) : null}
          <p className="quick-pay-powered">
            Powered by <span>Sedifex</span> • <a href="https://www.sedifex.com">www.sedifex.com</a>
          </p>
        </footer>
      </section>
    </main>
  )
}
