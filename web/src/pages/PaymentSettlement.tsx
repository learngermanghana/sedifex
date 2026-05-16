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

type SettlementBankOption = {
  id?: number | null
  name: string
  code: string
  slug?: string | null
  type?: string | null
  country?: string | null
  currency?: string | null
  supportsTransfer?: boolean | null
  gateway?: string | null
}

const paymentTemplates = {
  bank: {
    label: 'Bank account',
    helper: 'Select the bank, then enter the bank account number exactly as registered with the bank.',
    numberLabel: 'Payment number / account number',
    numberHint: 'Use the bank account number only. Do not add spaces or symbols.',
    placeholder: 'e.g. 0123456789',
  },
  mobile_money: {
    label: 'Mobile money',
    helper: 'Select the mobile money provider, then enter the MoMo wallet number used for settlement.',
    numberLabel: 'Payment number / MoMo number',
    numberHint: 'Use the wallet phone number only. Do not add spaces or country symbols.',
    placeholder: 'e.g. 0240000000',
  },
}

export default function PaymentSettlement() {
  const { storeId, isLoading: storeLoading, error: storeError } = useActiveStore()
  const { memberships } = useMemberships()
  const { publish } = useToast()
  const [businessName, setBusinessName] = useState('')
  const [paymentType, setPaymentType] = useState<'bank' | 'mobile_money'>('bank')
  const [selectedBankCode, setSelectedBankCode] = useState('')
  const [routingCode, setRoutingCode] = useState('')
  const [paymentNumber, setPaymentNumber] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [bankOptions, setBankOptions] = useState<SettlementBankOption[]>([])
  const [isLoadingBanks, setIsLoadingBanks] = useState(false)
  const [isLoadingStatus, setIsLoadingStatus] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const activeMembership = useMemo(() => {
    if (!storeId) return null
    return memberships.find(member => member.storeId === storeId) ?? null
  }, [memberships, storeId])
  const isOwner = activeMembership?.role === 'owner'
  const digits = (value: string, max: number) => value.replace(/\D/g, '').slice(0, max)
  const template = paymentTemplates[paymentType]

  const filteredOptions = useMemo(() => {
    const selectedType = paymentType === 'mobile_money' ? 'mobile_money' : 'bank'
    const matching = bankOptions.filter(option => (option.type || 'bank') === selectedType)
    return matching.length ? matching : bankOptions
  }, [bankOptions, paymentType])

  const selectedOption = useMemo(() => {
    return bankOptions.find(option => option.code === selectedBankCode) ?? null
  }, [bankOptions, selectedBankCode])

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
      const nextStatus = (response.data ?? {}) as SetupStatus
      setStatus(nextStatus)
      if (!businessName && nextStatus.accountName) setBusinessName(nextStatus.accountName)
      if (!routingCode && nextStatus.settlementBank) setRoutingCode(String(nextStatus.settlementBank))
    } catch (error) {
      console.error('[payment-settlement] load failed', error)
      setStatus(null)
      setErrorMessage('Unable to load settlement details.')
    } finally {
      setIsLoadingStatus(false)
    }
  }

  async function loadSettlementBanks() {
    if (!isOwner) return
    try {
      setIsLoadingBanks(true)
      const callable = httpsCallable(functions, 'fetchPaystackSettlementBanks')
      const response = await callable({ country: 'ghana', currency: 'GHS' })
      const banks = (response.data as { banks?: SettlementBankOption[] } | undefined)?.banks ?? []
      setBankOptions(banks)
    } catch (error) {
      console.error('[payment-settlement] bank options failed', error)
      setBankOptions([])
      publish({ message: 'Could not auto-load Paystack banks. You can still type the routing code manually.', tone: 'warning' })
    } finally {
      setIsLoadingBanks(false)
    }
  }

  useEffect(() => {
    void refreshSubaccount()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, isOwner])

  useEffect(() => {
    void loadSettlementBanks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner])

  function handleSelectBank(code: string) {
    setSelectedBankCode(code)
    if (code) setRoutingCode(code)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!storeId || !isOwner) return
    const cleanBusinessName = businessName.trim()
    const cleanRoutingCode = routingCode.trim()
    const cleanPaymentNumber = digits(paymentNumber, 20)
    if (!cleanBusinessName) return setErrorMessage('Business name is required.')
    if (!cleanRoutingCode) return setErrorMessage('Select a bank/mobile money provider or enter the Paystack routing code.')
    if (cleanPaymentNumber.length < 8) return setErrorMessage('Enter a valid payment number.')

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
        description: `Sedifex ${template.label.toLowerCase()} settlement for ${cleanBusinessName}`,
      }
      payload['account' + 'Number'] = cleanPaymentNumber
      const response = await callable(payload)
      setStatus({ ...((response.data ?? {}) as SetupStatus), configured: true })
      setPaymentNumber('')
      publish({ message: 'Payment settlement setup saved.', tone: 'success' })
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
      <p className="account-overview__subtitle">Set up where store payouts should settle after Sedifex online checkout.</p>
      <div className="account-overview__banner" role="status"><p>Sedifex controls commission from backend settings. Stores only provide bank or mobile money settlement details.</p></div>
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
              <div><dt>Masked payment number</dt><dd>{status?.accountNumberLast4 ? `•••• ${status.accountNumberLast4}` : '—'}</dd></div>
              <div><dt>Routing provider</dt><dd>{status?.settlementBank ?? '—'}</dd></div>
              <div><dt>Sedifex commission</dt><dd>{typeof status?.percentageCharge === 'number' ? `${status.percentageCharge}%` : 'Controlled by Sedifex'}</dd></div>
              <div><dt>Active</dt><dd>{status?.active === true || status?.active === 1 ? 'Yes' : status?.active === false || status?.active === 0 ? 'No' : '—'}</dd></div>
              <div><dt>Verified</dt><dd>{status?.isVerified === true ? 'Yes' : status?.isVerified === false ? 'No' : '—'}</dd></div>
            </dl>
          </section>
          <section aria-labelledby="settlement-form">
            <div className="account-overview__section-header"><h2 id="settlement-form">Create or update setup</h2><p className="account-overview__hint">Choose bank or mobile money to auto-fill the Paystack routing code. Manual code entry remains available if a provider is missing.</p></div>
            <form className="account-overview__profile-form" onSubmit={handleSubmit}>
              <div className="account-overview__grid" style={{ marginBottom: 16 }}>
                <button type="button" className={`button ${paymentType === 'bank' ? 'button--primary' : 'button--secondary'}`} onClick={() => { setPaymentType('bank'); setSelectedBankCode(''); setRoutingCode('') }}>Bank account</button>
                <button type="button" className={`button ${paymentType === 'mobile_money' ? 'button--primary' : 'button--secondary'}`} onClick={() => { setPaymentType('mobile_money'); setSelectedBankCode(''); setRoutingCode('') }}>Mobile money</button>
              </div>
              <p className="account-overview__hint">{template.helper}</p>
              <div className="account-overview__form-grid">
                <label><span>Business name</span><input value={businessName} onChange={event => setBusinessName(event.target.value)} maxLength={120} required /></label>
                <label>
                  <span>{paymentType === 'mobile_money' ? 'Mobile money provider' : 'Bank'}</span>
                  <select value={selectedBankCode} onChange={event => handleSelectBank(event.target.value)} disabled={isLoadingBanks}>
                    <option value="">{isLoadingBanks ? 'Loading Paystack providers…' : 'Select provider to auto-fill code'}</option>
                    {filteredOptions.map(option => <option key={`${option.code}-${option.name}`} value={option.code}>{option.name} — {option.code}</option>)}
                  </select>
                </label>
                <label><span>Paystack routing code</span><input value={routingCode} onChange={event => setRoutingCode(event.target.value.trim())} maxLength={30} placeholder="Auto-filled when you select provider" required /></label>
                <label><span>{template.numberLabel}</span><input inputMode="numeric" value={paymentNumber} onChange={event => setPaymentNumber(digits(event.target.value, 20))} maxLength={20} placeholder={template.placeholder} required /></label>
                <label><span>Contact email</span><input type="email" value={contactEmail} onChange={event => setContactEmail(event.target.value)} /></label>
                <label><span>Contact name</span><input value={contactName} onChange={event => setContactName(event.target.value)} maxLength={160} /></label>
                <label><span>Phone</span><input type="tel" value={contactPhone} onChange={event => setContactPhone(event.target.value)} maxLength={80} /></label>
              </div>
              <div className="account-overview__banner" role="note" style={{ marginTop: 16 }}>
                <p><strong>{template.numberLabel}:</strong> {template.numberHint}</p>
                {selectedOption ? <p><strong>Selected provider:</strong> {selectedOption.name} ({selectedOption.code})</p> : null}
                <button type="button" className="button button--secondary" onClick={() => setPaymentNumber(digits(contactPhone, 20))} disabled={!contactPhone}>Use contact phone as payment number</button>
              </div>
              {errorMessage ? <p className="account-overview__error" role="alert">{errorMessage}</p> : null}
              <div className="account-overview__actions"><p className="account-overview__hint">Sedifex stores the Paystack subaccount code and masked payment number. Commission remains controlled by Sedifex.</p><button type="submit" className="button button--primary" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save payment setup'}</button></div>
            </form>
          </section>
        </>
      ) : null}
    </div>
  )
}