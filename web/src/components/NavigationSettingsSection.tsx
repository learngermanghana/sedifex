import React, { useEffect, useMemo, useState } from 'react'
import { INDUSTRY_ENABLED_MODULE_PRESETS, NAV_ITEMS, type CustomNavItem, type Industry, type NavRole } from '../config/navigation'
import type { StorePreferences } from '../hooks/useStorePreferences'

type Props = {
  preferences: StorePreferences['navigation']
  onSave: (navigation: StorePreferences['navigation']) => Promise<void>
  canEdit: boolean
}

type ValidationError = string | null

const INDUSTRY_OPTIONS: Array<{ value: Industry; label: string; helper: string }> = [
  { value: 'shop', label: 'Retail / Shop', helper: 'Best for inventory, sales, customers, online orders, and payouts.' },
  { value: 'travel', label: 'Travel', helper: 'Best for trips, bookings, travelers, events, and customer follow-up.' },
  { value: 'ngo', label: 'NGO', helper: 'Best for donors, volunteers, campaigns, funds, and support requests.' },
  { value: 'school', label: 'School', helper: 'Best for courses, students, registrations, classes, and payments.' },
]

function isValidExternalUrl(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch { return false }
}

function normalizeInternalTarget(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function makeCustomNavId(label: string) {
  const slug = label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'custom-link'
  return `${slug}-${Date.now()}`
}

export default function NavigationSettingsSection({ preferences, onSave, canEdit }: Props) {
  const [draft, setDraft] = useState({
    ...preferences,
    enabledModules: Array.isArray(preferences.enabledModules) ? preferences.enabledModules : [],
    customNavItems: Array.isArray(preferences.customNavItems) ? preferences.customNavItems : [],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<ValidationError>(null)
  const [newLabel, setNewLabel] = useState('')
  const [newType, setNewType] = useState<'internal' | 'external'>('internal')
  const [newTarget, setNewTarget] = useState('')

  useEffect(() => {
    setDraft({
      ...preferences,
      enabledModules: Array.isArray(preferences.enabledModules) ? preferences.enabledModules : [],
      customNavItems: Array.isArray(preferences.customNavItems) ? preferences.customNavItems : [],
    })
  }, [preferences])

  const selectedIndustry = INDUSTRY_OPTIONS.find(option => option.value === draft.industry) ?? INDUSTRY_OPTIONS[0]

  const activePrimaryCount = useMemo(() => {
    const enabled = draft.enabledModules
    return NAV_ITEMS.filter(item => item.type === 'module').filter(item => enabled.length === 0 || enabled.includes(item.id)).length
  }, [draft.enabledModules])

  const save = async () => {
    const labels = new Set<string>()
    const routes = new Set<string>()
    for (const item of draft.customNavItems) {
      const labelKey = item.label.trim().toLowerCase()
      const routeKey = item.target.trim().toLowerCase()
      if (!labelKey || !routeKey) { setError('Custom navigation labels and links cannot be empty.'); return }
      if (labels.has(labelKey)) { setError('Duplicate custom navigation labels are not allowed.'); return }
      if (routes.has(routeKey)) { setError('Duplicate custom navigation routes/URLs are not allowed.'); return }
      if (item.type === 'external' && !isValidExternalUrl(item.target)) { setError(`External URL is invalid for "${item.label}".`); return }
      if (item.type !== 'external' && !item.target.startsWith('/')) { setError(`Internal link for "${item.label}" must start with /.`); return }
      if (item.roles_allowed.length < 1) { setError(`Select at least one role for "${item.label || 'custom navigation item'}".`); return }
      labels.add(labelKey); routes.add(routeKey)
    }
    if (activePrimaryCount < 1) { setError('At least one primary navigation item must stay active.'); return }

    setError(null)
    setSaving(true)
    try { await onSave(draft) } finally { setSaving(false) }
  }

  const toggleModule = (id: string) => setDraft(current => {
    const currentEnabled = current.enabledModules.length === 0
      ? NAV_ITEMS.map(item => item.id)
      : current.enabledModules
    const enabled = currentEnabled.includes(id)
      ? currentEnabled.filter(item => item !== id)
      : [...currentEnabled, id]
    return { ...current, enabledModules: enabled }
  })

  const updateItem = (id: string, patch: Partial<CustomNavItem>) => setDraft(current => ({
    ...current,
    customNavItems: current.customNavItems.map(item => item.id === id ? { ...item, ...patch } : item),
  }))

  const removeCustomItem = (id: string) => setDraft(current => ({
    ...current,
    customNavItems: current.customNavItems.filter(item => item.id !== id),
  }))

  const addCustomItem = () => {
    const label = newLabel.trim()
    const target = newType === 'external' ? newTarget.trim() : normalizeInternalTarget(newTarget)
    if (!label || !target) {
      setError('Enter a label and link before adding a navigation item.')
      return
    }
    if (newType === 'external' && !isValidExternalUrl(target)) {
      setError('External links must start with https:// or http://.')
      return
    }
    const nextItem: CustomNavItem = {
      id: makeCustomNavId(label),
      label,
      type: newType,
      target,
      roles_allowed: ['owner', 'staff'],
      sort_order: 200 + draft.customNavItems.length,
    }
    setDraft(current => ({ ...current, customNavItems: [...current.customNavItems, nextItem] }))
    setNewLabel('')
    setNewTarget('')
    setNewType('internal')
    setError(null)
  }

  return <section aria-labelledby="account-nav-settings" className="account-overview__nav-settings">
    <div className="account-overview__section-header">
      <h2 id="account-nav-settings">Navigation settings</h2>
      <p className="account-overview__subtitle">
        Sedifex gives you a ready-made menu template. Choose the template that fits your business, then hide pages you do not need or add simple links for your team.
      </p>
    </div>

    <div className="account-overview__banner" role="note">
      <p><strong>This is not technical setup.</strong> It only controls what appears in your left menu. You can change it anytime as your business grows.</p>
    </div>

    <div className="account-overview__form-grid">
      <label><span>Business template</span>
        <select
          value={draft.industry}
          disabled={!canEdit}
          onChange={e => {
            const industry = e.target.value as Industry
            setDraft(c => ({ ...c, industry, enabledModules: INDUSTRY_ENABLED_MODULE_PRESETS[industry] }))
          }}
        >
          {INDUSTRY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <div className="account-overview__card" role="status">
        <strong>{selectedIndustry.label}</strong>
        <p className="account-overview__hint">{selectedIndustry.helper}</p>
      </div>
    </div>

    <h3>Show or hide menu items</h3>
    <p className="account-overview__help-text">
      Tick the pages your business needs. Untick pages you do not use. For example, a school may keep Students and Upcoming classes, while an NGO may keep Volunteers, Funds ledger, and Support requests.
    </p>
    <div className="account-overview__toggle-list">
      {NAV_ITEMS.map(item => (
        <label key={item.id}><input type="checkbox" disabled={!canEdit} checked={draft.enabledModules.length === 0 || draft.enabledModules.includes(item.id)} onChange={() => toggleModule(item.id)} /> {item.label}</label>
      ))}
    </div>

    <h3>Add extra menu links</h3>
    <p className="account-overview__help-text">
      Use this when you want a quick link to another Sedifex page, a Google Form, WhatsApp group, website page, or any other tool your team uses.
    </p>
    {canEdit ? (
      <div className="account-overview__website-sync-test">
        <label>
          <span>Menu label</span>
          <input value={newLabel} onChange={event => setNewLabel(event.target.value)} placeholder="e.g. Volunteer form" />
        </label>
        <label>
          <span>Link type</span>
          <select value={newType} onChange={event => setNewType(event.target.value === 'external' ? 'external' : 'internal')}>
            <option value="internal">Sedifex page</option>
            <option value="external">External link</option>
          </select>
        </label>
        <label>
          <span>Link</span>
          <input value={newTarget} onChange={event => setNewTarget(event.target.value)} placeholder={newType === 'external' ? 'https://example.com/form' : '/volunteers'} />
        </label>
        <button type="button" className="button button--secondary" onClick={addCustomItem}>Add menu link</button>
      </div>
    ) : null}

    <div className="account-overview__custom-nav-list">
      {draft.customNavItems.length === 0 ? <p className="account-overview__help-text">No extra menu links are configured yet.</p> : null}
      {draft.customNavItems.map((item) => <div key={item.id} className="account-overview__integration-key-item">
        <div>
          <strong>{item.label || item.target || 'Custom navigation item'}</strong>
          <p className="account-overview__hint">{item.type === 'external' ? 'External link' : 'Sedifex page'} · {item.target}</p>
        </div>
        <div className="account-overview__website-sync-actions">
          <label><input type="checkbox" checked={item.roles_allowed.includes('owner')} disabled={!canEdit} onChange={() => updateItem(item.id, { roles_allowed: item.roles_allowed.includes('owner') ? item.roles_allowed.filter(r => r !== 'owner') as NavRole[] : [...item.roles_allowed, 'owner'] })} />Owner</label>
          <label><input type="checkbox" checked={item.roles_allowed.includes('staff')} disabled={!canEdit} onChange={() => updateItem(item.id, { roles_allowed: item.roles_allowed.includes('staff') ? item.roles_allowed.filter(r => r !== 'staff') as NavRole[] : [...item.roles_allowed, 'staff'] })} />Staff</label>
          {canEdit ? <button type="button" className="button button--ghost" onClick={() => removeCustomItem(item.id)}>Remove</button> : null}
        </div>
      </div>)}
    </div>
    {error && <p className="account-overview__error-text">{error}</p>}
    {canEdit && <button type="button" className="button" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save navigation settings'}</button>}
  </section>
}
