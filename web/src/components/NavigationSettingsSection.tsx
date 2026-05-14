import React, { useEffect, useMemo, useState } from 'react'
import { NAV_ITEMS, type CustomNavItem, type Industry, type NavItemType, type NavRole } from '../config/navigation'
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

function makeId() { return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
function isValidExternalUrl(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch { return false }
}

export default function NavigationSettingsSection({ preferences, onSave, canEdit }: Props) {
  const [draft, setDraft] = useState(preferences)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<ValidationError>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  useEffect(() => setDraft(preferences), [preferences])

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
      labels.add(labelKey); routes.add(routeKey)
    }
    if (activePrimaryCount < 1) { setError('At least one primary navigation module must stay active.'); return }

    setError(null)
    setSaving(true)
    try { await onSave(draft) } finally { setSaving(false) }
  }

  const toggleModule = (id: string) => setDraft(current => {
    const enabled = current.enabledModules.includes(id)
      ? current.enabledModules.filter(item => item !== id)
      : [...current.enabledModules, id]
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
        <select value={draft.industry} disabled={!canEdit} onChange={e => setDraft(c => ({ ...c, industry: e.target.value as Industry }))}>
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
    <h3>Custom navigation</h3>
    <button type="button" className="button button--secondary" disabled={!canEdit} onClick={() => setDraft(c => ({ ...c, customNavItems: [...c.customNavItems, { id: makeId(), label: '', type: 'internal', target: '', roles_allowed: ['owner'], sort_order: c.customNavItems.length + 1 }] }))}>Add item</button>
    <div className="account-overview__custom-nav-list">
      {draft.customNavItems.map((item, index) => <div key={item.id} draggable={canEdit} onDragStart={() => setDragId(item.id)} onDragOver={e => e.preventDefault()} onDrop={() => {
        if (!dragId || dragId === item.id) return
        setDraft(c => {
          const items = [...c.customNavItems]
          const from = items.findIndex(i => i.id === dragId)
          const to = items.findIndex(i => i.id === item.id)
          const [moved] = items.splice(from, 1)
          items.splice(to, 0, moved)
          return { ...c, customNavItems: items.map((it, idx) => ({ ...it, sort_order: idx + 1 })) }
        })
      }}>
        <input placeholder="Label" value={item.label} disabled={!canEdit} onChange={e => updateItem(item.id, { label: e.target.value })} />
        <select value={item.type} disabled={!canEdit} onChange={e => updateItem(item.id, { type: e.target.value as NavItemType })}><option value="module">module</option><option value="internal">internal</option><option value="external">external</option></select>
        <input placeholder={item.type === 'external' ? 'https://example.com' : '/route'} value={item.target} disabled={!canEdit} onChange={e => updateItem(item.id, { target: e.target.value })} />
        <input placeholder="Icon (optional)" disabled />
        <label><input type="checkbox" checked={item.roles_allowed.includes('owner')} disabled={!canEdit} onChange={() => updateItem(item.id, { roles_allowed: item.roles_allowed.includes('owner') ? item.roles_allowed.filter(r => r !== 'owner') as NavRole[] : [...item.roles_allowed, 'owner'] })} />Owner</label>
        <label><input type="checkbox" checked={item.roles_allowed.includes('staff')} disabled={!canEdit} onChange={() => updateItem(item.id, { roles_allowed: item.roles_allowed.includes('staff') ? item.roles_allowed.filter(r => r !== 'staff') as NavRole[] : [...item.roles_allowed, 'staff'] })} />Staff</label>
        <label><input type="checkbox" checked disabled />Enabled</label>
        <button type="button" className="button button--ghost" disabled={!canEdit} onClick={() => setDraft(c => ({ ...c, customNavItems: c.customNavItems.filter(nav => nav.id !== item.id) }))}>Remove</button>
      </div>)}
    </div>
    {error && <p className="account-overview__error-text">{error}</p>}
    {canEdit && <button type="button" className="button" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save navigation settings'}</button>}
  </section>
}
