import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import { useMemberships } from '../hooks/useMemberships'
import './StaffInventory.css'

type InventoryItem = {
  id: string
  name: string
  sku: string
  category: string
  price: number | null
  currency: string
  stock: number | null
  reorderPoint: number | null
  status: 'in-stock' | 'low-stock' | 'out-of-stock' | 'untracked'
}

function numberOrNull(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

export function mapInventoryItem(id: string, data: Record<string, unknown>): InventoryItem | null {
  // Staff inventory tracks physical goods, not services, course places or
  // made-to-order entries (which do not share on-hand stock semantics).
  if (data.itemType != null && data.itemType !== 'product') return null

  const stock = numberOrNull(data.stockCount)
  const reorderPoint = numberOrNull(data.reorderPoint)
  const status = stock === null ? 'untracked'
    : stock <= 0 ? 'out-of-stock'
    : reorderPoint !== null && reorderPoint > 0 && stock <= reorderPoint ? 'low-stock'
    : 'in-stock'

  return {
    id,
    name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Unnamed product',
    sku: typeof data.sku === 'string' ? data.sku : typeof data.barcode === 'string' ? data.barcode : '',
    category: typeof data.category === 'string' ? data.category
      : typeof data.categoryName === 'string' ? data.categoryName : 'Uncategorised',
    price: numberOrNull(data.price),
    currency: typeof data.currency === 'string' && data.currency.trim() ? data.currency : 'GHS',
    stock,
    reorderPoint,
    status,
  }
}

function formatPrice(item: InventoryItem) {
  if (item.price === null) return '—'
  return `${item.currency} ${item.price.toFixed(2)}`
}

const statusLabel: Record<InventoryItem['status'], string> = {
  'in-stock': 'In stock',
  'low-stock': 'Low stock',
  'out-of-stock': 'Out of stock',
  untracked: 'Not tracked',
}

export default function StaffInventory() {
  const { storeId } = useActiveStore()
  const { memberships, loading: checkingRole } = useMemberships()
  const isStaff = memberships.some(member => member.storeId === storeId && member.role === 'staff')
  const [items, setItems] = useState<InventoryItem[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!storeId || checkingRole || !isStaff) {
      setItems([])
      setLoading(false)
      return
    }
    setItems([])
    setLoading(true)
    setError('')
    return onSnapshot(
      query(collection(db, 'products'), where('storeId', '==', storeId), limit(500)),
      snapshot => {
        const rows = snapshot.docs
          .map(item => mapInventoryItem(item.id, item.data() as Record<string, unknown>))
          .filter((item): item is InventoryItem => item !== null)
          .sort((a, b) => a.name.localeCompare(b.name))
        setItems(rows)
        setLoading(false)
      },
      cause => {
        console.error('[staff-inventory] Could not read inventory', cause)
        setItems([])
        setError('Inventory could not be loaded. Check your connection or ask your business owner to confirm your staff access.')
        setLoading(false)
      },
    )
  }, [storeId, checkingRole, isStaff])

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return items.filter(item => {
      if (filter !== 'all' && item.status !== filter) return false
      return !needle || [item.name, item.sku, item.category].join(' ').toLowerCase().includes(needle)
    })
  }, [items, search, filter])

  const alerts = items.filter(item => item.status === 'low-stock' || item.status === 'out-of-stock').length
  const totalUnits = items.reduce((sum, item) => sum + (item.stock ?? 0), 0)

  if (checkingRole) return <main className="staff-inventory"><p role="status">Checking inventory access…</p></main>
  if (storeId && !isStaff) return <Navigate to="/products" replace />

  return (
    <main className="staff-inventory">
      <header className="staff-inventory__header">
        <div>
          <h1>Inventory</h1>
          <p>Check products, selling prices and current stock levels without changing any records.</p>
        </div>
        <span className="staff-inventory__readonly">View only · Staff</span>
      </header>
      {!storeId && <p>Select a workspace to view its inventory.</p>}
      {error && <p role="alert" className="staff-inventory__error">{error}</p>}

      <div className="staff-inventory__summary" aria-label="Inventory summary">
        <div><strong>{items.length}</strong><span>Products loaded</span></div>
        <div><strong>{totalUnits}</strong><span>Units on hand</span></div>
        <div><strong>{alerts}</strong><span>Low / out of stock</span></div>
      </div>

      <div className="staff-inventory__toolbar">
        <label>Find a product
          <input value={search} type="search" onChange={event => setSearch(event.target.value)}
            placeholder="Name, SKU, category…" />
        </label>
        <label>Stock status
          <select value={filter} onChange={event => setFilter(event.target.value)}>
            <option value="all">All stock</option>
            <option value="in-stock">In stock</option>
            <option value="low-stock">Low stock</option>
            <option value="out-of-stock">Out of stock</option>
            <option value="untracked">Not tracked</option>
          </select>
        </label>
      </div>

      {loading && <p role="status">Loading stock levels…</p>}
      {!loading && !error && visible.length === 0 && (
        <p className="staff-inventory__empty">No matching products found.</p>
      )}

      {!loading && visible.length > 0 && (
        <div className="staff-inventory__scroll">
          <table className="staff-inventory__table">
            <thead><tr><th>Product</th><th>SKU</th><th>Selling price</th><th>On hand</th><th>Status</th></tr></thead>
            <tbody>
              {visible.map(item => (
                <tr key={item.id}>
                  <td><strong>{item.name}</strong><small>{item.category}</small></td>
                  <td>{item.sku || '—'}</td>
                  <td>{formatPrice(item)}</td>
                  <td>{item.stock ?? '—'}</td>
                  <td><span className={`staff-inventory__status staff-inventory__status--${item.status}`}>{statusLabel[item.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="staff-inventory__footnote">Showing {visible.length} of {items.length} loaded products (up to 500). Only the business owner can add, edit, delete or receive stock. Sales continue to adjust inventory through checkout.</p>
    </main>
  )
}
