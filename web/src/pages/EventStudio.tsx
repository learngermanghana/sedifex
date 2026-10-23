import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addDoc, collection, doc, getDoc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import './EventStudio.css'

type ToolId = 'checklist' | 'production' | 'programme' | 'donations' | 'gifts' | 'budget' | 'guests' | 'vendors'
type Cell = string | number
type SheetRow = { id: string; [key: string]: Cell }
type Studio = { selected: ToolId[]; sheets: Record<ToolId, SheetRow[]> }
type Field = { key: string; label: string; type: 'text' | 'date' | 'time' | 'number' | 'select' | 'computed'; options?: string[]; width?: number }
type Tool = { id: ToolId; name: string; icon: string; description: string; caption: string; fields: Field[] }

const TOOLS: Tool[] = [
  { id: 'checklist', name: 'Checklist', icon: '☑', description: 'Tasks, deadlines and who is responsible.', caption: 'Keep every task organised', fields: [
    { key: 'task', label: 'Task', type: 'text', width: 260 }, { key: 'owner', label: 'Assigned to', type: 'text', width: 160 },
    { key: 'due', label: 'Due date', type: 'date', width: 155 }, { key: 'status', label: 'Status', type: 'select', options: ['Not started', 'In progress', 'Done'], width: 160 },
    { key: 'cost', label: 'Est. cost (GHS)', type: 'number', width: 160 },
  ] },
  { id: 'production', name: 'Production Outline', icon: '▤', description: 'Stage cues, technical work and show order.', caption: 'The behind-the-scenes schedule', fields: [
    { key: 'start', label: 'Start time', type: 'time', width: 145 }, { key: 'segment', label: 'Production segment', type: 'text', width: 240 },
    { key: 'cue', label: 'Action / Technical cue', type: 'text', width: 275 }, { key: 'lead', label: 'Responsible team', type: 'text', width: 185 },
    { key: 'minutes', label: 'Duration (min)', type: 'number', width: 145 }, { key: 'status', label: 'Status', type: 'select', options: ['Planned', 'Ready', 'Complete'], width: 155 },
  ] },
  { id: 'programme', name: 'Guest Programme', icon: '≡', description: 'What guests see, in the correct order.', caption: 'The printed programme or order of events', fields: [
    { key: 'start', label: 'Time', type: 'time', width: 145 }, { key: 'item', label: 'Programme item', type: 'text', width: 260 },
    { key: 'person', label: 'Speaker / Performer', type: 'text', width: 205 }, { key: 'minutes', label: 'Duration (min)', type: 'number', width: 150 },
    { key: 'notes', label: 'Notes', type: 'text', width: 245 },
  ] },
  { id: 'donations', name: 'Donations & Pledges', icon: '♡', description: 'Track promised, received and outstanding funds.', caption: 'Record contributors and payments', fields: [
    { key: 'donor', label: 'Donor / Organisation', type: 'text', width: 235 },
    { key: 'pledged', label: 'Pledged (GHS)', type: 'number', width: 160 }, { key: 'received', label: 'Received (GHS)', type: 'number', width: 160 },
    { key: 'balance', label: 'Balance (GHS)', type: 'computed', width: 165 },
    { key: 'method', label: 'Payment method', type: 'select', options: ['Not specified', 'Mobile money', 'Bank transfer', 'Cash'], width: 170 },
    { key: 'notes', label: 'Notes', type: 'text', width: 220 },
  ] },
  { id: 'gifts', name: 'Gifts Register', icon: '◇', description: 'Log gifts, quantities and thank-you notes.', caption: 'Keep a record of gifts received', fields: [
    { key: 'giver', label: 'Given by', type: 'text', width: 210 }, { key: 'gift', label: 'Gift / Description', type: 'text', width: 250 },
    { key: 'qty', label: 'Quantity', type: 'number', width: 125 }, { key: 'value', label: 'Est. value (GHS)', type: 'number', width: 170 },
    { key: 'thanks', label: 'Thank-you sent', type: 'select', options: ['No', 'Yes'], width: 170 }, { key: 'notes', label: 'Notes', type: 'text', width: 220 },
  ] },
  { id: 'budget', name: 'Budget & Expenses', icon: '₵', description: 'Compare estimated costs with actual spending.', caption: 'Plan and monitor event costs', fields: [
    { key: 'item', label: 'Expense', type: 'text', width: 250 }, { key: 'category', label: 'Category', type: 'text', width: 190 },
    { key: 'estimate', label: 'Budgeted (GHS)', type: 'number', width: 170 }, { key: 'actual', label: 'Spent (GHS)', type: 'number', width: 160 },
    { key: 'difference', label: 'Remaining (GHS)', type: 'computed', width: 170 },
  ] },
  { id: 'guests', name: 'Guest List', icon: '♙', description: 'Invitations, RSVP and seating arrangements.', caption: 'Know who is coming', fields: [
    { key: 'name', label: 'Guest name', type: 'text', width: 235 }, { key: 'group', label: 'Group / Table', type: 'text', width: 190 },
    { key: 'contact', label: 'Contact', type: 'text', width: 195 }, { key: 'rsvp', label: 'RSVP', type: 'select', options: ['Pending', 'Confirmed', 'Declined'], width: 160 },
    { key: 'seats', label: 'Seats', type: 'number', width: 125 },
  ] },
  { id: 'vendors', name: 'Vendors & Suppliers', icon: '▣', description: 'Supplier details, services and payments.', caption: 'Manage service providers', fields: [
    { key: 'vendor', label: 'Supplier', type: 'text', width: 240 }, { key: 'service', label: 'Service', type: 'text', width: 235 },
    { key: 'contact', label: 'Contact', type: 'text', width: 190 }, { key: 'quoted', label: 'Quoted (GHS)', type: 'number', width: 165 },
    { key: 'paid', label: 'Paid (GHS)', type: 'number', width: 160 },
  ] },
]
const DEFAULT_SELECTED: ToolId[] = ['checklist', 'production', 'programme', 'donations', 'gifts']
const TOOL_IDS = new Set<string>(TOOLS.map(tool => tool.id))
const createId = () => `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
const number = (value: unknown) => { const n = Number(value); return Number.isFinite(n) ? n : 0 }
const money = (value: number) => `GHS ${value.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const isMoneyField = (key: string) => ['cost', 'pledged', 'received', 'balance', 'value', 'estimate', 'actual', 'difference', 'quoted', 'paid'].includes(key)

function emptyStudio(): Studio {
  return { selected: [...DEFAULT_SELECTED], sheets: Object.fromEntries(TOOLS.map(tool => [tool.id, []])) as Studio['sheets'] }
}

function readStudio(value: unknown): Studio {
  const base = emptyStudio()
  if (!value || typeof value !== 'object') return base
  const source = value as { selected?: unknown; sheets?: unknown }
  if (Array.isArray(source.selected)) {
    base.selected = [...new Set(source.selected.filter((id): id is ToolId => typeof id === 'string' && TOOL_IDS.has(id)))]
  }
  if (source.sheets && typeof source.sheets === 'object') {
    const sheetSource = source.sheets as Record<string, unknown>
    TOOLS.forEach(tool => {
      const incoming = sheetSource[tool.id]
      if (!Array.isArray(incoming)) return
      base.sheets[tool.id] = incoming.filter(row => row && typeof row === 'object').map((row, index) => {
        const values = row as Record<string, unknown>
        const clean: SheetRow = { id: typeof values.id === 'string' && values.id ? values.id : `legacy-${tool.id}-${index}` }
        tool.fields.filter(field => field.type !== 'computed').forEach(field => {
          const cell = values[field.key]
          clean[field.key] = typeof cell === 'number' || typeof cell === 'string' ? cell : ''
        })
        return clean
      })
    })
  }
  return base
}

function makeRow(tool: Tool): SheetRow {
  const row: SheetRow = { id: createId() }
  tool.fields.filter(field => field.type !== 'computed').forEach(field => {
    row[field.key] = field.type === 'select' ? field.options?.[0] || '' : ''
  })
  return row
}

function cellNumber(row: SheetRow, key: string): number {
  if (key === 'balance') return number(row.pledged) - number(row.received)
  if (key === 'difference') return number(row.estimate) - number(row.actual)
  return number(row[key])
}

function summarize(tool: Tool, rows: SheetRow[]): Array<[string, string]> {
  const total = (key: string) => rows.reduce((sum, row) => sum + cellNumber(row, key), 0)
  if (tool.id === 'checklist') return [['Total tasks', String(rows.length)], ['Completed', String(rows.filter(row => row.status === 'Done').length)], ['Estimated cost', money(total('cost'))]]
  if (tool.id === 'production' || tool.id === 'programme') return [['Programme items', String(rows.length)], ['Planned minutes', String(total('minutes'))], ['Hours', (total('minutes') / 60).toFixed(1)]]
  if (tool.id === 'donations') return [['Total pledged', money(total('pledged'))], ['Received', money(total('received'))], ['Outstanding', money(total('balance'))]]
  if (tool.id === 'gifts') return [['Gift records', String(rows.length)], ['Total quantity', String(total('qty'))], ['Estimated value', money(total('value'))]]
  if (tool.id === 'budget') return [['Planned', money(total('estimate'))], ['Spent', money(total('actual'))], ['Remaining', money(total('difference'))]]
  if (tool.id === 'guests') return [['Guest records', String(rows.length)], ['Confirmed', String(rows.filter(row => row.rsvp === 'Confirmed').length)], ['Total seats', String(total('seats'))]]
  return [['Suppliers', String(rows.length)], ['Total quoted', money(total('quoted'))], ['Paid', money(total('paid'))]]
}

type EventListItem = { id: string; title: string; eventDate: string; eventType: string; clientName: string }

export function EventStudioHome() {
  const { storeId, isLoading: storeLoading, error: storeError } = useActiveStore()
  const navigate = useNavigate()
  const [events, setEvents] = useState<EventListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (storeLoading) return
    if (!storeId) { setLoading(false); return }
    let active = true
    setLoading(true)
    getDocs(collection(db, 'stores', storeId, 'events')).then(snapshot => {
      if (!active) return
      setEvents(snapshot.docs.map(item => {
        const data = item.data()
        return { id: item.id, title: String(data.title || 'Untitled event'), eventDate: String(data.eventDate || ''), eventType: String(data.eventType || ''), clientName: String(data.clientName || '') }
      }).sort((a, b) => b.eventDate.localeCompare(a.eventDate)))
    }).catch(() => { if (active) setError('Could not load your events. Please refresh and try again.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [storeId, storeLoading])

  async function createEvent(submit: React.FormEvent) {
    submit.preventDefault()
    if (!storeId || !title.trim() || creating) return
    setCreating(true)
    setError('')
    try {
      const result = await addDoc(collection(db, 'stores', storeId, 'events'), {
        title: title.trim(), eventDate, eventType: 'Event', eventCode: `EVT-${Date.now().toString(36).toUpperCase()}`,
        clientName: '', clientPhone: '', clientEmail: '', startTime: '', venue: '', guestCount: 0,
        planningPackage: 'full_planning', complexity: 'standard', estimatedBudget: null,
        status: 'new', progress: 0, notes: '',
        clientBrief: { requirements: '', themeColours: '', venueRequirements: '', catering: '', decor: '', entertainment: '', photography: '', transport: '', accommodation: '', specialInstructions: '', packageItems: [] },
        eventStudio: emptyStudio(), createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      })
      navigate(`/event-planning/${encodeURIComponent(result.id)}`)
    } catch {
      setError('Could not create this event. Check your connection and try again.')
      setCreating(false)
    }
  }

  const visible = events.filter(event => [event.title, event.eventType, event.clientName].join(' ').toLowerCase().includes(search.toLowerCase()))
  return (
    <main className="event-studio workspace-page">
      <div className="event-studio__intro">
        <span className="event-studio__eyebrow">Sedifex · Event Studio</span>
        <h1>Make event planning simple.</h1>
        <p>Start with an event. Then pick just the planning tools you need and work in easy spreadsheet tabs.</p>
      </div>
      {(storeError || error) && <p className="event-studio__message event-studio__message--error" role="alert">{storeError || error}</p>}
      <section className="event-studio__home-grid">
        <form className="event-studio__panel event-studio__new-event" onSubmit={createEvent}>
          <span className="event-studio__step">STEP 01 — START HERE</span>
          <h2>Create an event</h2>
          <p>Only a name is required. Add more details whenever you are ready.</p>
          <label>Event name<input required maxLength={140} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Annual fundraising dinner" /></label>
          <label>Event date <span className="event-studio__optional">(optional)</span><input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} /></label>
          <button className="event-studio__primary" type="submit" disabled={creating || !title.trim() || !storeId}>{creating ? 'Creating…' : 'Create event & choose tools →'}</button>
        </form>
        <section className="event-studio__panel event-studio__recent">
          <div className="event-studio__section-head"><div><span className="event-studio__step">CONTINUE PLANNING</span><h2>Your events</h2></div><span className="event-studio__count">{events.length} events</span></div>
          <input aria-label="Search events" className="event-studio__search" placeholder="Search your events…" value={search} onChange={e => setSearch(e.target.value)} />
          <div className="event-studio__event-list">
            {loading ? <p className="event-studio__muted">Loading events…</p> : visible.length ? visible.map(event => (
              <Link key={event.id} className="event-studio__event-link" to={`/event-planning/${encodeURIComponent(event.id)}`}>
                <span><strong>{event.title}</strong><small>{event.eventDate || 'Date not set'}{event.clientName ? ` · ${event.clientName}` : ''}</small></span><span aria-hidden="true">→</span>
              </Link>
            )) : <div className="event-studio__empty-list">{events.length ? 'No matching events.' : 'Your new events will appear here.'}</div>}
          </div>
        </section>
      </section>
      <p className="event-studio__legacy-note">Need a tool from the earlier event system? <Link to="/event-planning/classic">Open the previous event management page</Link>. Existing records have not been deleted.</p>
    </main>
  )
}

type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error'

export function EventStudioWorkspace() {
  const { eventId = '' } = useParams()
  const { storeId, isLoading: storeLoading, error: storeError } = useActiveStore()
  const [eventName, setEventName] = useState('')
  const [studio, setStudio] = useState<Studio | null>(null)
  const [active, setActive] = useState<ToolId>('checklist')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [nameError, setNameError] = useState('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const revision = useRef(0)
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve())

  useEffect(() => {
    if (storeLoading) return
    if (!storeId || !eventId) { setLoading(false); setPageError('Choose an event to open its workspace.'); return }
    let mounted = true
    setLoading(true)
    setPageError('')
    getDoc(doc(db, 'stores', storeId, 'events', eventId)).then(snapshot => {
      if (!mounted) return
      if (!snapshot.exists()) { setPageError('This event could not be found.'); return }
      const data = snapshot.data()
      const next = readStudio(data.eventStudio)
      setStudio(next)
      setEventName(String(data.title || 'Untitled event'))
      setActive(next.selected[0] || 'checklist')
      setSaveStatus('saved')
    }).catch(() => { if (mounted) setPageError('Unable to load this event. Please retry.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [storeId, eventId, storeLoading])

  const save = useCallback((next: Studio, version: number) => {
    if (!storeId || !eventId) return
    setSaveStatus('saving')
    const request = writeQueue.current.catch(() => undefined).then(() =>
      updateDoc(doc(db, 'stores', storeId, 'events', eventId), { eventStudio: next, updatedAt: serverTimestamp() }))
    writeQueue.current = request
    void request.then(() => {
      if (revision.current === version) setSaveStatus('saved')
    }).catch(() => {
      if (revision.current === version) setSaveStatus('error')
    })
  }, [storeId, eventId])

  useEffect(() => {
    if (!studio || saveStatus !== 'unsaved') return
    const timer = window.setTimeout(() => save(studio, revision.current), 900)
    return () => window.clearTimeout(timer)
  }, [studio, saveStatus, save])

  function edit(next: Studio) {
    revision.current += 1
    setStudio(next)
    setSaveStatus('unsaved')
  }

  async function saveName() {
    if (!storeId || !eventId) return
    const name = eventName.trim()
    if (!name) { setNameError('Event name is required.'); return }
    setNameError('')
    try { await updateDoc(doc(db, 'stores', storeId, 'events', eventId), { title: name, updatedAt: serverTimestamp() }) }
    catch { setNameError('Could not save the event name. Please retry.'); }
  }

  function toggle(id: ToolId) {
    if (!studio) return
    const selected = studio.selected.includes(id) ? studio.selected.filter(item => item !== id) : [...studio.selected, id]
    edit({ ...studio, selected })
    if (selected.includes(id)) setActive(id)
    else if (active === id) setActive(selected[0] || 'checklist')
    setQuery('')
  }

  function changeCell(rowId: string, key: string, value: Cell) {
    if (!studio) return
    edit({ ...studio, sheets: { ...studio.sheets, [active]: studio.sheets[active].map(row => row.id === rowId ? { ...row, [key]: value } : row) } })
  }

  function addRow() {
    if (!studio) return
    const tool = TOOLS.find(item => item.id === active)
    if (!tool) return
    edit({ ...studio, sheets: { ...studio.sheets, [active]: [...studio.sheets[active], makeRow(tool)] } })
    setQuery('')
  }

  function removeRow(rowId: string) {
    if (!studio || !window.confirm('Remove this row from the sheet?')) return
    edit({ ...studio, sheets: { ...studio.sheets, [active]: studio.sheets[active].filter(row => row.id !== rowId) } })
  }

  const selectedTools = useMemo(() => TOOLS.filter(tool => studio?.selected.includes(tool.id)), [studio?.selected])
  const current = selectedTools.find(tool => tool.id === active) || selectedTools[0]
  const rows = current && studio ? studio.sheets[current.id] : []
  const visibleRows = rows.filter(row => !query.trim() || Object.values(row).some(cell => String(cell).toLowerCase().includes(query.toLowerCase())))
  const summary = current ? summarize(current, rows) : []
  const sum = (key: string) => rows.reduce((total, row) => total + cellNumber(row, key), 0)

  if (storeLoading || loading) return <main className="event-studio workspace-page"><div className="event-studio__panel">Loading event workspace…</div></main>
  if (storeError || pageError || !studio || !current && studio.selected.length) {
    return <main className="event-studio workspace-page"><div className="event-studio__panel"><h1>Unable to open event</h1><p role="alert">{storeError || pageError || 'Workspace unavailable.'}</p><Link to="/event-planning">← Back to events</Link></div></main>
  }

  return (
    <main className="event-studio workspace-page">
      <div className="event-studio__crumb"><Link to="/event-planning">← All events</Link><span>/</span><span>Event Studio</span></div>
      <header className="event-studio__intro event-studio__workspace-intro">
        <div><span className="event-studio__eyebrow">Sedifex · Event Studio</span><h1>Build your event workspace.</h1><p>Choose only what you need. Every selected tool becomes a spreadsheet.</p></div>
        <div className="event-studio__name"><label htmlFor="event-studio-name">Event name</label><input id="event-studio-name" value={eventName} maxLength={140} onChange={e => setEventName(e.target.value)} onBlur={() => void saveName()} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />{nameError && <small role="alert">{nameError}</small>}</div>
      </header>

      <section className="event-studio__panel event-studio__playground" aria-labelledby="event-tools-title">
        <div className="event-studio__section-head"><div><span className="event-studio__step">STEP 01 — YOUR PLAYGROUND</span><h2 id="event-tools-title">What would you like to plan?</h2><p>Click a card to add or hide its sheet. Hidden sheets keep their existing rows.</p></div><span className="event-studio__count">{studio.selected.length} selected</span></div>
        <div className="event-studio__tools">
          {TOOLS.map(tool => { const on = studio.selected.includes(tool.id); return (
            <button type="button" key={tool.id} aria-pressed={on} className={`event-studio__tool ${on ? 'is-selected' : ''}`} onClick={() => toggle(tool.id)}>
              <span className="event-studio__tool-icon" aria-hidden="true">{tool.icon}</span>
              <strong>{tool.name}</strong><span className="event-studio__tool-desc">{tool.description}</span>
              <span className="event-studio__tool-state">{on ? '✓ Added to workspace' : '+ Add to workspace'}</span>
            </button>
          ) })}
        </div>
      </section>

      <section className="event-studio__sheets" aria-labelledby="event-sheets-title">
        <div className="event-studio__section-head event-studio__sheets-heading"><div><span className="event-studio__step">STEP 02 — YOUR SPREADSHEETS</span><h2 id="event-sheets-title">Your Event Workspace</h2></div>
          <div className={`event-studio__save-state event-studio__save-state--${saveStatus}`} role="status" aria-live="polite">
            {saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Save failed — retry' : 'Unsaved changes'}
            {(saveStatus === 'error' || saveStatus === 'unsaved') && <button type="button" onClick={() => studio && save(studio, revision.current)}>Save now</button>}
          </div>
        </div>
        <div className="event-studio__panel event-studio__sheet-panel">
          {selectedTools.length ? <>
            <div className="event-studio__tabs" role="tablist" aria-label="Event planning sheets">
              {selectedTools.map(tool => <button type="button" role="tab" aria-selected={current?.id === tool.id} key={tool.id} className={current?.id === tool.id ? 'is-active' : ''} onClick={() => { setActive(tool.id); setQuery('') }}>{tool.name}</button>)}
            </div>
            {current && <div className="event-studio__sheet-inner">
              <div className="event-studio__sheet-heading"><div><h3>{current.name}</h3><p>{current.caption}</p></div><div className="event-studio__sheet-actions"><input aria-label="Search sheet rows" placeholder="Search rows…" value={query} onChange={e => setQuery(e.target.value)} /><button type="button" className="event-studio__primary" onClick={addRow}>+ Add row</button></div></div>
              <div className="event-studio__metrics">{summary.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
              <div className="event-studio__grid-scroll" role="region" aria-label={`${current.name} editable spreadsheet`} tabIndex={0}>
                <table className="event-studio__grid"><thead><tr><th scope="col" className="event-studio__number">#</th>{current.fields.map(field => <th scope="col" key={field.key} style={{ minWidth: field.width || 160 }}>{field.label}</th>)}<th scope="col" className="event-studio__number"><span className="event-studio__sr-only">Remove row</span></th></tr></thead>
                  <tbody>
                    {visibleRows.length ? visibleRows.map(row => <tr key={row.id}>
                      <td className="event-studio__number">{rows.indexOf(row) + 1}</td>
                      {current.fields.map(field => <td key={field.key}>
                        {field.type === 'computed' ? <output className="event-studio__computed">{money(cellNumber(row, field.key))}</output> :
                        field.type === 'select' ? <select aria-label={`${field.label} row ${rows.indexOf(row) + 1}`} value={String(row[field.key] ?? '')} onChange={e => changeCell(row.id, field.key, e.target.value)}>{field.options?.map(option => <option key={option} value={option}>{option}</option>)}</select> :
                        <input aria-label={`${field.label} row ${rows.indexOf(row) + 1}`} type={field.type} min={field.type === 'number' ? '0' : undefined} step={field.type === 'number' ? 'any' : undefined} value={row[field.key] ?? ''} onChange={e => changeCell(row.id, field.key, e.target.value)} />}
                      </td>)}
                      <td className="event-studio__number"><button type="button" className="event-studio__remove" aria-label={`Remove row ${rows.indexOf(row) + 1}`} title="Remove row" onClick={() => removeRow(row.id)}>×</button></td>
                    </tr>) : <tr><td colSpan={current.fields.length + 2} className="event-studio__no-rows">{query ? 'No matching rows.' : 'Your sheet is empty. Click “Add row” to get started.'}</td></tr>}
                  </tbody>
                  <tfoot><tr><td className="event-studio__number">Σ</td>{current.fields.map((field, index) => <td key={field.key}>{field.type === 'number' || field.type === 'computed' ? (isMoneyField(field.key) ? money(sum(field.key)) : String(sum(field.key))) : index === 0 ? 'TOTAL' : ''}</td>)}<td /></tr></tfoot>
                </table>
              </div>
              <div className="event-studio__sheet-footer"><span>Scroll sideways for more columns · Edit any cell · Totals update automatically</span><span>Changes save to this event</span></div>
            </div>}
          </> : <div className="event-studio__blank">Select a tool above to create your first spreadsheet.</div>}
        </div>
      </section>
      <p className="event-studio__legacy-note">Previously saved event details and specialist tools are still available in the <Link to={`/event-planning/${encodeURIComponent(eventId)}/classic`}>previous event workspace</Link>. The new sheets do not overwrite those records.</p>
    </main>
  )
}
