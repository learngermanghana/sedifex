import React, { useEffect, useMemo, useState } from 'react'
import { INDUSTRY_ENABLED_MODULE_PRESETS, NAV_ITEMS, type Industry } from '../config/navigation'
import type { StorePreferences } from '../hooks/useStorePreferences'

type Props = {
  preferences: StorePreferences['navigation']
  onSave: (navigation: StorePreferences['navigation']) => Promise<void>
  canEdit: boolean
}

type ValidationError = string | null

const INDUSTRY_OPTIONS: Array<{ value: Industry; label: string; helper: string }> = [
  {
    value: 'shop',
    label: 'Retail / Shop',
    helper: 'Starts with selling, products, customers, bookings, reports, settlement, promo, gallery, and marketing pages.',
  },
  {
    value: 'travel',
    label: 'Travel',
    helper: 'Starts with trips, bookings, upcoming trips, travelers, invoices, blog, promos, gallery, and customer follow-up.',
  },
  {
    value: 'ngo',
    label: 'NGO',
    helper: 'Starts with donors, volunteers, campaigns, support requests, funds, reports, blog, and communication tools.',
  },
  {
    value: 'school',
    label: 'School',
    helper: 'Starts with students, registrations, upcoming classes, bookings, payments, blog, admissions promo, and communication tools.',
  },
]

function uniqueList(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function moduleIsEnabled(enabledModules: string[], id: string) {
  return enabledModules.length === 0 || enabledModules.includes(id)
}

function moduleSummary(enabledModules: string[]) {
  if (enabledModules.length === 0) return `${NAV_ITEMS.length} pages active`
  const count = NAV_ITEMS.filter(item => enabledModules.includes(item.id)).length
  return `${count} ${count === 1 ? 'page' : 'pages'} active`
}

export default function NavigationSettingsSection({ preferences, onSave, canEdit }: Props) {
  const [draft, setDraft] = useState({
    ...preferences,
    enabledModules: Array.isArray(preferences.enabledModules) ? preferences.enabledModules : [],
    customNavItems: [],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<ValidationError>(null)

  useEffect(() => {
    setDraft({
      ...preferences,
      enabledModules: Array.isArray(preferences.enabledModules) ? preferences.enabledModules : [],
      customNavItems: [],
    })
  }, [preferences])

  const selectedIndustry = INDUSTRY_OPTIONS.find(option => option.value === draft.industry) ?? INDUSTRY_OPTIONS[0]

  const enabledModuleIds = useMemo(() => {
    if (draft.enabledModules.length === 0) return NAV_ITEMS.map(item => item.id)
    return uniqueList(draft.enabledModules)
  }, [draft.enabledModules])

  const enabledModulesByIndustry = useMemo(() => new Set(INDUSTRY_ENABLED_MODULE_PRESETS[draft.industry] ?? []), [draft.industry])

  const save = async () => {
    setError(null)
    setSaving(true)
    try {
      await onSave({
        ...draft,
        enabledModules: uniqueList(draft.enabledModules),
        customNavItems: [],
      })
    } finally {
      setSaving(false)
    }
  }

  const applyIndustryTemplate = (industry: Industry) => {
    setDraft(current => ({
      ...current,
      industry,
      enabledModules: uniqueList(INDUSTRY_ENABLED_MODULE_PRESETS[industry] ?? []),
      customNavItems: [],
    }))
    setError(null)
  }

  const toggleModule = (id: string) => {
    setDraft(current => {
      const currentEnabled = current.enabledModules.length === 0
        ? NAV_ITEMS.map(item => item.id)
        : current.enabledModules
      const enabled = currentEnabled.includes(id)
        ? currentEnabled.filter(item => item !== id)
        : [...currentEnabled, id]
      return { ...current, enabledModules: uniqueList(enabled), customNavItems: [] }
    })
  }

  const resetToTemplate = () => {
    setDraft(current => ({
      ...current,
      enabledModules: uniqueList(INDUSTRY_ENABLED_MODULE_PRESETS[current.industry] ?? []),
      customNavItems: [],
    }))
    setError(null)
  }

  const showAllPages = () => {
    setDraft(current => ({
      ...current,
      enabledModules: NAV_ITEMS.map(item => item.id),
      customNavItems: [],
    }))
    setError(null)
  }

  const hideAllPages = () => {
    setDraft(current => ({ ...current, enabledModules: [], customNavItems: [] }))
    setError('All pages are currently hidden. You can still re-add any page from this list before saving.')
  }

  return <section aria-labelledby="account-nav-settings" className="account-overview__nav-settings">
    <div className="account-overview__section-header">
      <h2 id="account-nav-settings">Navigation settings</h2>
      <p className="account-overview__subtitle">
        Choose an industry and Sedifex will intelligently select the primary pages for that workspace. After that, treat it like a playground: remove pages you do not need and re-add them anytime.
      </p>
    </div>

    <div className="account-overview__banner" role="note">
      <p><strong>Industry template first, manual control after.</strong> Sedifex starts with the most useful pages for a school, NGO, travel company, or shop. Every page is removable from the menu, so the workspace can stay simple.</p>
    </div>

    <div className="account-overview__form-grid">
      <label><span>Business template</span>
        <select
          value={draft.industry}
          disabled={!canEdit}
          onChange={event => applyIndustryTemplate(event.target.value as Industry)}
        >
          {INDUSTRY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <div className="account-overview__card" role="status">
        <strong>{selectedIndustry.label}</strong>
        <p className="account-overview__hint">{selectedIndustry.helper}</p>
        <p className="account-overview__hint"><strong>{moduleSummary(enabledModuleIds)}</strong></p>
      </div>
    </div>

    <div className="account-overview__website-sync-actions">
      <button type="button" className="button button--secondary" disabled={!canEdit} onClick={resetToTemplate}>Use recommended pages</button>
      <button type="button" className="button button--secondary" disabled={!canEdit} onClick={showAllPages}>Show all pages</button>
      <button type="button" className="button button--ghost" disabled={!canEdit} onClick={hideAllPages}>Hide all pages</button>
    </div>

    <h3>Pages in the main menu</h3>
    <p className="account-overview__help-text">
      Tick the pages this workspace should show. Untick anything that is not useful now. Pages recommended for the selected industry are marked as recommended, but you can still remove them.
    </p>

    <div className="account-overview__toggle-list">
      {NAV_ITEMS.map(item => {
        const checked = moduleIsEnabled(draft.enabledModules, item.id)
        const recommended = enabledModulesByIndustry.has(item.id)
        return (
          <label key={item.id}>
            <input type="checkbox" disabled={!canEdit} checked={checked} onChange={() => toggleModule(item.id)} />
            <span>{item.label}</span>
            {recommended ? <span className="account-overview__hint"> Recommended</span> : null}
          </label>
        )
      })}
    </div>

    {error && <p className="account-overview__error-text">{error}</p>}
    {canEdit && <button type="button" className="button" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save navigation settings'}</button>}
  </section>
}
