import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useMemberships } from '../hooks/useMemberships'

type StoreActivityModule = {
  id: string
  label: string
  count: number
  lastAt: Date | null
  amount?: number
}

type StoreActivityRow = {
  storeId: string
  storeName: string
  ownerEmail: string
  phone: string
  city: string
  createdAt: Date | null
  updatedAt: Date | null
  lastActivityAt: Date | null
  totalRecords: number
  totalRevenue: number
  activeModules: string[]
  modules: StoreActivityModule[]
  errors: string[]
}

type StoreDoc = Record<string, unknown>

const MODULES = [
  { id: 'products', label: 'Products', type: 'subcollection', collectionName: 'products' },
  { id: 'services', label: 'Services', type: 'subcollection', collectionName: 'services' },
  { id: 'courses', label: 'Courses', type: 'subcollection', collectionName: 'courses' },
  { id: 'cashOrders', label: 'POS / Cash sales', type: 'subcollection', collectionName: 'cashOrders', amount: true },
  { id: 'customers', label: 'Customers', type: 'subcollection', collectionName: 'customers' },
  { id: 'availability', label: 'Bookings / Events', type: 'subcollection', collectionName: 'integrationAvailabilitySlots' },
  { id: 'blogPosts', label: 'Blog', type: 'subcollection', collectionName: 'blogPosts' },
  { id: 'integrationOrders', label: 'Online / Quick Pay orders', type: 'root', collectionName: 'integrationOrders', amount: true },
  { id: 'integrationBookings', label: 'Website bookings', type: 'root', collectionName: 'integrationBookings', amount: true },
] as const

function text(value: unknown, fallback = '') {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return fallback
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (typeof (value as any)?.toDate === 'function') {
    const parsed = (value as any).toDate()
    return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null
  }
  return null
}

function laterDate(current: Date | null, next: Date | null) {
  if (!current) return next
  if (!next) return current
  return next.getTime() > current.getTime() ? next : current
}

function formatDate(value: Date | null) {
  if (!value) return 'No activity yet'
  return new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium', timeStyle: 'short' }).format(value)
}

function formatShortDate(value: Date | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-GH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(value)
}

function formatMoney(value: number) {
  return `GHS ${value.toFixed(2)}`
}

function storeNameFromData(storeId: string, data: StoreDoc) {
  return text(data.businessName ?? data.storeName ?? data.name ?? data.displayName ?? data.profileName, storeId)
}

function storeEmailFromData(fallback: string, data: StoreDoc) {
  return text(data.ownerEmail ?? data.email ?? data.businessEmail ?? data.contactEmail, fallback || 'No email')
}

function storePhoneFromData(data: StoreDoc) {
  return text(data.phone ?? data.businessPhone ?? data.whatsapp ?? data.whatsappNumber, '')
}

function storeCityFromData(data: StoreDoc) {
  return text(data.city ?? data.town ?? data.location ?? data.country, '')
}

function amountFromRecord(data: StoreDoc) {
  const payment = data.payment && typeof data.payment === 'object' && !Array.isArray(data.payment) ? data.payment as StoreDoc : {}
  const amountMinor = numberValue(data.amountMinor ?? data.amount_minor, 0)
  if (amountMinor > 0) return amountMinor / 100
  return numberValue(
    payment.customerTotal
      ?? payment.amount
      ?? data.amountPaid
      ?? data.amount_paid
      ?? data.confirmedAmount
      ?? data.totalAmount
      ?? data.total_amount
      ?? data.grandTotal
      ?? data.total
      ?? data.amount,
    0,
  )
}

function lastDateFromRecord(data: StoreDoc) {
  return [
    data.updatedAt,
    data.updated_at,
    data.paymentUpdatedAt,
    data.payment_updated_at,
    data.completedAt,
    data.createdAtServer,
    data.createdAt,
    data.created_at,
    data.orderDate,
    data.order_date,
    data.createdAtIso,
  ].map(toDate).reduce(laterDate, null as Date | null)
}

async function readStoreDoc(storeId: string) {
  const storeSnap = await getDoc(doc(db, 'stores', storeId))
  return storeSnap.exists() ? storeSnap.data() as StoreDoc : {}
}

async function readSubcollection(storeId: string, collectionName: string) {
  const snapshot = await getDocs(collection(db, 'stores', storeId, collectionName))
  return snapshot.docs.map(docSnap => docSnap.data() as StoreDoc)
}

async function readRootCollection(storeId: string, collectionName: string) {
  const snapshot = await getDocs(query(collection(db, collectionName), where('storeId', '==', storeId)))
  return snapshot.docs.map(docSnap => docSnap.data() as StoreDoc)
}

async function buildStoreActivity(storeId: string, ownerEmail: string): Promise<StoreActivityRow> {
  const errors: string[] = []
  let storeData: StoreDoc = {}

  try {
    storeData = await readStoreDoc(storeId)
  } catch (error) {
    console.warn('[store-activity] Store profile read failed', storeId, error)
    errors.push('Store profile')
  }

  const modules = await Promise.all(MODULES.map(async module => {
    try {
      const rows = module.type === 'root'
        ? await readRootCollection(storeId, module.collectionName)
        : await readSubcollection(storeId, module.collectionName)
      const lastAt = rows.map(lastDateFromRecord).reduce(laterDate, null as Date | null)
      const amount = module.amount ? rows.reduce((sum, row) => sum + amountFromRecord(row), 0) : undefined
      return { id: module.id, label: module.label, count: rows.length, lastAt, amount }
    } catch (error) {
      console.warn('[store-activity] Module read failed', storeId, module.id, error)
      errors.push(module.label)
      return { id: module.id, label: module.label, count: 0, lastAt: null, amount: module.amount ? 0 : undefined }
    }
  }))

  const activeModules = modules.filter(module => module.count > 0).map(module => module.label)
  const moduleLastActivity = modules.map(module => module.lastAt).reduce(laterDate, null as Date | null)
  const updatedAt = toDate(storeData.updatedAt ?? storeData.updated_at)
  const createdAt = toDate(storeData.createdAt ?? storeData.created_at)
  const lastActivityAt = laterDate(updatedAt, moduleLastActivity)
  const totalRevenue = modules.reduce((sum, module) => sum + (module.amount ?? 0), 0)

  return {
    storeId,
    storeName: storeNameFromData(storeId, storeData),
    ownerEmail: storeEmailFromData(ownerEmail, storeData),
    phone: storePhoneFromData(storeData),
    city: storeCityFromData(storeData),
    createdAt,
    updatedAt,
    lastActivityAt,
    totalRecords: modules.reduce((sum, module) => sum + module.count, 0),
    totalRevenue,
    activeModules,
    modules,
    errors,
  }
}

function ActivityCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 18, padding: 16 }}>
      <p style={{ margin: 0, fontSize: 12, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 800 }}>{label}</p>
      <p style={{ margin: '7px 0 3px', color: '#0F172A', fontSize: 27, fontWeight: 900 }}>{value}</p>
      <p style={{ margin: 0, color: '#64748B', fontSize: 13 }}>{hint}</p>
    </div>
  )
}

function activityTone(lastActivityAt: Date | null) {
  if (!lastActivityAt) return { label: 'No activity', background: '#F1F5F9', color: '#475569' }
  const ageDays = (Date.now() - lastActivityAt.getTime()) / (1000 * 60 * 60 * 24)
  if (ageDays <= 2) return { label: 'Active', background: '#DCFCE7', color: '#166534' }
  if (ageDays <= 14) return { label: 'Warm', background: '#FEF3C7', color: '#92400E' }
  return { label: 'Quiet', background: '#FEE2E2', color: '#991B1B' }
}

export default function StoreActivity() {
  const { memberships, loading: membershipsLoading } = useMemberships()
  const [rows, setRows] = useState<StoreActivityRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')

  const storeAccess = useMemo(() => {
    const byStore = new Map<string, string>()
    memberships.forEach(membership => {
      const storeId = membership.storeId?.trim()
      if (!storeId) return
      const email = membership.email || membership.firstSignupEmail || ''
      if (!byStore.has(storeId)) byStore.set(storeId, email)
    })
    return Array.from(byStore.entries()).map(([storeId, ownerEmail]) => ({ storeId, ownerEmail }))
  }, [memberships])

  useEffect(() => {
    let cancelled = false

    async function loadActivity() {
      if (membershipsLoading) return
      if (storeAccess.length === 0) {
        setRows([])
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setError(null)
      try {
        const results = await Promise.all(storeAccess.map(store => buildStoreActivity(store.storeId, store.ownerEmail)))
        if (cancelled) return
        setRows(results.sort((a, b) => (b.lastActivityAt?.getTime() ?? 0) - (a.lastActivityAt?.getTime() ?? 0)))
      } catch (loadError) {
        console.error('[store-activity] Failed to load store activity', loadError)
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Unable to load store activity.')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void loadActivity()

    return () => {
      cancelled = true
    }
  }, [membershipsLoading, storeAccess])

  const filteredRows = useMemo(() => {
    const search = searchText.trim().toLowerCase()
    if (!search) return rows
    return rows.filter(row => [
      row.storeName,
      row.storeId,
      row.ownerEmail,
      row.phone,
      row.city,
      row.activeModules.join(' '),
    ].join(' ').toLowerCase().includes(search))
  }, [rows, searchText])

  const totals = useMemo(() => ({
    stores: rows.length,
    activeStores: rows.filter(row => row.lastActivityAt && (Date.now() - row.lastActivityAt.getTime()) <= 1000 * 60 * 60 * 24 * 14).length,
    totalRecords: rows.reduce((sum, row) => sum + row.totalRecords, 0),
    revenue: rows.reduce((sum, row) => sum + row.totalRevenue, 0),
  }), [rows])

  return (
    <main className="workspace-page">
      <section className="workspace-card" style={{ display: 'grid', gap: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <p style={{ color: '#64748B', fontSize: 13, margin: '0 0 6px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>Store monitoring</p>
            <h1 style={{ color: '#111827', margin: 0 }}>Store Activity</h1>
            <p style={{ color: '#475569', margin: '8px 0 0', maxWidth: 760 }}>See which stores are using Sedifex, the modules they use, recent activity, and revenue coming from POS, Quick Pay, online orders, and bookings.</p>
          </div>
          <label style={{ display: 'grid', gap: 4, color: '#475569', fontSize: 13, minWidth: 260 }}>
            Search stores
            <input type="search" value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="Store, owner, module…" style={{ border: '1px solid #CBD5E1', borderRadius: 12, padding: '10px 11px' }} />
          </label>
        </div>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
          <ActivityCard label="Stores" value={String(totals.stores)} hint="Visible to this account" />
          <ActivityCard label="Active stores" value={String(totals.activeStores)} hint="Activity in last 14 days" />
          <ActivityCard label="Tracked records" value={String(totals.totalRecords)} hint="Orders, items, customers, bookings" />
          <ActivityCard label="Tracked revenue" value={formatMoney(totals.revenue)} hint="From readable paid/order records" />
        </section>

        {error ? <p style={{ margin: 0, color: '#B91C1C', fontWeight: 700 }}>Store activity failed: {error}</p> : null}
        {isLoading ? <p style={{ margin: 0, color: '#64748B' }}>Loading store activity…</p> : null}
        {!isLoading && filteredRows.length === 0 ? <p style={{ margin: 0, color: '#64748B' }}>No store activity found yet.</p> : null}

        {filteredRows.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1180 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#475569', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Store</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Status</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Last activity</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Using</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Counts</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Revenue</th>
                  <th style={{ padding: '10px 8px', borderBottom: '1px solid #E2E8F0' }}>Open</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(row => {
                  const tone = activityTone(row.lastActivityAt)
                  return (
                    <tr key={row.storeId} style={{ borderBottom: '1px solid #E2E8F0', verticalAlign: 'top' }}>
                      <td style={{ padding: '12px 8px' }}>
                        <strong style={{ color: '#0F172A' }}>{row.storeName}</strong><br />
                        <span style={{ color: '#64748B', fontSize: 13 }}>{row.ownerEmail}</span><br />
                        <span style={{ color: '#94A3B8', fontSize: 12 }}>{row.phone || row.city || row.storeId}</span>
                      </td>
                      <td style={{ padding: '12px 8px' }}><span style={{ display: 'inline-flex', borderRadius: 999, padding: '4px 9px', fontSize: 12, fontWeight: 900, background: tone.background, color: tone.color }}>{tone.label}</span></td>
                      <td style={{ padding: '12px 8px', color: '#475569', fontSize: 13 }}>
                        <strong style={{ color: '#0F172A' }}>{formatDate(row.lastActivityAt)}</strong><br />
                        <span>Created: {formatShortDate(row.createdAt)}</span>
                      </td>
                      <td style={{ padding: '12px 8px', maxWidth: 280 }}>
                        {row.activeModules.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {row.activeModules.slice(0, 8).map(module => <span key={module} style={{ border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1D4ED8', borderRadius: 999, padding: '4px 8px', fontSize: 12, fontWeight: 800 }}>{module}</span>)}
                            {row.activeModules.length > 8 ? <span style={{ color: '#64748B', fontSize: 12 }}>+{row.activeModules.length - 8} more</span> : null}
                          </div>
                        ) : <span style={{ color: '#94A3B8', fontSize: 13 }}>No module usage yet</span>}
                        {row.errors.length > 0 ? <p style={{ color: '#B45309', fontSize: 12, margin: '6px 0 0' }}>Unreadable: {row.errors.join(', ')}</p> : null}
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <div style={{ display: 'grid', gap: 4, color: '#475569', fontSize: 13 }}>
                          {row.modules.filter(module => module.count > 0).slice(0, 6).map(module => (
                            <span key={module.id}><strong style={{ color: '#0F172A' }}>{module.count}</strong> {module.label}</span>
                          ))}
                          {row.totalRecords === 0 ? <span style={{ color: '#94A3B8' }}>No records</span> : null}
                        </div>
                      </td>
                      <td style={{ padding: '12px 8px', color: '#0F172A', fontWeight: 900 }}>{formatMoney(row.totalRevenue)}</td>
                      <td style={{ padding: '12px 8px' }}><Link to="/dashboard" style={{ border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#334155', borderRadius: 999, padding: '6px 10px', fontSize: 12, fontWeight: 900, textDecoration: 'none', display: 'inline-flex' }}>Dashboard</Link></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  )
}
