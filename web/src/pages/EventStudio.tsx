import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addDoc, collection, doc, getDoc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import './EventStudio.css'
import { copyStudioGrid, pasteStudioGrid, repositionStudioRow, studioOverview } from '../utils/eventStudioGrid'

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
const EVENT_TEMPLATES = [
  { id: 'blank', label: 'Blank event', detail: 'Start with empty sheets', tools: [] as ToolId[], tasks: [] as string[] },
  { id: 'wedding', label: 'Wedding', detail: 'Ceremony, guests and vendors', tools: ['checklist', 'production', 'programme', 'budget', 'guests', 'vendors'] as ToolId[], tasks: ['Confirm venue', 'Prepare guest invitations', 'Confirm suppliers'] },
  { id: 'funeral', label: 'Funeral', detail: 'Service and family coordination', tools: ['checklist', 'programme', 'production', 'guests', 'budget'] as ToolId[], tasks: ['Confirm service venue', 'Agree programme with family', 'Coordinate transport'] },
  { id: 'church', label: 'Church event', detail: 'Worship, programme and volunteers', tools: ['checklist', 'programme', 'production', 'donations', 'budget'] as ToolId[], tasks: ['Confirm event leaders', 'Prepare order of service', 'Test sound equipment'] },
  { id: 'conference', label: 'Conference', detail: 'Speakers, venue and production', tools: ['checklist', 'production', 'programme', 'guests', 'vendors', 'budget'] as ToolId[], tasks: ['Confirm speakers', 'Arrange registration desk', 'Test presentation equipment'] },
  { id: 'birthday', label: 'Birthday', detail: 'Guests, gifts and schedule', tools: ['checklist', 'programme', 'guests', 'gifts', 'budget'] as ToolId[], tasks: ['Confirm location', 'Plan entertainment', 'Send invitations'] },
  { id: 'fundraising', label: 'Fundraising', detail: 'Donations, pledges and guests', tools: ['checklist', 'programme', 'donations', 'guests', 'budget'] as ToolId[], tasks: ['Set fundraising target', 'Contact potential donors', 'Prepare programme'] },
] as const
type TemplateId = typeof EVENT_TEMPLATES[number]['id']
const TOOL_IDS = new Set<string>(TOOLS.map(tool => tool.id))
const createId = () => `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
const number = (value: unknown) => { const n = Number(value); return Number.isFinite(n) ? n : 0 }
const money = (value: number) => `GHS ${value.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const isMoneyField = (key: string) => ['cost', 'pledged', 'received', 'balance', 'value', 'estimate', 'actual', 'difference', 'quoted', 'paid'].includes(key)

function emptyStudio(): Studio {
  return { selected: [...DEFAULT_SELECTED], sheets: Object.fromEntries(TOOLS.map(tool => [tool.id, []])) as Studio['sheets'] }
}

function studioFromTemplate(id: TemplateId): Studio {
  const studio = emptyStudio()
  const template = EVENT_TEMPLATES.find(item => item.id === id) ?? EVENT_TEMPLATES[0]
  studio.selected = [...template.tools]
  studio.sheets.checklist = template.tasks.map(task => ({
    ...makeRow(TOOLS[0]), task, status: 'Not started',
  }))
  return studio
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
  const [templateId, setTemplateId] = useState<TemplateId>('blank')
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
        title: title.trim(), eventDate, eventType: EVENT_TEMPLATES.find(item => item.id === templateId)?.label ?? 'Event', eventCode: `EVT-${Date.now().toString(36).toUpperCase()}`,
        clientName: '', clientPhone: '', clientEmail: '', startTime: '', venue: '', guestCount: 0,
        planningPackage: 'full_planning', complexity: 'standard', estimatedBudget: null,
        status: 'new', progress: 0, notes: '',
        clientBrief: { requirements: '', themeColours: '', venueRequirements: '', catering: '', decor: '', entertainment: '', photography: '', transport: '', accommodation: '', specialInstructions: '', packageItems: [] },
        eventStudio: studioFromTemplate(templateId), createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
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
          <p>Give the event a name, then choose a starter template. Everything remains editable.</p>
          <label>Event name<input required maxLength={140} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Annual fundraising dinner" /></label>
          <label>Event date <span className="event-studio__optional">(optional)</span><input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} /></label>
          <fieldset className="event-studio__template-picker"><legend>Start with a template</legend>
            <div className="event-studio__template-grid">{EVENT_TEMPLATES.map(item => (
              <label key={item.id} className={templateId === item.id ? 'is-selected' : ''}>
                <input type="radio" name="event-template" value={item.id} checked={templateId === item.id} onChange={() => setTemplateId(item.id)} />
                <strong>{item.label}</strong><small>{item.detail}</small>
              </label>
            ))}</div>
          </fieldset>
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
  const [active, setActive] = useState<ToolId | 'overview'>('checklist')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [nameError, setNameError] = useState('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [showToolPicker, setShowToolPicker] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState('')
  const [sortDescending, setSortDescending] = useState(false)
  const [mobileCards, setMobileCards] = useState(false)
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  const [eventDate, setEventDate] = useState('')
  const [printMode, setPrintMode] = useState<'sheet' | 'programme'>('sheet')
  const [programmeStyle, setProgrammeStyle] = useState<'formal' | 'modern'>('formal')
  const [programmeLogo, setProgrammeLogo] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const undoHistory = useRef<Studio[]>([])
  const savedName = useRef('')
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
      const name = String(data.title || 'Untitled event')
      setEventName(name)
      setEventDate(typeof data.eventDate === 'string' ? data.eventDate : '')
      savedName.current = name
      setActive(next.selected[0] || 'checklist')
      setShowToolPicker(next.selected.length === 0)
      undoHistory.current = []
      setSaveStatus('saved')
      setLastSavedAt(null)
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
      if (revision.current === version) { setSaveStatus('saved'); setLastSavedAt(new Date()) }
    }).catch(() => {
      if (revision.current === version) setSaveStatus('error')
    })
  }, [storeId, eventId])

  useEffect(() => {
    if (!studio || saveStatus !== 'unsaved') return
    const timer = window.setTimeout(() => save(studio, revision.current), 1600)
    return () => window.clearTimeout(timer)
  }, [studio, saveStatus, save])

  function edit(next: Studio, keepHistory = true) {
    if (keepHistory && studio) undoHistory.current = [...undoHistory.current.slice(-19), studio]
    revision.current += 1
    setStudio(next)
    setSaveStatus('unsaved')
  }

  function undoChange() {
    const previous = undoHistory.current.pop()
    if (previous) {
      edit(previous, false)
      setSelectedRowId(null)
      setQuery('')
    }
  }

  async function saveName() {
    if (!storeId || !eventId) return
    const name = eventName.trim()
    if (!name) { setNameError('Event name is required.'); return }
    setNameError('')
    if (name === savedName.current) return
    try {
      await updateDoc(doc(db, 'stores', storeId, 'events', eventId), { title: name, updatedAt: serverTimestamp() })
      savedName.current = name
    } catch { setNameError('Could not save the event name. Please retry.'); }
  }

  useEffect(() => {
    if (saveStatus === 'saved') return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [saveStatus])

  useEffect(() => {
    if (!storeId || !eventId) return
    const key = `sedifex-studio-widths-${storeId}-${eventId}`
    try {
      const stored = localStorage.getItem(key)
      if (stored) setColumnWidths(JSON.parse(stored) as Record<string, number>)
    } catch { setColumnWidths({}) }
  }, [storeId, eventId])

  useEffect(() => {
    const reset = () => setPrintMode('sheet')
    window.addEventListener('afterprint', reset)
    return () => window.removeEventListener('afterprint', reset)
  }, [])

  function confirmLeave(event: React.MouseEvent<HTMLAnchorElement>) {
    if (saveStatus !== 'saved' && !window.confirm('Your spreadsheet has changes that may not be saved. Leave anyway?')) event.preventDefault()
  }

  function toggle(id: ToolId) {
    if (!studio) return
    const selected = studio.selected.includes(id) ? studio.selected.filter(item => item !== id) : [...studio.selected, id]
    edit({ ...studio, selected })
    if (selected.includes(id)) setActive(id)
    else if (active === id) setActive(selected[0] || 'checklist')
    setQuery('')
    setSelectedRowId(null)
  }

  function changeCell(rowId: string, key: string, value: Cell) {
    if (!studio || active === 'overview') return
    edit({ ...studio, sheets: { ...studio.sheets, [active]: studio.sheets[active].map(row => row.id === rowId ? { ...row, [key]: value } : row) } })
  }

  function addRow() {
    if (!studio || active === 'overview') return
    const tool = TOOLS.find(item => item.id === active)
    if (!tool) return
    const row = makeRow(tool)
    edit({ ...studio, sheets: { ...studio.sheets, [active]: [...studio.sheets[active], row] } })
    setSelectedRowId(row.id)
    setQuery('')
  }

  function removeRow(rowId: string) {
    if (!studio || active === 'overview' || !window.confirm('Remove this row from the sheet?')) return
    edit({ ...studio, sheets: { ...studio.sheets, [active]: studio.sheets[active].filter(row => row.id !== rowId) } })
    if (selectedRowId === rowId) setSelectedRowId(null)
  }

  function duplicateSelected() {
    if (!studio || active === 'overview' || !selectedRowId) return
    const index = studio.sheets[active].findIndex(row => row.id === selectedRowId)
    if (index < 0) return
    const copy = { ...studio.sheets[active][index], id: createId() }
    const nextRows = [...studio.sheets[active]]
    nextRows.splice(index + 1, 0, copy)
    edit({ ...studio, sheets: { ...studio.sheets, [active]: nextRows } })
    setSelectedRowId(copy.id)
    setQuery('')
  }

  function pasteCells(event: React.ClipboardEvent<HTMLInputElement>, rowId: string, key: string) {
    if (!studio || active === 'overview') return
    const text = event.clipboardData.getData('text/plain')
    if (!/[\t\n\r]/.test(text)) return
    const tool = TOOLS.find(item => item.id === active)
    if (!tool) return
    event.preventDefault()
    const result = pasteStudioGrid(studio.sheets[active], tool.fields, rowId, key, text, () => makeRow(tool))
    if (result.changed) {
      edit({ ...studio, sheets: { ...studio.sheets, [active]: result.rows } })
      setQuery('')
      setSortBy('')
      setActionMessage('Pasted spreadsheet cells. Review the imported values.')
    }
  }

  function insertAbove() {
    if (!studio || active === 'overview' || !selectedRowId) return
    const index = studio.sheets[active].findIndex(row => row.id === selectedRowId)
    const tool = TOOLS.find(item => item.id === active)
    if (index < 0 || !tool) return
    const newRow = makeRow(tool)
    const next = [...studio.sheets[active]]
    next.splice(index, 0, newRow)
    edit({ ...studio, sheets: { ...studio.sheets, [active]: next } })
    setSortBy('')
    setQuery('')
    setSelectedRowId(newRow.id)
  }

  function reorderRow(direction: -1 | 1) {
    if (!studio || active === 'overview' || !selectedRowId) return
    const next = repositionStudioRow(studio.sheets[active], selectedRowId, direction)
    if (next !== studio.sheets[active]) edit({ ...studio, sheets: { ...studio.sheets, [active]: next } })
    setSortBy('')
    setQuery('')
  }

  function resizeColumn(event: React.MouseEvent<HTMLSpanElement>, key: string, fallbackWidth: number) {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const id = `${active}:${key}`
    const base = columnWidths[id] || fallbackWidth
    let width = base
    const move = (e: MouseEvent) => {
      width = Math.max(105, Math.min(650, base + e.clientX - startX))
      setColumnWidths(previous => ({ ...previous, [id]: width }))
    }
    const stop = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', stop)
      if (!storeId || !eventId) return
      try {
        const storageKey = `sedifex-studio-widths-${storeId}-${eventId}`
        const saved = JSON.parse(localStorage.getItem(storageKey) || '{}') as Record<string, number>
        localStorage.setItem(storageKey, JSON.stringify({ ...saved, [id]: width }))
      } catch { /* Browser storage is optional. */ }
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', stop)
  }

  async function copySheet() {
    if (!current || !rows.length) return
    try {
      await navigator.clipboard.writeText(copyStudioGrid(rows, current.fields))
      setActionMessage('Sheet copied. Paste it into Excel or another spreadsheet.')
    } catch { setActionMessage('Clipboard access unavailable. Select and copy cells instead.') }
  }

  function printProgramme() {
    setPrintMode('programme')
    window.setTimeout(() => window.print(), 80)
  }

  function loadPrintLogo(file?: File) {
    if (!file) { setProgrammeLogo(''); return }
    if (!file.type.startsWith('image/') || file.size > 1024 * 1024) {
      setActionMessage('Choose a logo image smaller than 1 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setProgrammeLogo(typeof reader.result === 'string' ? reader.result : '')
    reader.readAsDataURL(file)
  }

  function moveDown(event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return
    const cell = event.currentTarget.closest('td')
    const row = event.currentTarget.closest('tr')
    const column = row && cell ? Array.from(row.children).indexOf(cell) : -1
    const next = column >= 0 ? row?.nextElementSibling?.children.item(column)?.querySelector('input, select') : null
    if (next instanceof HTMLElement) {
      event.preventDefault()
      next.focus()
      if (next instanceof HTMLInputElement && next.type === 'text') next.select()
    }
  }

  const selectedTools = useMemo(() => TOOLS.filter(tool => studio?.selected.includes(tool.id)), [studio?.selected])
  const current = selectedTools.find(tool => tool.id === active) || selectedTools[0]
  const rows = current && studio ? studio.sheets[current.id] : []
  const visibleRows = rows
    .filter(row => !query.trim() || Object.values(row).some(cell => String(cell).toLowerCase().includes(query.toLowerCase())))
    .sort((a, b) => {
      if (!sortBy) return 0
      const aValue = a[sortBy] ?? ''
      const bValue = b[sortBy] ?? ''
      const comparison = current?.fields.find(field => field.key === sortBy)?.type === 'number'
        ? number(aValue) - number(bValue)
        : String(aValue).localeCompare(String(bValue), undefined, { numeric: true })
      return sortDescending ? -comparison : comparison
    })
  const summary = current ? summarize(current, rows) : []
  const overview = studio ? studioOverview(studio.sheets) : null
  const sum = (key: string) => rows.reduce((total, row) => total + cellNumber(row, key), 0)

  if (storeLoading || loading) return <main className="event-studio workspace-page"><div className="event-studio__panel">Loading event workspace…</div></main>
  if (storeError || pageError || !studio || !current && studio.selected.length) {
    return <main className="event-studio workspace-page"><div className="event-studio__panel"><h1>Unable to open event</h1><p role="alert">{storeError || pageError || 'Workspace unavailable.'}</p><Link to="/event-planning">← Back to events</Link></div></main>
  }

  return (
    <main className={`event-studio event-studio--refined workspace-page${focusMode ? ' event-studio--focus' : ''}`}>
      <div className="event-studio__crumb"><Link to="/event-planning">← All events</Link><span>/</span><span>Event Studio</span></div>
      <header className="event-studio__workspace-bar">
        <div className="event-studio__workspace-identity">
          <span className="event-studio__eyebrow">EVENT WORKSPACE</span>
          <label className="event-studio__name event-studio__name--compact" htmlFor="event-studio-name">
            <span className="event-studio__sr-only">Event name</span>
            <input id="event-studio-name" value={eventName} maxLength={140} onChange={e => setEventName(e.target.value)} onBlur={() => void saveName()} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} aria-label="Event name" />
          </label>
          {nameError && <small className="event-studio__field-error" role="alert">{nameError}</small>}
        </div>
        <div className="event-studio__workspace-controls">
          <div className={`event-studio__save-state event-studio__save-state--${saveStatus}`} role="status" aria-live="polite">
            {saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Save failed' : 'Unsaved changes'}
            {(saveStatus === 'error' || saveStatus === 'unsaved') && <button type="button" onClick={() => save(studio, revision.current)}>Save now</button>}
          </div>
          <button type="button" className="event-studio__plain-button event-studio__focus-button" onClick={() => setFocusMode(value => !value)} aria-pressed={focusMode}>
            {focusMode ? '⊟ Exit full view' : '⛶ Full view'}
          </button>
        </div>
      </header>

      <section className="event-studio__panel event-studio__sheet-panel" aria-label="Event spreadsheets">
        <div className="event-studio__tabs-bar">
          <div className="event-studio__tabs" role="tablist" aria-label="Event planning sheets">
            {selectedTools.map(tool => (
              <button type="button" role="tab" aria-selected={current?.id === tool.id} key={tool.id}
                className={current?.id === tool.id ? 'is-active' : ''}
                onClick={() => { setActive(tool.id); setQuery(''); setSelectedRowId(null); setSortBy('') }}>{tool.name}</button>
            ))}
          </div>
          <button type="button" className="event-studio__add-tool-button" onClick={() => setShowToolPicker(value => !value)} aria-expanded={showToolPicker} aria-controls="event-studio-tool-picker">
            {showToolPicker ? 'Close tools' : '+ Add tool'}
          </button>
        </div>

        {(showToolPicker || selectedTools.length === 0) && (
          <div className="event-studio__tool-picker" id="event-studio-tool-picker">
            <div className="event-studio__tool-picker-head">
              <div><strong>Choose your tools</strong><p>Add only the sheets this event needs. Removing a tool hides it without deleting its rows.</p></div>
              <button type="button" className="event-studio__plain-button" onClick={() => setShowToolPicker(false)} disabled={selectedTools.length === 0}>Done choosing</button>
            </div>
            <div className="event-studio__tools">
              {TOOLS.map(tool => {
                const on = studio.selected.includes(tool.id)
                return <button type="button" key={tool.id} aria-pressed={on} className={`event-studio__tool ${on ? 'is-selected' : ''}`} onClick={() => toggle(tool.id)}>
                  <span className="event-studio__tool-icon" aria-hidden="true">{tool.icon}</span>
                  <strong>{tool.name}</strong>
                  <span className="event-studio__tool-desc">{tool.description}</span>
                  <span className="event-studio__tool-state">{on ? '✓ Included' : '+ Add sheet'}</span>
                </button>
              })}
            </div>
          </div>
        )}

        {current ? (
          <div className="event-studio__sheet-inner">
            <div className="event-studio__refined-heading">
              <div><h1>{current.name}</h1><p>{current.caption}</p></div>
              <span className="event-studio__sheet-count">{rows.length} {rows.length === 1 ? 'row' : 'rows'}</span>
            </div>
            <div className="event-studio__toolbar" role="toolbar" aria-label="Spreadsheet actions">
              <button type="button" className="event-studio__primary" onClick={addRow}>+ Add row</button>
              <button type="button" className="event-studio__plain-button" onClick={duplicateSelected} disabled={!selectedRowId || !rows.some(row => row.id === selectedRowId)}>⧉ Duplicate</button>
              <button type="button" className="event-studio__plain-button" onClick={undoChange} disabled={undoHistory.current.length === 0}>↶ Undo</button>
              <label className="event-studio__sort-label">Sort
                <select aria-label="Sort rows by" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                  <option value="">Original order</option>
                  {current.fields.filter(field => field.type !== 'computed').map(field => <option value={field.key} key={field.key}>{field.label}</option>)}
                </select>
              </label>
              <button type="button" className="event-studio__plain-button event-studio__sort-direction" aria-label="Reverse sort order" title="Reverse sort order" disabled={!sortBy} onClick={() => setSortDescending(value => !value)}>{sortDescending ? '↓' : '↑'}</button>
              <label className="event-studio__toolbar-search"><span className="event-studio__sr-only">Search sheet rows</span><input placeholder="⌕ Search sheet…" aria-label="Search sheet rows" value={query} onChange={e => setQuery(e.target.value)} /></label>
              <button type="button" className="event-studio__plain-button" onClick={() => window.print()}>⎙ Print</button>
            </div>
            <div className="event-studio__metrics event-studio__metrics--compact">
              {summary.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
            </div>
            <div className="event-studio__grid-scroll" role="region" aria-label={`${current.name} editable spreadsheet`} tabIndex={0}>
              <table className="event-studio__grid">
                <thead><tr><th scope="col" className="event-studio__number">#</th>{current.fields.map(field => <th scope="col" key={field.key} style={{ minWidth: field.width || 160 }}>{field.label}</th>)}<th scope="col" className="event-studio__number"><span className="event-studio__sr-only">Remove row</span></th></tr></thead>
                <tbody>
                  {visibleRows.length ? visibleRows.map(row => {
                    const rowNumber = rows.indexOf(row) + 1
                    return <tr key={row.id} className={row.id === selectedRowId ? 'event-studio__selected-row' : ''} onClick={() => setSelectedRowId(row.id)}>
                      <td className="event-studio__number">{rowNumber}</td>
                      {current.fields.map(field => <td key={field.key}>
                        {field.type === 'computed' ? <output className="event-studio__computed">{money(cellNumber(row, field.key))}</output> :
                          field.type === 'select' ? <select aria-label={`${field.label} row ${rowNumber}`} value={String(row[field.key] ?? '')} onKeyDown={moveDown} onFocus={() => setSelectedRowId(row.id)} onChange={e => changeCell(row.id, field.key, e.target.value)}>{field.options?.map(option => <option key={option} value={option}>{option}</option>)}</select> :
                          <input aria-label={`${field.label} row ${rowNumber}`} type={field.type} min={field.type === 'number' ? '0' : undefined} step={field.type === 'number' ? 'any' : undefined} value={row[field.key] ?? ''} onKeyDown={moveDown} onFocus={() => setSelectedRowId(row.id)} onChange={e => changeCell(row.id, field.key, e.target.value)} />}
                      </td>)}
                      <td className="event-studio__number"><button type="button" className="event-studio__remove" aria-label={`Remove row ${rowNumber}`} title="Remove row" onClick={() => removeRow(row.id)}>×</button></td>
                    </tr>
                  }) : <tr><td colSpan={current.fields.length + 2} className="event-studio__no-rows">{query ? 'No matching rows. Clear your search to see all records.' : 'This sheet is empty. Add a row to get started.'}</td></tr>}
                </tbody>
                <tfoot><tr><td className="event-studio__number">Σ</td>{current.fields.map((field, index) => <td key={field.key}>{field.type === 'number' || field.type === 'computed' ? (isMoneyField(field.key) ? money(sum(field.key)) : String(sum(field.key))) : index === 0 ? 'TOTAL' : ''}</td>)}<td /></tr></tfoot>
              </table>
            </div>
            <footer className="event-studio__sheet-footer">
              <span>Click a row to select · Enter moves down · Tab moves across · Scroll for more columns</span>
              <span>Edits save automatically</span>
            </footer>
          </div>
        ) : <div className="event-studio__blank">Choose your first tool above to open a spreadsheet.</div>}
      </section>
      <p className="event-studio__legacy-note">Need earlier event features? <Link to={`/event-planning/${encodeURIComponent(eventId)}/classic`}>Open the previous event workspace</Link>. Existing records are preserved.</p>
    </main>
  )
}
