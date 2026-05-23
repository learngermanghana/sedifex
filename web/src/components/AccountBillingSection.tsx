import React, { useMemo, useState } from 'react'
import { startPaystackCheckout } from '../lib/paystackClient'
import { usePwaContext } from '../context/PwaContext'

type Props = {
  storeId: string | null
  ownerEmail: string | null
  isOwner: boolean
  contractStatus?: string | null
  billingPlan?: string | null
  paymentProvider?: string | null
  contractEndDate?: string | null
}

type BillingPlanId = 'starter' | 'business' | 'growth_website'

type PlanOption = {
  id: BillingPlanId
  label: string
  yearlyAmountGhs: number | null
  monthlyDisplay: string
  staffUsers: string
  productLimit: string
  workspaceRule: string
  badge: string
  description: string
  includes: string[]
  limits: string[]
  highlighted?: boolean
}

const YEARLY_CONTRACT_MONTHS = 12

const PLANS: PlanOption[] = [
  {
    id: 'starter',
    label: 'Starter',
    yearlyAmountGhs: null,
    monthlyDisplay: 'Free',
    staffUsers: '1 staff/user',
    productLimit: '50 products/services',
    workspaceRule: '1 free workspace',
    badge: 'Current free entry plan',
    description: 'For very small businesses testing Sedifex before upgrading.',
    includes: ['Public Sedifex page', 'QR code / public link', 'Limited reports', 'Sedifex branding'],
    limits: ['Up to 50 products/services', 'Up to 30 receipts/invoices per month', 'No custom domain', 'No API keys'],
  },
  {
    id: 'business',
    label: 'Business',
    yearlyAmountGhs: 999,
    monthlyDisplay: 'GHS 99/month equivalent',
    staffUsers: '2 staff/users',
    productLimit: 'Unlimited products/services under fair use',
    workspaceRule: 'Extra workspace: GHS 49/month',
    badge: 'Most popular',
    description: 'For daily sales, inventory, receipts, bookings, Quick Pay, and Sedifex Market sync.',
    includes: [
      'Inventory / items',
      'POS selling',
      'Customers and bookings',
      'Basic reports',
      'Basic website builder',
      'Sedifex Market sales sync',
      'Branded text messaging with purchased credits',
    ],
    limits: ['No custom domain', 'No Products API or Bookings API', 'Very large imports may need review'],
    highlighted: true,
  },
  {
    id: 'growth_website',
    label: 'Growth Website',
    yearlyAmountGhs: 1999,
    monthlyDisplay: 'GHS 199/month equivalent',
    staffUsers: '5 staff/users',
    productLimit: 'Unlimited products/services under fair use',
    workspaceRule: 'Extra workspace: GHS 99/month',
    badge: 'Best for online growth',
    description: 'For businesses that want a real website connected to Sedifex and Sedifex Market.',
    includes: [
      'Full website builder',
      'Website template library',
      'Custom domain setup',
      'SEO settings',
      'Products API and Bookings API',
      'Website + marketplace sales reports',
      'Branded text messaging with purchased credits',
    ],
    limits: ['Advanced custom integrations may require setup fee', 'Very high API usage may need review'],
  },
]

const CHECKOUT_PLANS = PLANS.filter(plan => plan.yearlyAmountGhs !== null)

function normalizePlanId(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_')
}

function formatPlanName(value: string | null | undefined): string {
  const normalized = normalizePlanId(value)
  if (!normalized) return 'Starter'
  if (normalized === 'business') return 'Business'
  if (normalized === 'growth_website' || normalized === 'growth_website_plan') return 'Growth Website'
  if (normalized === 'starter' || normalized === 'free' || normalized === 'trial') return normalized === 'trial' ? 'Trial' : 'Starter'
  if (normalized === 'growth') return 'Legacy Growth'
  if (normalized === 'scale') return 'Legacy Scale'
  if (normalized === 'scale_plus') return 'Legacy Scale Plus'
  return value || 'Starter'
}

function formatStatus(value: string | null | undefined): string {
  const normalized = normalizePlanId(value)
  if (!normalized) return 'Not set'
  if (normalized === 'active') return 'Active'
  if (normalized === 'pending') return 'Pending payment'
  if (normalized === 'failed') return 'Payment failed'
  if (normalized === 'trial') return 'Trial'
  return value || 'Not set'
}

function formatGhs(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'Free'
  return `GHS ${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

function getNextYearDisplay(): string {
  const nextDate = new Date()
  nextDate.setMonth(nextDate.getMonth() + YEARLY_CONTRACT_MONTHS)
  return nextDate.toLocaleDateString(undefined, { dateStyle: 'medium' })
}

export const AccountBillingSection: React.FC<Props> = ({
  storeId,
  ownerEmail,
  isOwner,
  contractStatus,
  billingPlan,
  paymentProvider,
  contractEndDate,
}) => {
  const { isPwaApp } = usePwaContext()
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const currentPlanName = useMemo(() => formatPlanName(billingPlan), [billingPlan])
  const currentStatus = useMemo(() => formatStatus(contractStatus), [contractStatus])
  const normalizedContractStatus = normalizePlanId(contractStatus)
  const hasPaidContract = normalizedContractStatus === 'active'
  const isPendingContract = normalizedContractStatus === 'pending'
  const isFailedContract = normalizedContractStatus === 'failed'
  const nextContractEndDisplay = getNextYearDisplay()

  const startCheckoutForPlan = async (plan: PlanOption) => {
    setError(null)

    if (!isOwner) {
      setError('Only the workspace owner can start billing checkout.')
      return
    }

    if (!storeId) {
      setError('Missing store ID. Please refresh and try again.')
      return
    }

    if (!ownerEmail) {
      setError('Missing owner email. Please log in again.')
      return
    }

    if (plan.yearlyAmountGhs === null || plan.yearlyAmountGhs <= 0) {
      setError('This plan does not require Paystack checkout.')
      return
    }

    try {
      setLoadingPlanId(plan.id)

      const redirectUrl = `${window.location.origin}/billing/verify?storeId=${encodeURIComponent(storeId)}`

      const response = await startPaystackCheckout({
        email: ownerEmail,
        storeId,
        amount: plan.yearlyAmountGhs,
        plan: plan.id,
        contractMonths: YEARLY_CONTRACT_MONTHS,
        redirectUrl,
        metadata: {
          source: 'account-yearly-billing',
          billingCadence: 'yearly',
          contractMonths: YEARLY_CONTRACT_MONTHS,
          yearlyAmountGhs: plan.yearlyAmountGhs,
        },
      })

      if (!response.ok || !response.authorizationUrl) {
        setError('Unable to start checkout. Please try again.')
        return
      }

      window.location.assign(response.authorizationUrl)
    } catch (err) {
      console.error('Checkout error', err)
      const message = err instanceof Error ? err.message : 'Something went wrong starting checkout.'
      setError(message)
    } finally {
      setLoadingPlanId(null)
    }
  }

  const summary = (
    <div className="account-overview__data-grid" style={{ marginBottom: 20 }}>
      <article className="account-overview__card">
        <p className="account-overview__eyebrow">Current plan</p>
        <h3>{currentPlanName}</h3>
        <p className="account-overview__hint">Status: <strong>{currentStatus}</strong></p>
        <p className="account-overview__hint">Provider: <strong>{paymentProvider ?? 'Paystack'}</strong></p>
      </article>
      <article className="account-overview__card">
        <p className="account-overview__eyebrow">Billing cadence</p>
        <h3>Yearly contract</h3>
        <p className="account-overview__hint">Paid once upfront through Paystack for 12 months.</p>
        <p className="account-overview__hint">No automatic monthly recurring card charge.</p>
      </article>
      <article className="account-overview__card">
        <p className="account-overview__eyebrow">Renewal</p>
        <h3>{contractEndDate ?? '—'}</h3>
        <p className="account-overview__hint">This is the current contract end date when available.</p>
      </article>
    </div>
  )

  if (isPwaApp) {
    return (
      <section id="account-overview-contract">
        <div className="account-overview__section-header">
          <h2>Contract &amp; billing</h2>
          <p className="account-overview__subtitle">Billing is managed in the browser version of Sedifex.</p>
        </div>
        {summary}
        <div className="account-overview__notice" role="note">
          <p className="text-sm text-gray-700">
            To start, renew, or change your Sedifex yearly subscription, open <strong>sedifex.com</strong> in your browser and log in there.
          </p>
        </div>
      </section>
    )
  }

  if (!isOwner) {
    return (
      <section id="account-overview-contract">
        <div className="account-overview__section-header">
          <h2>Contract &amp; billing</h2>
          <p className="account-overview__subtitle">Only the workspace owner can manage billing.</p>
        </div>
        {summary}
      </section>
    )
  }

  return (
    <section id="account-overview-contract">
      <div className="account-overview__section-header">
        <h2>Contract &amp; billing</h2>
        <p className="account-overview__subtitle">
          Choose a yearly plan. Paystack checkout charges one yearly payment, not a monthly recurring charge.
        </p>
      </div>

      {summary}

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-4" role="alert">
          {error}
        </div>
      )}

      {hasPaidContract ? (
        <div className="account-overview__notice" role="status">
          <p className="text-sm text-gray-700">
            Your contract is active{currentPlanName ? ` on ${currentPlanName}` : ''}. It remains valid until <strong>{contractEndDate ?? '—'}</strong>.
          </p>
          <p className="text-sm text-gray-600">
            Renewing or changing plan starts a new yearly Paystack checkout. Any remaining manual credit can be handled by your Sedifex account manager.
          </p>
        </div>
      ) : null}

      {(isPendingContract || isFailedContract) && (
        <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 mb-4" role="status">
          {isPendingContract
            ? 'Your last payment was not completed yet. If you already paid, refresh in a few minutes. Otherwise, start a new yearly checkout below.'
            : 'Your last payment attempt did not go through. Please start a new yearly checkout below.'}
        </div>
      )}

      <div className="account-overview__section-header" style={{ marginTop: 22 }}>
        <h3>Available yearly plans</h3>
        <p className="account-overview__hint">
          Monthly prices are shown only as an equivalent on the public pricing page. Checkout below is yearly upfront.
        </p>
      </div>

      <div className="account-overview__data-grid">
        {PLANS.map(plan => {
          const isCheckoutPlan = plan.yearlyAmountGhs !== null
          const isLoading = loadingPlanId === plan.id
          return (
            <article
              key={plan.id}
              className="account-overview__card"
              style={plan.highlighted ? { borderColor: '#4f46e5', boxShadow: '0 24px 50px -38px rgba(79, 70, 229, 0.65)' } : undefined}
            >
              <p className="account-overview__eyebrow">{plan.badge}</p>
              <h3>{plan.label}</h3>
              <p className="account-overview__hint">{plan.description}</p>
              <p style={{ fontSize: 28, fontWeight: 900, margin: '14px 0 0' }}>
                {formatGhs(plan.yearlyAmountGhs)}
              </p>
              <p className="account-overview__hint">
                {plan.yearlyAmountGhs === null ? 'No payment needed' : `per year · ${plan.monthlyDisplay}`}
              </p>
              <div className="account-overview__grid" style={{ marginTop: 14 }}>
                <div><dt>Staff</dt><dd>{plan.staffUsers}</dd></div>
                <div><dt>Products</dt><dd>{plan.productLimit}</dd></div>
                <div><dt>Workspace</dt><dd>{plan.workspaceRule}</dd></div>
              </div>
              <div style={{ marginTop: 14 }}>
                <p className="account-overview__hint"><strong>Includes</strong></p>
                <ul className="account-overview__hint" style={{ paddingLeft: 18 }}>
                  {plan.includes.map(item => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div style={{ marginTop: 10 }}>
                <p className="account-overview__hint"><strong>Limits</strong></p>
                <ul className="account-overview__hint" style={{ paddingLeft: 18 }}>
                  {plan.limits.map(item => <li key={item}>{item}</li>)}
                </ul>
              </div>
              {isCheckoutPlan ? (
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => void startCheckoutForPlan(plan)}
                  disabled={Boolean(loadingPlanId)}
                  style={{ marginTop: 16 }}
                >
                  {isLoading ? 'Starting checkout…' : `Pay ${formatGhs(plan.yearlyAmountGhs)} yearly`}
                </button>
              ) : (
                <p className="account-overview__hint" style={{ marginTop: 16 }}>
                  Free plan. Upgrade when you need marketplace sync, a full website, or growth tools.
                </p>
              )}
            </article>
          )
        })}
      </div>

      <div className="account-overview__notice" role="note" style={{ marginTop: 20 }}>
        <p className="text-sm text-gray-700">
          If paid now, your new contract end date will be around <strong>{nextContractEndDisplay}</strong>. Branded text messaging is available when message credits are purchased separately.
        </p>
      </div>
    </section>
  )
}
