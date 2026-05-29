import React, { useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { getIdTokenResult } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import { useMemberships } from '../hooks/useMemberships'
import { useToast } from '../components/ToastProvider'
import { useAuthUser } from '../hooks/useAuthUser'
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


type PaymentSettings = {
  enabled?: boolean
  approvalStatus?: 'pending' | 'active' | 'disabled' | string
  region?: 'africa' | 'europe' | 'global' | string
  provider?: 'paystack' | 'stripe' | 'manual' | string
  platformFeePercent?: number | null
  feePaidBy?: 'seller' | string
  paystackSubaccountCode?: string | null
  stripeConnectedAccountId?: string | null
  managedBy?: string | null
  adminNote?: string | null
}

type StoreDocument = {
  paymentSettings?: PaymentSettings
  paymentRouting?: Record<string, unknown>
  paystackSubaccountCode?: string | null
}

const defaultPaymentSettings: Required<Pick<PaymentSettings, 'enabled' | 'approvalStatus' | 'region' | 'provider' | 'platformFeePercent' | 'feePaidBy'>> = {
  enabled: true,
  approvalStatus: 'pending',
  region: 'africa',
  provider: 'paystack',
  platformFeePercent: 3,
  feePaidBy: 'seller',
}

function asText(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function readPaymentSettings(store: StoreDocument | null, status: SetupStatus | null): PaymentSettings {
  const settings = store?.paymentSettings ?? {}
  const routing = store?.paymentRouting ?? {}
  return {
    ...defaultPaymentSettings,
    ...settings,
    paystackSubaccountCode: asText(settings.paystackSubaccountCode ?? routing.paystackSubaccountCode ?? store?.paystackSubaccountCode ?? status?.subaccountCode, '') || null,
    stripeConnectedAccountId: asText(settings.stripeConnectedAccountId ?? routing.stripeConnectedAccountId, '') || null,
  }
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

const digitsOnly = (value: string, max: number) => value.replace(/\D/g, '').slice(0, max)

export default function PaymentSettlement() {
  const { storeId, isLoading: storeLoading, error: storeError } = useActiveStore()
  const user = useAuthUser()
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
  const [storeDocument, setStoreDocument] = useState<StoreDocument | null>(null)
  const [adminForm, setAdminForm] = useState<PaymentSettings>(defaultPaymentSettings)
  const [isSedifexAdmin, setIsSedifexAdmin] = useState(false)
  const [isSavingAdminSettings, setIsSavingAdminSettings] = useState(false)
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
  const canManageSettlement = isOwner || isSedifexAdmin
  const template = paymentTemplates[paymentType]
  const currentPaymentSettings = useMemo(() => readPaymentSettings(storeDocument, status), [status, storeDocument])

  const filteredOptions = useMemo(() => {
    const selectedType = paymentType === 'mobile_money' ? 'mobile_money' : 'bank'
    const matching = bankOptions.filter(option => (option.type || 'bank') === selectedType)
    return matching.length ? matching : bankOptions
  }, [bankOptions, paymentType])

  const selectedOption = useMemo(() => {
    return bankOptions.find(option => option.code === selectedBankCode) ?? null
  }, [bankOptions, selectedBankCode])


  useEffect(() => {
    let cancelled = false
    async function loadClaims() {
      if (!user) {
        setIsSedifexAdmin(false)
        return
      }
      try {
        const token = await getIdTokenResult(user)
        const email = user.email?.toLowerCase() ?? ''
        const adminClaim = token.claims.admin === true || token.claims.sedifexAdmin === true
        if (!cancelled) setIsSedifexAdmin(adminClaim || email.endsWith('@sedifex.com'))
      } catch {
        if (!cancelled) setIsSedifexAdmin((user.email?.toLowerCase() ?? '').endsWith('@sedifex.com'))
      }
    }
    void loadClaims()
    return () => { cancelled = true }
  }, [user])

  useEffect(() => {
    if (!storeId) {
      setStoreDocument(null)
      return undefined
    }
    return onSnapshot(doc(db, 'stores', storeId), snapshot => {
      setStoreDocument((snapshot.data() ?? {}) as StoreDocument)
    })
  }, [storeId])

  useEffect(() => {
    setAdminForm(currentPaymentSettings)
  }, [currentPaymentSettings])

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
    const cleanPaymentNumber = digitsOnly(paymentNumber, 20)
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


  async function handleSaveAdminSettings(event: React.FormEvent) {
    event.preventDefault()
    if (!storeId || !isSedifexAdmin) return
    const platformFeePercent = Number(adminForm.platformFeePercent ?? 3)
    if (!Number.isFinite(platformFeePercent) || platformFeePercent < 0 || platformFeePercent > 25) {
      setErrorMessage('Platform fee percent must be between 0 and 25.')
      return
    }
    try {
      setIsSavingAdminSettings(true)
      setErrorMessage('')
      const paystackSubaccountCode = asText(adminForm.paystackSubaccountCode, '') || null
      const stripeConnectedAccountId = asText(adminForm.stripeConnectedAccountId, '') || null
      await setDoc(doc(db, 'stores', storeId), {
        paymentSettings: {
          enabled: adminForm.enabled === true,
          approvalStatus: adminForm.approvalStatus || 'pending',
          region: adminForm.region || 'africa',
          provider: adminForm.provider || 'paystack',
          platformFeePercent,
          feePaidBy: 'seller',
          paystackSubaccountCode,
          stripeConnectedAccountId,
          managedBy: 'sedifex',
          updatedBy: 'sedifex_admin',
          adminNote: asText(adminForm.adminNote, '') || null,
          updatedAt: serverTimestamp(),
        },
        paymentRouting: {
          provider: adminForm.provider || 'paystack',
          paymentProvider: adminForm.provider || 'paystack',
          paystackSubaccountCode,
          stripeConnectedAccountId,
          percentageCharge: platformFeePercent,
          commissionControlledBy: 'sedifex',
          status: adminForm.approvalStatus || 'pending',
          updatedAt: serverTimestamp(),
        },
        paystackSubaccountCode,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      publish({ message: 'Europe and platform payment routing saved.', tone: 'success' })
    } catch (error) {
      console.error('[payment-settlement] admin payment routing save failed', error)
      setErrorMessage('Unable to save admin payment routing settings.')
    } finally {
      setIsSavingAdminSettings(false)
    }
  }

  if (storeError) return <div role="alert">{storeError}</div>

  return (
    <div className="account-overview">
      <h1>Payments / Settlement</h1>
      <p className="account-overview__subtitle">Add where store payouts should settle after Sedifex online checkout.</p>
      {storeLoading ? <p>Loading workspace…</p> : null}
      {!storeId && !storeLoading ? <p>Select a workspace to configure settlement.</p> : null}
      {storeId && !canManageSettlement ? <div className="account-overview__error" role="alert">Only the workspace owner or Sedifex admin can set up settlement.</div> : null}
      {storeId && canManageSettlement ? (
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

          <section aria-labelledby="store-payment-routing">
            <div className="account-overview__section-header">
              <h2 id="store-payment-routing">Payment routing status</h2>
              <p className="account-overview__hint">Sedifex controls provider, payout account, approval, and platform fee settings.</p>
            </div>
            <dl className="account-overview__grid">
              <div><dt>Provider</dt><dd>{currentPaymentSettings.provider ?? 'paystack'}</dd></div>
              <div><dt>Payment status</dt><dd>{currentPaymentSettings.enabled ? currentPaymentSettings.approvalStatus ?? 'pending' : 'disabled'}</dd></div>
              <div><dt>Sedifex fee percent</dt><dd>{typeof currentPaymentSettings.platformFeePercent === 'number' ? `${currentPaymentSettings.platformFeePercent}%` : '3%'}</dd></div>
              <div><dt>Connected payout status</dt><dd>{currentPaymentSettings.provider === 'stripe' ? (currentPaymentSettings.stripeConnectedAccountId ? 'Stripe connected' : 'Stripe account missing') : currentPaymentSettings.paystackSubaccountCode ? 'Paystack subaccount connected' : 'Paystack setup pending'}</dd></div>
            </dl>
            <p className="account-overview__hint">Estimated deduction: Customer payment - gateway fee - Sedifex platform fee = seller payout.</p>
          </section>

          {isSedifexAdmin ? (
            <section aria-labelledby="platform-routing">
              <div className="account-overview__section-header">
                <h2 id="platform-routing">Europe &amp; Platform Payment Routing</h2>
                <p className="account-overview__hint">Sedifex-team controls for Paystack, Stripe Connect, manual routing, splits, approval, and the default 3% platform fee.</p>
              </div>
              <form className="account-overview__profile-form" onSubmit={handleSaveAdminSettings}>
                <div className="account-overview__form-grid">
                  <label><span>Payment enabled</span><select value={adminForm.enabled ? 'true' : 'false'} onChange={event => setAdminForm(prev => ({ ...prev, enabled: event.target.value === 'true' }))}><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
                  <label><span>Approval status</span><select value={adminForm.approvalStatus ?? 'pending'} onChange={event => setAdminForm(prev => ({ ...prev, approvalStatus: event.target.value }))}><option value="pending">Pending</option><option value="active">Active</option><option value="disabled">Disabled</option></select></label>
                  <label><span>Region</span><select value={adminForm.region ?? 'africa'} onChange={event => setAdminForm(prev => ({ ...prev, region: event.target.value }))}><option value="africa">Africa</option><option value="europe">Europe</option><option value="global">Global</option></select></label>
                  <label><span>Provider</span><select value={adminForm.provider ?? 'paystack'} onChange={event => setAdminForm(prev => ({ ...prev, provider: event.target.value }))}><option value="paystack">Paystack</option><option value="stripe">Stripe</option><option value="manual">Manual</option></select></label>
                  <label><span>Platform fee percent</span><input type="number" min="0" max="25" step="0.01" value={adminForm.platformFeePercent ?? 3} onChange={event => setAdminForm(prev => ({ ...prev, platformFeePercent: Number(event.target.value) }))} /></label>
                  <label><span>Fee paid by</span><input value="Seller" readOnly /></label>
                  <label><span>Paystack subaccount code</span><input value={adminForm.paystackSubaccountCode ?? ''} onChange={event => setAdminForm(prev => ({ ...prev, paystackSubaccountCode: event.target.value }))} placeholder="ACCT_xxxxx" /></label>
                  <label><span>Stripe connected account ID</span><input value={adminForm.stripeConnectedAccountId ?? ''} onChange={event => setAdminForm(prev => ({ ...prev, stripeConnectedAccountId: event.target.value }))} placeholder="acct_xxxxx" /></label>
                  <label style={{ gridColumn: '1 / -1' }}><span>Notes/internal admin note</span><textarea value={adminForm.adminNote ?? ''} onChange={event => setAdminForm(prev => ({ ...prev, adminNote: event.target.value }))} rows={3} /></label>
                </div>
                <div className="account-overview__actions"><p className="account-overview__hint">Store owners can view these settings, but cannot edit provider, split, approval, or Sedifex fee controls.</p><button type="submit" className="button button--primary" disabled={isSavingAdminSettings}>{isSavingAdminSettings ? 'Saving…' : 'Save routing settings'}</button></div>
              </form>
            </section>
          ) : null}

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
                <label><span>{template.numberLabel}</span><input inputMode="numeric" value={paymentNumber} onChange={event => setPaymentNumber(digitsOnly(event.target.value, 20))} maxLength={20} placeholder={template.placeholder} required /></label>
                <label><span>Contact email</span><input type="email" value={contactEmail} onChange={event => setContactEmail(event.target.value)} /></label>
                <label><span>Contact name</span><input value={contactName} onChange={event => setContactName(event.target.value)} maxLength={160} /></label>
                <label><span>Phone</span><input type="tel" value={contactPhone} onChange={event => setContactPhone(event.target.value)} maxLength={80} /></label>
              </div>
              <div className="account-overview__banner" role="note" style={{ marginTop: 16 }}>
                <p><strong>{template.numberLabel}:</strong> {template.numberHint}</p>
                {selectedOption ? <p><strong>Selected provider:</strong> {selectedOption.name} ({selectedOption.code})</p> : null}
                <button type="button" className="button button--secondary" onClick={() => setPaymentNumber(digitsOnly(contactPhone, 20))} disabled={!contactPhone}>Use contact phone as payment number</button>
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