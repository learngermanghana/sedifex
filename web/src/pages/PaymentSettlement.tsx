import React, { useEffect, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import { useMemberships } from '../hooks/useMemberships'
import { useToast } from '../components/ToastProvider'
import './AccountOverview.css'

type SetupStatus = {
  configured?: boolean
  subaccountCode?: string | null
  accountName?: string | null
  accountNumberLast4?: string | null
  settlementBank?: string | null
  percentageCharge?: number | null
  active?: boolean | number | null
  isVerified?: boolean | null
}

export default function PaymentSettlement() {
  const { storeId, isLoading: storeLoading, error: storeError } = useActiveStore()
  const { memberships } = useMemberships()
  const { publish } = useToast()
  const [businessName, setBusinessName] = useState('')
  const [routingCode, setRoutingCode] = useState('')
  const [settlementNo, setSettlementNo] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [isLoadingStatus, setIsLoadingStatus] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const activeMembership = useMemo(() => {
    if (!storeId) return null
    return memberships.find(member => member.storeId === storeId) ?? null
  }, [memberships, storeId])
  const isOwner = activeMembership?.role === 'owner'
  const digits = (value: string, max: number) => value.replace(/\D/g, '').slice(0, max)

  async function refreshSubaccount() {
    if (!storeId || !isOwner) {
      setStatus(null)
      return
    }
    try {
      setIsLoadingStatus(true)
      setErrorMessage('')
      const callable = httpsCallable(functions, 'fetchPaystackMerchantSubaccount')
      const response = await callable({ storeId })
      setStatus((response.data ?? {}) as SetupStatus)
    } catch (error) {
      console.error('[payment-settlement] load failed', error)
      setStatus(null)
      setErrorMessage('Unable to load settlement details.')
    } finally {
      setIsLoadingStatus(false)
    }
  }

  useEffect(() => {
    void refreshSubaccount()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, isOwner])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!storeId || !isOwner) return
    const cleanBusinessName = businessName.trim()
    const cleanRoutingCode = digits(routingCode, 6)
    const cleanSettlementNo = digits(settlementNo, 20)
    if (!cleanBusinessName) return setErrorMessage('Business name is required.')
    if (!cleanRoutingCode) return setErrorMessage('Routing code is required.')
    if (cleanSettlementNo.length < 8) return setErrorMessage('Enter a valid settlement number.')

    try {
      setIsSaving(true)
      setErrorMessage('')
      const callable = httpsCallable(functions, 'createPaystackMerchantSubaccount')
      const payload: Record<string, unknown> = {
        storeId,
        businessName: cleanBusinessName,
        bankCode: cleanRoutingCode,
        settlementBank: cleanRoutingCode,
        primaryContactEmail: contactEmail.trim().toLowerCase() || undefined,
        primaryContactName: contactName.trim() || undefined,
        primaryContactPhone: contactPhone.trim() || undefined,
      }
      payload['account' + 'Number'] = cleanSettlementNo
      const response = await callable(payload)
      setStatus({ ...((response.data ?? {}) as SetupStatus), configured: true })
      setSettlementNo('')
      publish({ message: 'Settlement setup saved.', tone: 'success' })
    } catch (error) {
      console.error('[payment-settlement] save failed', error)
      setErrorMessage(typeof (error as { message?: unknown })?.message === 'string' ? (error as { message: string }).message : 'Unable to save settlement details.')
    } finally {
      setIsSaving(false)
    }
  }

  if (storeError) return <div role="alert">{storeError}</div>

  return (
    <div className="account-overview">
      <h1>Payments / Settlement</h1>
      <p className="account-overview__subtitle">Set up the merchant settlement route used for Sedifex online checkout.</p>
      <div className="account-overview__banner" role="status"><p>Sedifex controls commission from backend settings. Stores only provide their settlement and contact details.</p></div>
      {storeLoading ? <p>Loading workspace…</p> : null}
      {!storeId && !storeLoading ? <p>Select a workspace to configure settlement.</p> : null}
      {storeId && !isOwner ? <div className="account-overview__error" role="alert">Only the workspace owner can set up settlement.</div> : null}
      {storeId && isOwner ? (
        <>
          <section aria-labelledby="settlement-status">
            <div className="account-overview__section-header">
              <h2 id="settlement-status">Current setup</h2>
              <button type="button" className="button button--secondary" onClick={() => void refreshSubaccount()} disabled={isLoadingStatus}>{isLoadingStatus ? 'Refreshing…' : 'Refresh'}</button>
            </div>
            <dl className="account-overview__grid">
              <div><dt>Configured</dt><dd>{status?.configured ? 'Yes' : 'No'}</dd></div>
              <div><dt>Subaccount code</dt><dd>{status?.subaccountCode ?? '—'}</dd></div>
              <div><dt>Name on setup</dt><dd>{status?.accountName ?? '—'}</dd></div>
              <div><dt>Masked settlement number</dt><dd>{status?.accountNumberLast4 ? `•••• ${status.accountNumberLast4}` : '—'}</dd></div>
              <div><dt>Routing bank</dt><dd>{status?.settlementBank ?? '—'}</dd></div>
              <div><dt>Sedifex commission</dt><dd>{typeof status?.percentageCharge === 'number' ? `${status.percentageCharge}%` : 'Controlled by Sedifex'}</dd></div>
              <div><dt>Active</dt><dd>{status?.active === true || status?.active === 1 ? 'Yes' : status?.active === false || status?.active === 0 ? 'No' : '—'}</dd></div>
              <div><dt>Verified</dt><dd>{status?.isVerified === true ? 'Yes' : status?.isVerified === false ? 'No' : '—'}</dd></div>
            </dl>
          </section>
          <section aria-labelledby="settlement-form">
            <div className="account-overview__section-header"><h2 id="settlement-form">Create or update setup</h2><p className="account-overview__hint">Use the numeric Paystack routing code. Sedifex supplies the commission percentage automatically.</p></div>
            <form className="account-overview__profile-form" onSubmit={handleSubmit}>
              <div className="account-overview__form-grid">
                <label><span>Business name</span><input value={businessName} onChange={event => setBusinessName(event.target.value)} maxLength={120} required /></label>
                <label><span>Paystack routing code</span><input inputMode="numeric" value={routingCode} onChange={event => setRoutingCode(digits(event.target.value, 6))} maxLength={6} required /></label>
                <label><span>Settlement number</span><input inputMode="numeric" value={settlementNo} onChange={event => setSettlementNo(digits(event.target.value, 20))} maxLength={20} required /></label>
                <label><span>Contact email</span><input type="email" value={contactEmail} onChange={event => setContactEmail(event.target.value)} /></label>
                <label><span>Contact name</span><input value={contactName} onChange={event => setContactName(event.target.value)} maxLength={160} /></label>
                <label><span>Phone</span><input type="tel" value={contactPhone} onChange={event => setContactPhone(event.target.value)} maxLength={80} /></label>
              </div>
              {errorMessage ? <p className="account-overview__error" role="alert">{errorMessage}</p> : null}
              <div className="account-overview__actions"><p className="account-overview__hint">Sedifex stores the subaccount code and masked details. Commission remains controlled by Sedifex.</p><button type="submit" className="button button--primary" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save settlement setup'}</button></div>
            </form>
          </section>
        </>
      ) : null}
    </div>
  )
}
