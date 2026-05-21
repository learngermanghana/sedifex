import React, { useMemo, useState } from 'react'
import PageSection from '../layout/PageSection'
import { useActiveStore } from '../hooks/useActiveStore'

type QuickPayMode = 'store' | 'product' | 'service' | 'course' | 'custom'

const QUICK_PAY_MODES: Array<{
  id: QuickPayMode
  title: string
  description: string
}> = [
  {
    id: 'store',
    title: 'Store QR',
    description: 'Customer scans, searches what they want, selects an item, and pays.',
  },
  {
    id: 'product',
    title: 'Product QR',
    description: 'Use when you want to send customers straight to product checkout.',
  },
  {
    id: 'service',
    title: 'Service QR',
    description: 'Perfect for salons, spas, repairs, consultations, and appointments.',
  },
  {
    id: 'course',
    title: 'Course QR',
    description: 'Let students scan, choose a class or course, and pay quickly.',
  },
  {
    id: 'custom',
    title: 'Custom amount QR',
    description: 'Use when the item is not yet saved in Sedifex but you still want to record the payment.',
  },
]

const QUICK_PAY_STEPS = [
  'Customer scans the QR code or opens the payment link.',
  'Customer types what they want to buy or pay for.',
  'Sedifex searches products, services, and courses for the store.',
  'Customer selects the best match or enters a manual request.',
  'After payment, Sedifex records the sale, customer, receipt, and stock movement when needed.',
]

function copyToClipboard(value: string) {
  if (!navigator.clipboard) return Promise.reject(new Error('Clipboard unavailable'))
  return navigator.clipboard.writeText(value)
}

export default function QuickPay() {
  const { storeId, isLoading } = useActiveStore()
  const [selectedMode, setSelectedMode] = useState<QuickPayMode>('store')
  const [copyStatus, setCopyStatus] = useState<string | null>(null)

  const quickPayUrl = useMemo(() => {
    const storeSegment = storeId ? encodeURIComponent(storeId) : 'your-store-id'
    return `https://pay.sedifex.com/s/${storeSegment}?mode=${selectedMode}`
  }, [selectedMode, storeId])

  const qrCodeUrl = useMemo(() => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(quickPayUrl)}`
  }, [quickPayUrl])

  async function handleCopyLink() {
    try {
      await copyToClipboard(quickPayUrl)
      setCopyStatus('Quick Pay link copied.')
    } catch {
      setCopyStatus('Copy failed. Select and copy the link manually.')
    }
  }

  return (
    <PageSection
      title="Quick Pay"
      subtitle="Generate a QR payment link so customers can scan, search what they want, pay, and have the sale recorded in Sedifex."
      actions={
        <button type="button" className="button button--primary" onClick={handleCopyLink}>
          Copy payment link
        </button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">QR type</p>
            <h3 className="mt-2 text-xl font-semibold text-slate-950">Choose how customers should pay</h3>
            <p className="mt-2 text-sm text-slate-600">
              Start with a store QR for most businesses. It lets customers search products, services, or courses from one simple page.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {QUICK_PAY_MODES.map(mode => {
                const isSelected = selectedMode === mode.id
                return (
                  <button
                    key={mode.id}
                    type="button"
                    className={`rounded-xl border p-4 text-left transition ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50'
                    }`}
                    onClick={() => setSelectedMode(mode.id)}
                  >
                    <span className="block font-semibold text-slate-950">{mode.title}</span>
                    <span className="mt-1 block text-sm text-slate-600">{mode.description}</span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Customer flow</p>
            <h3 className="mt-2 text-xl font-semibold text-slate-950">Scan, search, pay, record</h3>
            <ol className="mt-4 space-y-3">
              {QUICK_PAY_STEPS.map((step, index) => (
                <li key={step} className="flex gap-3 text-sm text-slate-700">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-semibold text-white">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <h3 className="text-lg font-semibold text-amber-950">Manual payment mode</h3>
            <p className="mt-2 text-sm text-amber-900">
              If the customer cannot find the item, they can type the request and pay a custom amount. Sedifex can save it as a manual quick sale for the business to review later.
            </p>
          </section>
        </div>

        <aside className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-200">Live QR preview</p>
          <h3 className="mt-2 text-2xl font-semibold">{QUICK_PAY_MODES.find(mode => mode.id === selectedMode)?.title}</h3>
          <p className="mt-2 text-sm text-slate-300">
            Print this QR, add it to flyers, place it at the counter, or share the link on WhatsApp and Instagram.
          </p>

          <div className="mt-5 rounded-2xl bg-white p-4">
            {isLoading ? (
              <div className="flex h-[260px] items-center justify-center text-sm text-slate-600">Preparing QR…</div>
            ) : (
              <img src={qrCodeUrl} alt="Quick Pay QR code" className="mx-auto h-[260px] w-[260px]" />
            )}
          </div>

          <label className="mt-5 block text-sm font-medium text-slate-200" htmlFor="quick-pay-link">
            Payment link
          </label>
          <input
            id="quick-pay-link"
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-3 py-3 text-sm text-white outline-none focus:border-indigo-300"
            readOnly
            value={quickPayUrl}
            onFocus={event => event.currentTarget.select()}
          />

          {copyStatus ? <p className="mt-3 text-sm text-indigo-100">{copyStatus}</p> : null}

          <div className="mt-5 rounded-xl border border-white/10 bg-white/10 p-4 text-sm text-slate-200">
            <p className="font-semibold text-white">Next backend connection</p>
            <p className="mt-1">
              Connect this link to the public Quick Pay checkout, search store items, run payment preview, then commit the sale after payment confirmation.
            </p>
          </div>
        </aside>
      </div>
    </PageSection>
  )
}
