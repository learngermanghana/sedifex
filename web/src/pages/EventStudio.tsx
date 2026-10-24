import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addDoc, collection, doc, getDoc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import './EventStudio.css'
import { copyStudioGrid, pasteStudioGrid, repositionStudioRow, dropStudioRow, studioOverview } from '../utils/eventStudioGrid'

type EventDetails = {
  eventDate: string; startTime: string; venue: string; clientName: string; clientPhone: string;
  clientEmail: string; eventStudioCoordinator: string; notes: string
}
const DETAILS_FIELDS: Array<{ key: keyof EventDetails; label: string; type?: string; placeholder?: string }> = [
  { key: 'eventDate', label: 'Event date', type: 'date' },
  { key: 'startTime', label: 'Start time', type: 'time' },
  { key: 'venue', label: 'Venue', placeholder: 'Venue / location' },
  { key: 'clientName', label: 'Client name' },
  { key: 'clientPhone', label: 'Client phone', type: 'tel' },
  { key: 'clientEmail', label: 'Client email', type: 'email' },
  { key: 'eventStudioCoordinator', label: 'Event coordinator' },
]
function readEventDetails(data: Record<string, unknown>): EventDetails {
  const result = {} as EventDetails
  for (const key of [...DETAILS_FIELDS.map(field => field.key), 'notes' as const]) {
    result[key] = typeof data[key] === 'string' ? String(data[key]) : ''
  }
  return result
}

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
  { id: 'blank', label: 'Blank event', eventType: 'Other', detail: 'Start with empty sheets', tools: [] as ToolId[], tasks: [] as string[] },
  { id: 'wedding', label: 'Wedding', eventType: 'Traditional wedding', detail: 'Ceremony, guests and vendors', tools: ['checklist', 'production', 'programme', 'budget', 'guests', 'vendors'] as ToolId[], tasks: ['Confirm venue', 'Prepare guest invitations', 'Confirm suppliers'] },
  { id: 'funeral', label: 'Funeral', eventType: 'Funeral', detail: 'Service and family coordination', tools: ['checklist', 'programme', 'production', 'guests', 'budget'] as ToolId[], tasks: ['Confirm service venue', 'Agree programme with family', 'Coordinate transport'] },
  { id: 'church', label: 'Church event', eventType: 'Church / religious event', detail: 'Worship, programme and volunteers', tools: ['checklist', 'programme', 'production', 'donations', 'budget'] as ToolId[], tasks: ['Confirm event leaders', 'Prepare order of service', 'Test sound equipment'] },
  { id: 'conference', label: 'Conference', eventType: 'Conference / seminar', detail: 'Speakers, venue and production', tools: ['checklist', 'production', 'programme', 'guests', 'vendors', 'budget'] as ToolId[], tasks: ['Confirm speakers', 'Arrange registration desk', 'Test presentation equipment'] },
  { id: 'birthday', label: 'Birthday', eventType: 'Birthday', detail: 'Guests, gifts and schedule', tools: ['checklist', 'programme', 'guests', 'gifts', 'budget'] as ToolId[], tasks: ['Confirm location', 'Plan entertainment', 'Send invitations'] },
  { id: 'fundraising', label: 'Fundraising', eventType: 'Charity / community', detail: 'Donations, pledges and guests', tools: ['checklist', 'programme', 'donations', 'guests', 'budget'] as ToolId[], tasks: ['Set fundraising target', 'Contact potential donors', 'Prepare programme'] },
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
        // Row-level notes are stored alongside the original columns; do not
        // drop them when hydrating an existing event, reordering or duplicating.
        clean.detailNotes = typeof values.detailNotes === 'string' ? values.detailNotes : ''
        clean.internalNotes = typeof values.internalNotes === 'string' ? values.internalNotes : ''
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
  const row: SheetRow = { id: createId(), detailNotes: '', internalNotes: '' }
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
  const [weddingType, setWeddingType] = useState<'Traditional wedding' | 'White wedding' | 'Engagement'>('Traditional wedding')
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
        title: title.trim(), eventDate, eventType: templateId === 'wedding' ? weddingType : (EVENT_TEMPLATES.find(item => item.id === templateId)?.eventType ?? 'Other'), eventCode: `EVT-${Date.now().toString(36).toUpperCase()}`,
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
          {templateId === 'wedding' && <label>Wedding ceremony type
            <select aria-label="Wedding ceremony type" value={weddingType} onChange={event => setWeddingType(event.target.value as typeof weddingType)}>
              <option>Traditional wedding</option><option>White wedding</option><option>Engagement</option>
            </select>
          </label>}
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
  const [active, setActive] = useState<ToolId | 'overview' | 'details'>('checklist')
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
  const [details, setDetails] = useState<EventDetails>(() => readEventDetails({}))
  const [detailsStatus, setDetailsStatus] = useState<SaveStatus>('saved')
  const detailsRevision = useRef(0)
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)
  const draggingRow = useRef<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [printMode, setPrintMode] = useState<'sheet' | 'programme' | 'run-sheet'>('sheet')
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
      setDetails(readEventDetails(data))
      detailsRevision.current = 0
      setDetailsStatus('saved')
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

  function changeDetail(key: keyof EventDetails, value: string) {
    setDetails(previous => ({ ...previous, [key]: value }))
    detailsRevision.current += 1
    setDetailsStatus('unsaved')
  }

  async function saveDetails() {
    if (!storeId || !eventId || detailsStatus === 'saving' || detailsStatus === 'saved') return
    const version = detailsRevision.current
    const next = { ...details }
    setDetailsStatus('saving')
    try {
      const request = writeQueue.current.catch(() => undefined).then(() =>
        updateDoc(doc(db, 'stores', storeId, 'events', eventId), { ...next, updatedAt: serverTimestamp() }))
      writeQueue.current = request
      await request
      if (detailsRevision.current === version) setDetailsStatus('saved')
    } catch {
      if (detailsRevision.current === version) setDetailsStatus('error')
    }
  }

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
    if (saveStatus === 'saved' && detailsStatus === 'saved') return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [saveStatus, detailsStatus])

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
    if ((saveStatus !== 'saved' || detailsStatus !== 'saved') && !window.confirm('Your event has changes that may not be saved. Leave anyway?')) event.preventDefault()
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
    if (!studio || active === 'overview' || active === 'details') return
    edit({ ...studio, sheets: { ...studio.sheets, [active]: studio.sheets[active].map(row => row.id === rowId ? { ...row, [key]: value } : row) } })
  }

  function addRow() {
    if (!studio || active === 'overview' || active === 'details') return
    const tool = TOOLS.find(item => item.id === active)
    if (!tool) return
    const row = makeRow(tool)
    edit({ ...studio, sheets: { ...studio.sheets, [active]: [...studio.sheets[active], row] } })
    setSelectedRowId(row.id)
    setQuery('')
  }

  function removeRow(rowId: string) {
    if (!studio || active === 'overview' || active === 'details' || !window.confirm('Remove this row from the sheet?')) return
    edit({ ...studio, sheets: { ...studio.sheets, [active]: studio.sheets[active].filter(row => row.id !== rowId) } })
    if (selectedRowId === rowId) setSelectedRowId(null)
    if (expandedRowId === rowId) setExpandedRowId(null)
  }

  function duplicateSelected() {
    if (!studio || active === 'overview' || active === 'details' || !selectedRowId) return
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
    if (!studio || active === 'overview' || active === 'details') return
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
    }
    setActionMessage(result.rejected
      ? `${result.applied} cell${result.applied === 1 ? '' : 's'} accepted; ${result.rejected} invalid date, time or other value${result.rejected === 1 ? '' : 's'} skipped. Check the spreadsheet before continuing.`
      : result.changed ? 'Pasted spreadsheet cells. Review the imported values.' : 'No new spreadsheet values were pasted.')
  }

  function insertAbove() {
    if (!studio || active === 'overview' || active === 'details' || !selectedRowId) return
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
    if (!studio || active === 'overview' || active === 'details' || !selectedRowId || sortBy || query.trim()) return
    const next = repositionStudioRow(studio.sheets[active], selectedRowId, direction)
    if (next !== studio.sheets[active]) edit({ ...studio, sheets: { ...studio.sheets, [active]: next } })
    setSortBy('')
    setQuery('')
  }

  function moveDroppedRow(sourceId: string, targetId: string) {
    if (!studio || active === 'overview' || active === 'details' || sortBy || query.trim()) return
    const next = dropStudioRow(studio.sheets[active], sourceId, targetId)
    if (next !== studio.sheets[active]) {
      edit({ ...studio, sheets: { ...studio.sheets, [active]: next } })
      setActionMessage('Row order updated and will save automatically.')
    }
    draggingRow.current = null
    setDropTargetId(null)
  }

  function changeRowNote(rowId: string, key: 'detailNotes' | 'internalNotes', value: string) {
    if (!studio || active === 'overview' || active === 'details') return
    edit({ ...studio, sheets: { ...studio.sheets, [active]:
      studio.sheets[active].map(row => row.id === rowId ? { ...row, [key]: value } : row),
    } })
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

  function printDocument(mode: 'programme' | 'run-sheet') {
    setPrintMode(mode)
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
  const current = active === 'overview' || active === 'details' ? undefined : (selectedTools.find(tool => tool.id === active) || selectedTools[0])
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
  if (storeError || pageError || !studio || (!current && active !== 'overview' && active !== 'details' && studio.selected.length)) {
    return <main className="event-studio workspace-page"><div className="event-studio__panel"><h1>Unable to open event</h1><p role="alert">{storeError || pageError || 'Workspace unavailable.'}</p><Link to="/event-planning">← Back to events</Link></div></main>
  }

  return (
    <main className={`event-studio event-studio--refined workspace-page${focusMode ? ' event-studio--focus' : ''}${printMode !== 'sheet' ? ' event-studio--printing-programme' : ''}`}>
      <div className="event-studio__crumb"><Link to="/event-planning" onClick={confirmLeave}>← All events</Link><span>/</span><span>Event Studio</span></div>
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
            {saveStatus === 'saved' ? (lastSavedAt ? `✓ Saved at ${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '✓ Saved') : saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Save failed — retry' : 'Unsaved changes'}
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
            <button type="button" role="tab" aria-selected={active === 'details'} className={active === 'details' ? 'is-active' : ''} onClick={() => { setActive('details'); setQuery(''); setExpandedRowId(null) }}>Event Details</button>
            <button type="button" role="tab" aria-selected={active === 'overview'} className={active === 'overview' ? 'is-active' : ''} onClick={() => { setActive('overview'); setQuery(''); setSelectedRowId(null) }}>Overview</button>
            {selectedTools.map(tool => (
              <button type="button" role="tab" aria-selected={current?.id === tool.id} key={tool.id}
                className={current?.id === tool.id ? 'is-active' : ''}
                onClick={() => { setActive(tool.id); setQuery(''); setSelectedRowId(null); setExpandedRowId(null); setSortBy('') }}>{tool.name}</button>
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

        {active === 'details' ? (
          <form className="event-studio__details" onSubmit={event => { event.preventDefault(); void saveDetails() }}>
            <header><span className="event-studio__step">EVENT INFORMATION</span><h1>Event details & client brief</h1>
              <p>Shared with the older event workspace. Printed programme documents use the public event details.</p></header>
            <div className="event-studio__details-grid">
              {DETAILS_FIELDS.map(field => <label key={field.key}>{field.label}
                <input type={field.type || 'text'} value={details[field.key]} placeholder={field.placeholder} onChange={event => changeDetail(field.key, event.target.value)} />
              </label>)}
            </div>
            <label className="event-studio__details-notes">Event-wide notes & client instructions
              <textarea rows={5} value={details.notes} placeholder="Describe requirements, special instructions, access and event-wide reminders…" onChange={event => changeDetail('notes', event.target.value)} />
            </label>
            <div className="event-studio__details-actions">
              <button type="submit" className="event-studio__primary" disabled={detailsStatus === 'saved' || detailsStatus === 'saving'}>{detailsStatus === 'saving' ? 'Saving…' : detailsStatus === 'error' ? 'Retry saving details' : 'Save event details'}</button>
              <span role="status">{detailsStatus === 'saved' ? '✓ Details saved' : detailsStatus === 'error' ? 'Details could not be saved; retry.' : 'Unsaved event details'}</span>
            </div>
          </form>
        ) : active === 'overview' && overview ? (
          <div className="event-studio__overview">
            <header><span className="event-studio__step">AT A GLANCE</span><h1>Event overview</h1><p>Live figures calculated from the event sheets. No additional database requests.</p></header>
            <div className="event-studio__overview-grid">
              <article><span>Checklist progress</span><strong>{overview.completed} / {overview.tasks}</strong><small>Tasks completed</small><progress max={Math.max(1, overview.tasks)} value={overview.completed} /></article>
              <article><span>Programme duration</span><strong>{Math.floor(overview.programmeMinutes / 60)}h {overview.programmeMinutes % 60}m</strong><small>{overview.programmeItems} programme items</small></article>
              <article><span>Confirmed guests</span><strong>{overview.confirmedGuests}</strong><small>{overview.confirmedSeats} seats · {overview.guestRecords} records</small></article>
              <article><span>Budget remaining</span><strong>{money(overview.budget - overview.spent)}</strong><small>{money(overview.spent)} spent of {money(overview.budget)}</small></article>
              <article><span>Donations received</span><strong>{money(overview.received)}</strong><small>{money(overview.pledged - overview.received)} outstanding</small></article>
            </div>
            <p className="event-studio__overview-note">Select a sheet above to update these figures. Figures from hidden sheets are included so no information disappears when a tool is hidden.</p>
          </div>
        ) : current ? (
          <div className="event-studio__sheet-inner">
            <div className="event-studio__refined-heading">
              <div><h1>{current.name}</h1><p>{current.caption}</p></div>
              <span className="event-studio__sheet-count">{rows.length} {rows.length === 1 ? 'row' : 'rows'}</span>
            </div>
            <div className="event-studio__toolbar" role="toolbar" aria-label="Spreadsheet actions">
              <button type="button" className="event-studio__primary" onClick={addRow}>+ Add row</button>
              <button type="button" className="event-studio__plain-button" onClick={duplicateSelected} disabled={!selectedRowId || !rows.some(row => row.id === selectedRowId)}>⧉ Duplicate</button>
              <button type="button" className="event-studio__plain-button" onClick={insertAbove} disabled={!selectedRowId}>Insert above</button>
              <button type="button" className="event-studio__plain-button" onClick={() => reorderRow(-1)} disabled={!selectedRowId || Boolean(sortBy || query.trim()) || rows[0]?.id === selectedRowId}>↑ Move</button>
              <button type="button" className="event-studio__plain-button" onClick={() => reorderRow(1)} disabled={!selectedRowId || Boolean(sortBy || query.trim()) || rows[rows.length - 1]?.id === selectedRowId}>↓ Move</button>
              <button type="button" className="event-studio__plain-button" onClick={undoChange} disabled={undoHistory.current.length === 0}>↶ Undo</button>
              <label className="event-studio__sort-label">Sort
                <select aria-label="Sort rows by" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                  <option value="">Original order</option>
                  {current.fields.filter(field => field.type !== 'computed').map(field => <option value={field.key} key={field.key}>{field.label}</option>)}
                </select>
              </label>
              <button type="button" className="event-studio__plain-button event-studio__sort-direction" aria-label="Reverse sort order" title="Reverse sort order" disabled={!sortBy} onClick={() => setSortDescending(value => !value)}>{sortDescending ? '↓' : '↑'}</button>
              <label className="event-studio__toolbar-search"><span className="event-studio__sr-only">Search sheet rows</span><input placeholder="⌕ Search sheet…" aria-label="Search sheet rows" value={query} onChange={e => setQuery(e.target.value)} /></label>
              <button type="button" className="event-studio__plain-button" onClick={() => void copySheet()} disabled={!rows.length}>Copy sheet</button>
              <button type="button" className="event-studio__plain-button" onClick={() => window.print()}>⎙ Print sheet</button>
              <button type="button" className="event-studio__plain-button event-studio__mobile-toggle" onClick={() => setMobileCards(value => !value)} aria-pressed={mobileCards}>{mobileCards ? 'Table view' : 'Card view'}</button>
            </div>
            {current.id === 'programme' && (
              <div className="event-studio__programme-tools">
                <div><strong>Guest programme print design</strong><small>Formal or modern; private production notes stay out of the guest handout.</small></div>
                <label>Design <select aria-label="Programme print design" value={programmeStyle} onChange={e => setProgrammeStyle(e.target.value as 'formal' | 'modern')}><option value="formal">Formal</option><option value="modern">Modern</option></select></label>
                <label className="event-studio__logo-picker">Optional logo <input aria-label="Optional programme logo" type="file" accept="image/*" onChange={e => loadPrintLogo(e.target.files?.[0])} /></label>
                <button type="button" className="event-studio__primary" onClick={() => printDocument('programme')}>Print guest programme</button>
              </div>
            )}
            {current.id === 'production' && (
              <div className="event-studio__programme-tools">
                <div><strong>Production run sheet</strong><small>Includes internal technical cues and team notes. Intended only for event staff.</small></div>
                <button type="button" className="event-studio__primary" onClick={() => printDocument('run-sheet')}>Print production run sheet</button>
              </div>
            )}
            {actionMessage && <p className="event-studio__action-message" role="status">{actionMessage}<button type="button" aria-label="Dismiss message" onClick={() => setActionMessage('')}>×</button></p>}
            {(query.trim() || sortBy) && <p className="event-studio__ordering-tip">Clear search and set Sort to Original order before dragging or manually moving rows.</p>}
            <div className="event-studio__metrics event-studio__metrics--compact">
              {summary.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
            </div>
            <div className={`event-studio__grid-scroll${mobileCards ? ' event-studio__grid-scroll--mobile-hidden' : ''}`} role="region" aria-label={`${current.name} editable spreadsheet`} tabIndex={0}>
              <table className="event-studio__grid">
                <thead><tr><th scope="col" className="event-studio__number">#</th>{current.fields.map(field => <th scope="col" key={field.key} style={{ minWidth: columnWidths[`${current.id}:${field.key}`] || field.width || 160, width: columnWidths[`${current.id}:${field.key}`] || field.width || 160 }}>{field.label}<span className="event-studio__resize-grip" role="separator" aria-label={`Resize ${field.label} column`} onMouseDown={e => resizeColumn(e, field.key, field.width || 160)} /></th>)}<th scope="col" className="event-studio__number"><span className="event-studio__sr-only">Remove row</span></th></tr></thead>
                <tbody>
                  {visibleRows.length ? visibleRows.map(row => {
                    const rowNumber = rows.indexOf(row) + 1
                    return <tr key={row.id} className={[`event-studio__grid-data-row`, row.id === selectedRowId ? 'event-studio__selected-row' : '', dropTargetId === row.id ? 'event-studio__drop-target' : ''].join(' ')}
                      onClick={() => setSelectedRowId(row.id)}
                      onDragOver={event => { if (!sortBy && !query.trim() && draggingRow.current && draggingRow.current !== row.id) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTargetId(row.id) } }}
                      onDrop={event => { event.preventDefault(); if (draggingRow.current) moveDroppedRow(draggingRow.current, row.id) }}
                      onDragLeave={() => setDropTargetId(target => target === row.id ? null : target)}>
                      <td className="event-studio__number event-studio__row-handle-cell">
                        <span title={sortBy || query ? 'Clear search and sorting to reorder' : 'Drag to reorder'} draggable={!sortBy && !query.trim()}
                          className="event-studio__drag-handle" aria-label={`Drag row ${rowNumber} to reorder`}
                          onDragStart={event => { if (sortBy || query.trim()) { event.preventDefault(); return } draggingRow.current = row.id; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', row.id); setSelectedRowId(row.id) }}
                          onDragEnd={() => { draggingRow.current = null; setDropTargetId(null) }}>⠿</span>
                        <span>{rowNumber}</span>
                      </td>
                      {current.fields.map(field => <td key={field.key}>
                        {field.type === 'computed' ? <output className="event-studio__computed">{money(cellNumber(row, field.key))}</output> :
                          field.type === 'select' ? <select aria-label={`${field.label} row ${rowNumber}`} value={String(row[field.key] ?? '')} onKeyDown={moveDown} onFocus={() => setSelectedRowId(row.id)} onChange={e => changeCell(row.id, field.key, e.target.value)}>{field.options?.map(option => <option key={option} value={option}>{option}</option>)}</select> :
                          <input aria-label={`${field.label} row ${rowNumber}`} type={field.type} min={field.type === 'number' ? '0' : undefined} step={field.type === 'number' ? 'any' : undefined} value={row[field.key] ?? ''} onKeyDown={moveDown} onFocus={() => setSelectedRowId(row.id)} onPaste={e => pasteCells(e, row.id, field.key)} onChange={e => changeCell(row.id, field.key, e.target.value)} />}
                      </td>)}
                      <td className="event-studio__number event-studio__row-actions">
                        <button type="button" className={`event-studio__note-toggle${row.detailNotes || row.internalNotes ? ' has-notes' : ''}`} aria-expanded={expandedRowId === row.id} aria-label={`Notes for row ${rowNumber}`} title="Activity notes" onClick={() => { setSelectedRowId(row.id); setExpandedRowId(expandedRowId === row.id ? null : row.id) }}>✎</button>
                        <button type="button" className="event-studio__remove" aria-label={`Remove row ${rowNumber}`} title="Remove row" onClick={() => removeRow(row.id)}>×</button>
                      </td>
                    </tr>
                  }) : <tr><td colSpan={current.fields.length + 2} className="event-studio__no-rows">{query ? 'No matching rows. Clear your search to see all records.' : 'This sheet is empty. Add a row to get started.'}</td></tr>}
                </tbody>
                <tfoot><tr><td className="event-studio__number">Σ</td>{current.fields.map((field, index) => <td key={field.key}>{field.type === 'number' || field.type === 'computed' ? (isMoneyField(field.key) ? money(sum(field.key)) : String(sum(field.key))) : index === 0 ? 'TOTAL' : ''}</td>)}<td /></tr></tfoot>
              </table>
            </div>
            {expandedRowId && rows.some(row => row.id === expandedRowId) && (
              <div className="event-studio__row-notes">
                <header><strong>Activity notes · Row {rows.findIndex(row => row.id === expandedRowId) + 1}</strong>
                  <button type="button" className="event-studio__plain-button" onClick={() => setExpandedRowId(null)}>Close notes</button>
                </header>
                <div className="event-studio__row-notes-grid">
                  <label>Additional activity notes
                    <textarea aria-label="Additional activity notes" rows={4} maxLength={6000} placeholder="Instructions, reminders, contacts, special arrangements…" value={String(rows.find(row => row.id === expandedRowId)?.detailNotes || '')} onChange={event => changeRowNote(expandedRowId, 'detailNotes', event.target.value)} />
                  </label>
                  <label>Private team / production notes
                    <textarea aria-label="Private team notes" rows={4} maxLength={6000} placeholder="Sound cues, stage direction, backstage instructions (not on guest programme)…" value={String(rows.find(row => row.id === expandedRowId)?.internalNotes || '')} onChange={event => changeRowNote(expandedRowId, 'internalNotes', event.target.value)} />
                  </label>
                </div>
                <p>Notes are saved with the row and move with it. Private team notes appear only in internal run sheets, never guest programmes.</p>
              </div>
            )}
            {mobileCards && <div className="event-studio__mobile-cards" aria-label={`${current.name} mobile row editor`}>
              {visibleRows.length ? visibleRows.map(row => <article key={row.id}>
                <header><strong>Row {rows.indexOf(row) + 1}</strong>
                  <div className="event-studio__mobile-row-actions">
                    <button type="button" disabled={Boolean(sortBy || query.trim()) || rows[0]?.id === row.id} onClick={() => { setSelectedRowId(row.id); const next = repositionStudioRow(rows, row.id, -1); if (next !== rows && studio) edit({ ...studio, sheets: { ...studio.sheets, [current.id]: next } }) }}>↑</button>
                    <button type="button" disabled={Boolean(sortBy || query.trim()) || rows[rows.length - 1]?.id === row.id} onClick={() => { setSelectedRowId(row.id); const next = repositionStudioRow(rows, row.id, 1); if (next !== rows && studio) edit({ ...studio, sheets: { ...studio.sheets, [current.id]: next } }) }}>↓</button>
                    <button type="button" onClick={() => { setSelectedRowId(row.id); setExpandedRowId(expandedRowId === row.id ? null : row.id) }}>Notes{row.detailNotes || row.internalNotes ? ' ●' : ''}</button>
                    <button type="button" onClick={() => removeRow(row.id)}>Remove</button>
                  </div>
                </header>
                <div>{current.fields.map(field => <label key={field.key}>{field.label}
                  {field.type === 'computed' ? <output>{money(cellNumber(row, field.key))}</output> : field.type === 'select' ?
                    <select value={String(row[field.key] ?? '')} onChange={e => changeCell(row.id, field.key, e.target.value)} aria-label={`${field.label} mobile row ${rows.indexOf(row) + 1}`}>{field.options?.map(value => <option key={value}>{value}</option>)}</select> :
                    <input aria-label={`${field.label} mobile row ${rows.indexOf(row) + 1}`} type={field.type} value={row[field.key] ?? ''} onChange={e => changeCell(row.id, field.key, e.target.value)} />}
                </label>)}</div>
              </article>) : <p>No rows to edit yet.</p>}
            </div>}
            <footer className="event-studio__sheet-footer">
              <span>Drag ⠿ to reorder rows · Use Notes for instructions · Enter moves down · Paste Excel cells</span>
              <span>Edits save automatically</span>
            </footer>
          </div>
        ) : <div className="event-studio__blank">Choose your first tool above to open a spreadsheet.</div>}
      </section>
      <section className={`event-studio__print-programme event-studio__print-programme--${programmeStyle}`} aria-hidden={printMode !== 'programme'}>
        <header>{programmeLogo && <img src={programmeLogo} alt="" />}<small>{printMode === 'run-sheet' ? 'INTERNAL PRODUCTION RUN SHEET' : 'ORDER OF EVENTS'}</small><h1>{eventName}</h1>
          {(details.eventDate || eventDate) && <p>{details.eventDate || eventDate}{details.startTime ? ` · ${details.startTime}` : ''}</p>}
          {details.venue && <p>{details.venue}</p>}
          {printMode === 'run-sheet' && <p>Coordinator: {details.eventStudioCoordinator || 'Not assigned'}{details.clientPhone ? ` · Client: ${details.clientPhone}` : ''}</p>}
        </header>
        {printMode === 'run-sheet' ? (
          <table className="event-studio__run-sheet-table"><thead><tr><th>Time</th><th>Segment</th><th>Technical cues / Instructions</th><th>Team / Duration</th></tr></thead><tbody>
            {studio.sheets.production.map(row => <tr key={row.id}>
              <td>{row.start}</td><td>{row.segment}</td>
              <td>{row.cue}{row.detailNotes && <p>{row.detailNotes}</p>}{row.internalNotes && <p><strong>TEAM ONLY:</strong> {row.internalNotes}</p>}</td>
              <td>{row.lead}{row.minutes ? ` · ${row.minutes} min` : ''}<p>{row.status}</p></td>
            </tr>)}
          </tbody></table>
        ) : (
          <table><thead><tr><th>Time</th><th>Programme</th><th>Speaker / Performer</th></tr></thead><tbody>
            {studio.sheets.programme.map(row => <tr key={row.id}><td>{row.start}</td><td>{row.item}</td><td>{row.person}</td></tr>)}
          </tbody></table>
        )}
        <footer>{printMode === 'run-sheet' ? 'Internal planning document · Do not distribute to guests' : 'Thank you for joining us'}</footer>
      </section>
      <p className="event-studio__legacy-note">Need earlier event features? <Link onClick={confirmLeave} to={`/event-planning/${encodeURIComponent(eventId)}/classic`}>Open the previous event workspace</Link>. Existing records are preserved.</p>
    </main>
  )
}
