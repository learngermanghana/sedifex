import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import './BookingMappingSettings.css'

const MAX_ALIASES_PER_FIELD = 40

type CanonicalFieldKey =
  | 'customerName'
  | 'customerPhone'
  | 'customerEmail'
  | 'serviceName'
  | 'bookingDate'
  | 'bookingTime'
  | 'preferredBranch'
  | 'preferredContactMethod'
  | 'depositAmount'
  | 'paymentMethod'

type SheetOnlyKey = 'status' | 'quantity'

type SheetHeaderKey = CanonicalFieldKey | SheetOnlyKey

const CANONICAL_FIELD_KEYS: CanonicalFieldKey[] = [
  'customerName',
  'customerPhone',
  'customerEmail',
  'serviceName',
  'bookingDate',
  'bookingTime',
  'preferredBranch',
  'preferredContactMethod',
  'depositAmount',
  'paymentMethod',
]

const SHEET_HEADER_KEYS: SheetHeaderKey[] = [...CANONICAL_FIELD_KEYS, 'status', 'quantity']

const FIELD_LABELS: Record<SheetHeaderKey, string> = {
  customerName: 'Customer name',
  customerPhone: 'Customer phone',
  customerEmail: 'Customer email',
  serviceName: 'Service name',
  bookingDate: 'Booking date',
  bookingTime: 'Booking time',
  preferredBranch: 'Preferred branch',
  preferredContactMethod: 'Preferred contact method',
  depositAmount: 'Deposit amount',
  paymentMethod: 'Payment method',
  status: 'Status',
  quantity: 'Quantity',
}

const DEFAULT_SHEET_HEADERS: Record<SheetHeaderKey, string> = {
  customerName: 'Customer Name',
  customerPhone: 'Customer Phone',
  customerEmail: 'Customer Email',
  serviceName: 'Service',
  bookingDate: 'Booking Date',
  bookingTime: 'Booking Time',
  preferredBranch: 'Preferred Branch',
  preferredContactMethod: 'Preferred Contact Method',
  depositAmount: 'Deposit Amount',
  paymentMethod: 'Payment Method',
  status: 'Status',
  quantity: 'Quantity',
}

type AliasState = Record<CanonicalFieldKey, string[]>
type HeaderState = Record<SheetHeaderKey, string>
type AliasDraftState = Record<CanonicalFieldKey, string>

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function buildDefaultAliasState(): AliasState {
  return CANONICAL_FIELD_KEYS.reduce((acc, key) => {
    acc[key] = []
    return acc
  }, {} as AliasState)
}

function buildDefaultHeaderState(): HeaderState {
  return SHEET_HEADER_KEYS.reduce((acc, key) => {
    acc[key] = DEFAULT_SHEET_HEADERS[key]
    return acc
  }, {} as HeaderState)
}

function buildDefaultAliasDraftState(): AliasDraftState {
  return CANONICAL_FIELD_KEYS.reduce((acc, key) => {
    acc[key] = ''
    return acc
  }, {} as AliasDraftState)
}

function splitAliases(value: string): string[] {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

export default function BookingMappingSettings() {
  const { storeId, isLoading: storeLoading, error: storeError } = useActiveStore()
  const [aliasesByField, setAliasesByField] = useState<AliasState>(buildDefaultAliasState)
  const [aliasDraftByField, setAliasDraftByField] = useState<AliasDraftState>(buildDefaultAliasDraftState)
  const [sheetHeaders, setSheetHeaders] = useState<HeaderState>(buildDefaultHeaderState)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const duplicateHeaderGroups = useMemo(() => {
    const headerToKeys = new Map<string, SheetHeaderKey[]>()

    for (const key of SHEET_HEADER_KEYS) {
      const normalizedHeader = sheetHeaders[key].trim().toLowerCase()
      if (!normalizedHeader) continue
      const existing = headerToKeys.get(normalizedHeader) ?? []
      existing.push(key)
      headerToKeys.set(normalizedHeader, existing)
    }

    return Array.from(headerToKeys.values()).filter(keys => keys.length > 1)
  }, [sheetHeaders])

  const hasHeaderValidationError = useMemo(
    () => SHEET_HEADER_KEYS.some(key => !sheetHeaders[key].trim()),
    [sheetHeaders],
  )

  useEffect(() => {
    if (!storeId) {
      setLoading(false)
      return
    }

    let cancelled = false

    async function loadConfig() {
      setLoading(true)
      setErrorMessage(null)
      setSaveMessage(null)

      try {
        const storeSnap = await getDoc(doc(db, 'stores', storeId))
        const storeData = (storeSnap.data() ?? {}) as Record<string, unknown>
        const configRaw =
          storeData.integrationBookingConfig && typeof storeData.integrationBookingConfig === 'object'
            ? (storeData.integrationBookingConfig as Record<string, unknown>)
            : {}

        const aliasesRaw =
          configRaw.fieldAliases && typeof configRaw.fieldAliases === 'object'
            ? (configRaw.fieldAliases as Record<string, unknown>)
            : {}

        const nextAliases = buildDefaultAliasState()
        for (const key of CANONICAL_FIELD_KEYS) {
          const rawList = aliasesRaw[key]
          if (!Array.isArray(rawList)) continue

          const normalizedList = Array.from(
            new Set(
              rawList
                .map(item => toTrimmedString(item))
                .filter(Boolean),
            ),
          ).slice(0, MAX_ALIASES_PER_FIELD)

          nextAliases[key] = normalizedList
        }

        const sheetHeadersRaw =
          configRaw.sheetHeaders && typeof configRaw.sheetHeaders === 'object'
            ? (configRaw.sheetHeaders as Record<string, unknown>)
            : {}

        const nextHeaders = buildDefaultHeaderState()
        for (const key of SHEET_HEADER_KEYS) {
          const providedHeader = toTrimmedString(sheetHeadersRaw[key])
          if (providedHeader) {
            nextHeaders[key] = providedHeader.slice(0, 120)
          }
        }

        if (!cancelled) {
          setAliasesByField(nextAliases)
          setSheetHeaders(nextHeaders)
        }
      } catch (error) {
        console.error('[booking-mapping] Failed to load integrationBookingConfig', error)
        if (!cancelled) {
          setErrorMessage('Unable to load booking mapping settings right now. Please try again.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadConfig().catch(error => {
      console.error('[booking-mapping] Unexpected load failure', error)
    })

    return () => {
      cancelled = true
    }
  }, [storeId])

  const addAliases = useCallback((field: CanonicalFieldKey, rawInput: string) => {
    const parsed = splitAliases(rawInput)
    if (parsed.length === 0) return

    setAliasesByField(previous => {
      const existing = previous[field]
      const normalizedExisting = new Set(existing.map(alias => alias.toLowerCase()))
      const merged = [...existing]

      for (const alias of parsed) {
        if (merged.length >= MAX_ALIASES_PER_FIELD) break
        const normalizedAlias = alias.toLowerCase()
        if (normalizedExisting.has(normalizedAlias)) continue
        merged.push(alias)
        normalizedExisting.add(normalizedAlias)
      }

      return {
        ...previous,
        [field]: merged,
      }
    })
  }, [])

  const removeAlias = useCallback((field: CanonicalFieldKey, alias: string) => {
    setAliasesByField(previous => ({
      ...previous,
      [field]: previous[field].filter(existing => existing !== alias),
    }))
  }, [])

  const handleSave = useCallback(async () => {
    if (!storeId) {
      setErrorMessage('Select a workspace before editing booking mapping settings.')
      return
    }

    if (hasHeaderValidationError) {
      setErrorMessage('Every sheet header must have a label before saving.')
      return
    }

    if (CANONICAL_FIELD_KEYS.some(key => aliasesByField[key].length > MAX_ALIASES_PER_FIELD)) {
      setErrorMessage(`Each field supports up to ${MAX_ALIASES_PER_FIELD} aliases.`)
      return
    }

    setSaving(true)
    setErrorMessage(null)
    setSaveMessage(null)

    try {
      await setDoc(
        doc(db, 'stores', storeId),
        {
          integrationBookingConfig: {
            mappingVersion: 'v1',
            fieldAliases: aliasesByField,
            sheetHeaders,
          },
        },
        { merge: true },
      )

      setSaveMessage('Booking mapping saved. New ingested bookings will use this config immediately.')
    } catch (error) {
      console.error('[booking-mapping] Failed to save integrationBookingConfig', error)
      setErrorMessage('Unable to save booking mapping right now. Please try again.')
    } finally {
      setSaving(false)
    }
  }, [aliasesByField, hasHeaderValidationError, sheetHeaders, storeId])

  return (
    <main className="page booking-mapping-settings">
      <section className="card booking-mapping-settings__card" aria-labelledby="booking-mapping-title">
        <header className="booking-mapping-settings__header">
          <p className="booking-mapping-settings__crumbs">Settings → Integrations → Booking Mapping</p>
          <h1 id="booking-mapping-title">Booking mapping</h1>
          <div className="booking-mapping-settings__intro">
            <p className="form__hint">
              Configure alias lookups and sheet column headers used by booking ingestion.
            </p>
            <ul className="booking-mapping-settings__intro-list">
              <li>Back to Integrations to review API key, booking, and webhook setup.</li>
              <li>Add custom aliases that should map to each canonical field (up to {MAX_ALIASES_PER_FIELD} aliases per field).</li>
              <li>Set output labels for each booking sheet column used during sync.</li>
            </ul>
          </div>
          <p className="form__hint">
            <Link to="/account">Back to Integrations</Link>
          </p>
        </header>

        {(storeError || errorMessage) && (
          <p className="booking-mapping-settings__feedback booking-mapping-settings__feedback--error" role="alert">
            {storeError ?? errorMessage}
          </p>
        )}
        {saveMessage && (
          <p className="booking-mapping-settings__feedback booking-mapping-settings__feedback--success" role="status">
            {saveMessage}
          </p>
        )}

        {(storeLoading || loading) && <p className="form__hint">Loading booking mapping settings…</p>}

        {!storeLoading && !loading && storeId && (
          <>
            <section className="booking-mapping-settings__section" aria-labelledby="booking-aliases-heading">
              <h2 id="booking-aliases-heading">Field aliases</h2>
              <p className="form__hint">
                Add custom aliases that should map incoming payload keys to each canonical field.
              </p>

              <div className="booking-mapping-settings__alias-grid">
                {CANONICAL_FIELD_KEYS.map(field => (
                  <article key={field} className="booking-mapping-settings__alias-card">
                    <h3>{FIELD_LABELS[field]}</h3>
                    <div className="booking-mapping-settings__chips" aria-live="polite">
                      {aliasesByField[field].length === 0 ? (
                        <span className="form__hint">No custom aliases yet.</span>
                      ) : (
                        aliasesByField[field].map(alias => (
                          <span key={alias} className="booking-mapping-settings__chip">
                            <code>{alias}</code>
                            <button
                              type="button"
                              aria-label={`Remove ${alias} alias from ${FIELD_LABELS[field]}`}
                              onClick={() => removeAlias(field, alias)}
                            >
                              ×
                            </button>
                          </span>
                        ))
                      )}
                    </div>

                    <label>
                      <span>Add alias</span>
                      <div className="booking-mapping-settings__alias-input-row">
                        <input
                          type="text"
                          value={aliasDraftByField[field]}
                          placeholder="example_field_name"
                          onChange={event =>
                            setAliasDraftByField(previous => ({
                              ...previous,
                              [field]: event.target.value,
                            }))
                          }
                          onKeyDown={event => {
                            if (event.key === 'Enter' || event.key === ',') {
                              event.preventDefault()
                              addAliases(field, aliasDraftByField[field])
                              setAliasDraftByField(previous => ({ ...previous, [field]: '' }))
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="button button--secondary"
                          onClick={() => {
                            addAliases(field, aliasDraftByField[field])
                            setAliasDraftByField(previous => ({ ...previous, [field]: '' }))
                          }}
                          disabled={aliasesByField[field].length >= MAX_ALIASES_PER_FIELD}
                        >
                          Add
                        </button>
                      </div>
                    </label>

                    <p className="form__hint">
                      {aliasesByField[field].length}/{MAX_ALIASES_PER_FIELD} aliases
                    </p>
                  </article>
                ))}
              </div>
            </section>

            <section className="booking-mapping-settings__section" aria-labelledby="sheet-headers-heading">
              <h2 id="sheet-headers-heading">Sheet headers</h2>
              <p className="form__hint">Set output labels for each booking sheet column used for sheet sync output.</p>

              <div className="booking-mapping-settings__header-grid">
                {SHEET_HEADER_KEYS.map(key => (
                  <label key={key}>
                    <span>{FIELD_LABELS[key]}</span>
                    <input
                      type="text"
                      value={sheetHeaders[key]}
                      onChange={event =>
                        setSheetHeaders(previous => ({
                          ...previous,
                          [key]: event.target.value,
                        }))
                      }
                      maxLength={120}
                      required
                    />
                  </label>
                ))}
              </div>

              {duplicateHeaderGroups.length > 0 && (
                <div className="booking-mapping-settings__feedback booking-mapping-settings__feedback--warning" role="status">
                  <strong>Warning:</strong> some canonical fields share the same sheet header:
                  <ul>
                    {duplicateHeaderGroups.map(group => (
                      <li key={group.join('-')}>{group.map(key => FIELD_LABELS[key]).join(', ')}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section className="booking-mapping-settings__section" aria-labelledby="preview-heading">
              <h2 id="preview-heading">Preview</h2>
              <p className="form__hint">This is the column output that will be used when booking data is synced.</p>
              <div className="booking-mapping-settings__preview-table-wrapper">
                <table className="booking-mapping-settings__preview-table">
                  <thead>
                    <tr>
                      <th scope="col">Canonical key</th>
                      <th scope="col">Sheet column label</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SHEET_HEADER_KEYS.map(key => (
                      <tr key={key}>
                        <td>
                          <code>{key}</code>
                        </td>
                        <td>{sheetHeaders[key].trim() || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="booking-mapping-settings__actions">
              <button type="button" className="button button--primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save booking mapping'}
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
