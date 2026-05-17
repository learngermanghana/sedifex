import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase'
import { useActiveStore } from '../../hooks/useActiveStore'
import type { Product } from '../../types/product'
import { asNumber, downloadCsv, exportReportPdf, formatMoney } from './reportUtils'

type ProductRow = Product & { inventoryValue: number; status: string }

export default function InventoryReport() {
  const { storeId } = useActiveStore()
  const [products, setProducts] = useState<ProductRow[]>([])
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  useEffect(() => {
    if (!storeId) {
      setProducts([])
      return undefined
    }

    const unsubscribe = onSnapshot(query(collection(db, 'products'), where('storeId', '==', storeId)), snapshot => {
      setProducts(snapshot.docs.map(docSnap => {
        const data = docSnap.data() as Product
        const stock = asNumber(data.stockCount, 0)
        const price = asNumber(data.price, 0)
        const reorderPoint = asNumber(data.reorderPoint, 0)
        const status = stock <= 0 ? 'Out of stock' : reorderPoint > 0 && stock <= reorderPoint ? 'Low stock' : 'In stock'
        return { ...data, id: docSnap.id, inventoryValue: stock * price, status }
      }))
    })

    return unsubscribe
  }, [storeId])

  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase()
    return products.filter(product => {
      const matchesType = typeFilter === 'all' || product.itemType === typeFilter
      const matchesSearch = !normalized || [product.name, product.category, product.sku, product.barcode].some(value => String(value ?? '').toLowerCase().includes(normalized))
      return matchesType && matchesSearch
    })
  }, [products, search, typeFilter])

  const totals = useMemo(() => {
    const inventoryItems = products.filter(product => product.itemType !== 'service')
    return {
      totalItems: products.length,
      products: inventoryItems.length,
      services: products.filter(product => product.itemType === 'service').length,
      totalStock: inventoryItems.reduce((sum, product) => sum + asNumber(product.stockCount, 0), 0),
      totalValue: inventoryItems.reduce((sum, product) => sum + product.inventoryValue, 0),
      lowStock: inventoryItems.filter(product => product.status === 'Low stock').length,
      outOfStock: inventoryItems.filter(product => product.status === 'Out of stock').length,
    }
  }, [products])

  const reportRows = filtered.map(product => ({
    name: product.name,
    itemType: product.itemType,
    category: product.category ?? '',
    sku: product.sku ?? '',
    barcode: product.barcode ?? '',
    price: product.price ?? 0,
    stockCount: product.stockCount ?? 0,
    reorderPoint: product.reorderPoint ?? 0,
    status: product.status,
    inventoryValue: product.inventoryValue,
  }))

  function exportRows() {
    downloadCsv('sedifex-inventory-report.csv', reportRows)
  }

  function exportPdf() {
    exportReportPdf({
      title: 'Inventory report',
      subtitle: 'Stock, services, low-stock alerts, and inventory value.',
      summary: [
        { label: 'Total items', value: totals.totalItems },
        { label: 'Total stock units', value: totals.totalStock },
        { label: 'Estimated inventory value', value: formatMoney(totals.totalValue) },
        { label: 'Stock alerts', value: totals.lowStock + totals.outOfStock },
      ],
      rows: reportRows,
    })
  }

  return (
    <div className="workspace-page">
      <section className="workspace-card">
        <p className="workspace-eyebrow">Reports / Inventory</p>
        <h1>Inventory report</h1>
        <p className="workspace-muted">Rich inventory details for stock, services, low-stock alerts, inventory value, CSV export, and PDF export.</p>
      </section>

      <section className="workspace-grid workspace-grid--four">
        <article className="workspace-card"><strong>{totals.totalItems}</strong><span>Total items</span></article>
        <article className="workspace-card"><strong>{totals.totalStock}</strong><span>Total stock units</span></article>
        <article className="workspace-card"><strong>{formatMoney(totals.totalValue)}</strong><span>Estimated inventory value</span></article>
        <article className="workspace-card"><strong>{totals.lowStock + totals.outOfStock}</strong><span>Stock alerts</span></article>
      </section>

      <section className="workspace-card">
        <div className="workspace-section-header">
          <div>
            <h2>Inventory details</h2>
            <p className="workspace-muted">Filter and export all inventory rows.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="button button--secondary" onClick={exportPdf} disabled={filtered.length === 0}>Export PDF</button>
            <button type="button" className="button button--primary" onClick={exportRows} disabled={filtered.length === 0}>Export CSV</button>
          </div>
        </div>
        <div className="workspace-toolbar">
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search item, SKU, category…" />
          <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)}>
            <option value="all">All types</option>
            <option value="product">Products</option>
            <option value="service">Services</option>
            <option value="made_to_order">Made to order</option>
          </select>
        </div>
        <div className="workspace-table-wrap">
          <table className="workspace-table">
            <thead><tr><th>Item</th><th>Type</th><th>Category</th><th>Price</th><th>Stock</th><th>Reorder</th><th>Status</th><th>Value</th></tr></thead>
            <tbody>
              {filtered.map(product => (
                <tr key={product.id}>
                  <td><strong>{product.name}</strong><br /><small>{product.sku || product.barcode || 'No SKU/barcode'}</small></td>
                  <td>{product.itemType}</td>
                  <td>{product.category || '—'}</td>
                  <td>{formatMoney(asNumber(product.price, 0))}</td>
                  <td>{product.stockCount ?? '—'}</td>
                  <td>{product.reorderPoint ?? '—'}</td>
                  <td>{product.status}</td>
                  <td>{formatMoney(product.inventoryValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
