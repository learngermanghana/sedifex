import React, { useEffect, useMemo, useState } from 'react'
import { INDUSTRY_ENABLED_MODULE_PRESETS, NAV_ITEMS, type CustomNavItem, type Industry, type NavRole } from '../config/navigation'
import type { StorePreferences } from '../hooks/useStorePreferences'

type Props = {
  preferences: StorePreferences['navigation']
  onSave: (navigation: StorePreferences['navigation']) => Promise<void>
  canEdit: boolean
}

type ValidationError = string | null

const INDUSTRY_OPTIONS: Array<{ value: Industry; label: string }> = [
  { value: 'shop', label: 'Retail / Shop' },
  { value: 'travel', label: 'Travel' },
  { value: 'ngo', label: 'NGO' },
  { value: 'school', label: 'School' },
]

function isValidExternalUrl(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch { return false }
}

export default function NavigationSettingsSection({ preferences, onSave, canEdit }: Props) {
  const [draft, setDraft] = useState({
    ...preferences,
    enabledModules: Array.isArray(preferences.enabledModules) ? preferences.enabledModules : [],
    customNavItems: Array.isArray(preferences.customNavItems) ? preferences.customNavItems : [],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<ValidationError>(null)

  useEffect(() => {
    setDraft({
      ...preferences,
      enabledModules: Array.isArray(preferences.enabledModules) ? preferences.enabledModules : [],
      customNavItems: Array.isArray(preferences.customNavItems) ? preferences.customNavItems : [],
    })
  }, [preferences])

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
      if (!labelKey || !routeKey) { setError('Custom navigation labels and targets cannot be empty.'); return }
      if (labels.has(labelKey)) { setError('Duplicate custom navigation labels are not allowed.'); return }
      if (routes.has(routeKey)) { setError('Duplicate custom navigation routes/URLs are not allowed.'); return }
      if (item.type === 'external' && !isValidExternalUrl(item.target)) { setError(`External URL is invalid for "${item.label}".`); return }
      if (item.roles_allowed.length < 1) { setError(`Select at least one role for "${item.label || 'custom navigation item'}".`); return }
      labels.add(labelKey); routes.add(routeKey)
    }
    if (activePrimaryCount < 1) { setError('At least one primary navigation module must stay active.'); return }

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

  return <section aria-labelledby="account-nav-settings" className="account-overview__nav-settings">
    <div className="account-overview__section-header"><h2 id="account-nav-settings">Navigation settings</h2></div>
    <div className="account-overview__form-grid">
      <label><span>Industry profile</span>
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
    </div>
    <h3>Enabled modules</h3>
    <div className="account-overview__toggle-list">
      {NAV_ITEMS.map(item => (
        <label key={item.id}><input type="checkbox" disabled={!canEdit} checked={draft.enabledModules.length === 0 || draft.enabledModules.includes(item.id)} onChange={() => toggleModule(item.id)} /> {item.label}</label>
      ))}
    </div>
    <h3>Custom navigation access</h3>
    <p className="account-overview__help-text">
      Only access levels are editable here. Labels, routes, and link types use site defaults.
    </p>
    <div className="account-overview__custom-nav-list">
      {draft.customNavItems.length === 0 ? <p className="account-overview__help-text">No custom navigation links are configured yet.</p> : null}
      {draft.customNavItems.map((item) => <div key={item.id}>
        <strong>{item.label || item.target || 'Custom navigation item'}</strong>
        <label><input type="checkbox" checked={item.roles_allowed.includes('owner')} disabled={!canEdit} onChange={() => updateItem(item.id, { roles_allowed: item.roles_allowed.includes('owner') ? item.roles_allowed.filter(r => r !== 'owner') as NavRole[] : [...item.roles_allowed, 'owner'] })} />Owner</label>
        <label><input type="checkbox" checked={item.roles_allowed.includes('staff')} disabled={!canEdit} onChange={() => updateItem(item.id, { roles_allowed: item.roles_allowed.includes('staff') ? item.roles_allowed.filter(r => r !== 'staff') as NavRole[] : [...item.roles_allowed, 'staff'] })} />Staff</label>
      </div>)}
    </div>
    {error && <p className="account-overview__error-text">{error}</p>}
    {canEdit && <button type="button" className="button" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save navigation settings'}</button>}
  </section>
}
