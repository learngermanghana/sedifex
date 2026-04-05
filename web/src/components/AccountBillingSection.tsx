import React, { useState } from 'react'
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

type PlanOption = {
  id: string
  label: string
  amountGhs: number
  productLimit: number
  dailySalesLimit: number
}

const PLANS: PlanOption[] = [
  { id: 'starter', label: 'Starter', amountGhs: 20, productLimit: 100, dailySalesLimit: 100 },
  { id: 'growth', label: 'Growth', amountGhs: 50, productLimit: 500, dailySalesLimit: 500 },
  { id: 'scale', label: 'Scale', amountGhs: 100, productLimit: 2000, dailySalesLimit: 2000 },
]

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
  const defaultPlanId = PLANS[0]?.id ?? ''
  const [selectedPlanId, setSelectedPlanId] = useState<string>(defaultPlanId)
  const [durationMonths, setDurationMonths] = useState<number>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedPlan = PLANS.find(plan => plan.id === selectedPlanId) ?? null
  const totalAmount = (selectedPlan?.amountGhs ?? 0) * durationMonths
  const selectedCadenceLabel = `Prepaid ${durationMonths} month${durationMonths === 1 ? '' : 's'}`
  const selectedCadenceDescription = 'No auto-renewal. Renew manually before expiry.'
  const nextChargeDate = (() => {
    const base = new Date()
    const nextDate = new Date(base)
    nextDate.setMonth(base.getMonth() + durationMonths)
    return nextDate
  })()
  const nextChargeDisplay = nextChargeDate.toLocaleDateString(undefined, {
    dateStyle: 'medium',
  })

  const billingPlanDisplay =
    PLANS.find(plan => plan.id === billingPlan)?.label ?? billingPlan ?? null

  const normalizedContractStatus = contractStatus?.toLowerCase() ?? null
  const hasPaidContract = normalizedContractStatus === 'active'
  const isPendingContract = normalizedContractStatus === 'pending'
  const isFailedContract = normalizedContractStatus === 'failed'

  const startCheckoutForPlan = async (planId: string) => {
    setError(null)

    if (!isOwner) {
      setError('Only the owner can start a contract payment.')
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

    const targetPlan = PLANS.find(plan => plan.id === planId)

    if (!targetPlan) {
      setError('No billing plans are available right now. Please try again later.')
      return
    }

    try {
      setLoading(true)

      const redirectUrl = `${window.location.origin}/billing/verify?storeId=${encodeURIComponent(storeId)}`

      const response = await startPaystackCheckout({
        email: ownerEmail,
        storeId,
        amount: targetPlan.amountGhs * durationMonths,
        plan: targetPlan.id,
        durationMonths,
        redirectUrl,
        metadata: {
          source: 'account-contract-billing',
        },
      })

      if (!response.ok || !response.authorizationUrl) {
        setError('Unable to start checkout. Please try again.')
        return
      }

      window.location.assign(response.authorizationUrl)
    } catch (err) {
      console.error('Checkout error', err)
      const message =
        err instanceof Error ? err.message : 'Something went wrong starting checkout.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleStartCheckout = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await startCheckoutForPlan(selectedPlanId)
  }

  if (isPwaApp) {
    return (
      <section id="account-overview-contract">
        <h2>Contract &amp; billing</h2>

        <dl className="account-overview__grid">
          <div>
            <dt>Contract status</dt>
            <dd>{contractStatus ?? '—'}</dd>
          </div>
          <div>
            <dt>Billing plan</dt>
            <dd>{billingPlan ?? '—'}</dd>
          </div>
          <div>
            <dt>Payment provider</dt>
            <dd>{paymentProvider ?? '—'}</dd>
          </div>
        </dl>

        <div className="account-overview__notice" role="note">
          <p className="text-sm text-gray-700">
            To start or renew your Sedifex contract, please visit <strong>sedifex.com</strong> in
            your browser and log in there.
          </p>
        </div>
      </section>
    )
  }

  if (!isOwner) {
    return (
      <section id="account-overview-contract">
        <h2>Contract &amp; billing</h2>
        <p className="text-sm text-gray-600">
          Only the workspace owner can manage billing. Ask your owner to start the contract payment
          from their account.
        </p>
      </section>
    )
  }

  return (
    <section id="account-overview-contract">
      <h2>Contract &amp; billing</h2>

      <dl className="account-overview__grid">
        <div>
          <dt>Contract status</dt>
          <dd>{contractStatus ?? '—'}</dd>
        </div>
        <div>
          <dt>Billing plan</dt>
          <dd>{billingPlan ?? '—'}</dd>
        </div>
        <div>
          <dt>Payment provider</dt>
          <dd>{paymentProvider ?? '—'}</dd>
        </div>
      </dl>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-4" role="alert">
          {error}
        </div>
      )}

      {hasPaidContract && (
        <div className="account-overview__notice mb-4" role="status">
          <div className="space-y-2">
            <p className="text-sm text-gray-700">
              Your contract is active{billingPlanDisplay ? ` on the ${billingPlanDisplay} plan` : ''}.
              It will remain valid until <strong>{contractEndDate ?? '—'}</strong>.
            </p>
            <p className="text-sm text-gray-600">
              Plan upgrades are available when your plan limit is exhausted or when this contract
              ends.
            </p>
          </div>
        </div>
      )}

      {(isPendingContract || isFailedContract) && (
        <div
          className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 mb-4"
          role="status"
        >
          {isPendingContract
            ? 'Your last payment was not completed yet. If you already paid, refresh in a few minutes. Otherwise, start a new checkout below.'
            : 'Your last payment attempt did not go through. Please start a new checkout below.'}
        </div>
      )}
      <p className="text-sm text-gray-600 mb-4">
        Choose a plan and contract duration. Checkout supports mobile money and card.
      </p>

      <form
        onSubmit={handleStartCheckout}
        className="account-overview__form max-w-md space-y-4"
      >
        <fieldset
          disabled={loading}
          className={loading ? 'opacity-70 pointer-events-none' : undefined}
        >
          <label className="block text-sm font-medium">
            <span>Plan</span>
            <select
              value={selectedPlanId}
              onChange={event => setSelectedPlanId(event.target.value)}
              className="border rounded px-3 py-2 w-full"
            >
              {PLANS.map(plan => (
                <option key={plan.id} value={plan.id}>
                  {plan.label} – GHS {plan.amountGhs.toFixed(2)} / month
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium">
            <span>Contract length</span>
            <select
              value={durationMonths}
              onChange={event => setDurationMonths(Number(event.target.value))}
              className="border rounded px-3 py-2 w-full"
            >
              <option value={1}>1 month</option>
              <option value={3}>3 months</option>
              <option value={6}>6 months</option>
              <option value={12}>12 months</option>
            </select>
          </label>

          <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 space-y-1">
            <p className="font-medium">Plan summary</p>
            <p>
              Price: <strong>GHS {totalAmount.toFixed(2)}</strong> ({selectedCadenceLabel})
            </p>
            <p>Billing cadence: {selectedCadenceDescription}</p>
            <p>
              Plan limits: up to {selectedPlan?.productLimit ?? '—'} products and{' '}
              {selectedPlan?.dailySalesLimit ?? '—'} sales/day.
            </p>
            <p>
              Contract end estimate: <strong>{nextChargeDisplay}</strong>
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="button button--primary"
          >
            {loading ? 'Starting checkout…' : 'Pay with Paystack'}
          </button>

          <p className="text-xs text-gray-500">
            You will be redirected to Paystack’s secure page to complete payment.
          </p>
        </fieldset>
      </form>
    </section>
  )
}
