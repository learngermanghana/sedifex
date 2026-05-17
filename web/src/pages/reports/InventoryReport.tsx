import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase'
import { useActiveStore } from '../../hooks/useActiveStore'
import type { Product } from '../../types/product'
import ReportDataTable, { type ReportColumn } from './ReportDataTable'
import { asNumber, downloadCsv, exportReportPdf, formatMoney } from './reportUtils'

type ProductRow = Product & { inventoryValue: number; status: string }

export default function InventoryReport() {
  const { storeId } = useActiveStore()
  const [products, setProducts] = useState<ProductRow[]>([])
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  useEffect(() => {
    if (!storeId) return void setProducts([])
    return onSnapshot(query(collection(db, 'products'), where('storeId', '==', storeId)), snapshot => setProducts(snapshot.docs.map(docSnap => {
      const data = docSnap.data() as Product
      const stock = asNumber(data.stockCount, 0)
      const price = asNumber(data.price, 0)
      const reorderPoint = asNumber(data.reorderPoint, 0)
      const status = stock <= 0 ? 'out of stock' : reorderPoint > 0 && stock <= reorderPoint ? 'low stock' : 'in stock'
      return { ...data, id: docSnap.id, inventoryValue: stock * price, status }
    })))
  }, [storeId])
  const filtered = useMemo(() => products.filter(product => {
    const normalized = search.trim().toLowerCase()
    const matchesType = typeFilter === 'all' || product.itemType === typeFilter
    const matchesSearch = !normalized || [product.name, product.category, product.sku, product.barcode].some(value => String(value ?? '').toLowerCase().includes(normalized))
    return matchesType && matchesSearch
  }), [products, search, typeFilter])
  const totals = useMemo(() => ({ totalItems: products.length, totalStock: products.reduce((s,p)=>s+asNumber(p.stockCount,0),0), totalValue: products.reduce((s,p)=>s+p.inventoryValue,0), lowStock: products.filter(p=>p.status==='low stock').length, outOfStock: products.filter(p=>p.status==='out of stock').length }), [products])
  const reportRows = filtered.map(product => ({ name: product.name, itemType: product.itemType, category: product.category ?? '', sku: product.sku ?? '', barcode: product.barcode ?? '', price: product.price ?? 0, stockCount: product.stockCount ?? 0, reorderPoint: product.reorderPoint ?? 0, status: product.status, inventoryValue: product.inventoryValue }))
  const columns: ReportColumn<ProductRow>[] = [
    { key: 'item', label: 'Item', sortable: true, value: row => row.name, render: row => <><strong>{row.name}</strong><br /><small>{row.sku || row.barcode || 'No SKU/barcode'}</small></> },
    { key: 'type', label: 'Type', sortable: true, value: row => row.itemType },
    { key: 'category', label: 'Category', sortable: true, value: row => row.category ?? '—' },
    { key: 'price', label: 'Price', align: 'right', sortable: true, value: row => asNumber(row.price, 0), render: row => formatMoney(asNumber(row.price, 0)) },
    { key: 'stock', label: 'Stock', align: 'right', sortable: true, value: row => asNumber(row.stockCount, 0) },
    { key: 'status', label: 'Status', sortable: true, value: row => row.status, render: row => <span className={`report-status-badge ${row.status === 'in stock' ? 'report-status-badge--good' : row.status === 'low stock' ? 'report-status-badge--warn' : 'report-status-badge--bad'}`}>{row.status}</span> },
    { key: 'value', label: 'Value', align: 'right', sortable: true, value: row => row.inventoryValue, render: row => formatMoney(row.inventoryValue) },
  ]
  return <div className="workspace-page">{/* same content */}
      <section className="workspace-card"><p className="workspace-eyebrow">Reports / Inventory</p><h1>Inventory report</h1><p className="workspace-muted">Rich inventory details for stock, services, low-stock alerts, inventory value, CSV export, and PDF export.</p></section>
      <section className="workspace-grid workspace-grid--four"><article className="workspace-card"><strong>{totals.totalItems}</strong><span>Total items</span></article><article className="workspace-card"><strong>{totals.totalStock}</strong><span>Total stock units</span></article><article className="workspace-card"><strong>{formatMoney(totals.totalValue)}</strong><span>Estimated inventory value</span></article><article className="workspace-card"><strong>{totals.lowStock + totals.outOfStock}</strong><span>Stock alerts</span></article></section>
      <ReportDataTable title="Inventory details" subtitle="Filter and export all inventory rows." rows={filtered} columns={columns} getRowKey={(row, index) => String(row.id ?? index)} actions={<><button type="button" className="button button--secondary" onClick={() => exportReportPdf({ title: 'Inventory report', subtitle: 'Stock, services, low-stock alerts, and inventory value.', summary: [{ label: 'Total items', value: totals.totalItems }, { label: 'Total stock units', value: totals.totalStock }, { label: 'Estimated inventory value', value: formatMoney(totals.totalValue) }, { label: 'Stock alerts', value: totals.lowStock + totals.outOfStock }], rows: reportRows })} disabled={!filtered.length}>Export PDF</button><button type="button" className="button button--primary" onClick={() => downloadCsv('sedifex-inventory-report.csv', reportRows)} disabled={!filtered.length}>Export CSV</button></>} defaultPageSize={25} searchPlaceholder="Search filtered inventory…" />
      <div className="workspace-toolbar report-toolbar-inline"><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search item, SKU, category…" /><select value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option value="all">All types</option><option value="product">Products</option><option value="service">Services</option><option value="made_to_order">Made to order</option></select></div>
    </div>
}
