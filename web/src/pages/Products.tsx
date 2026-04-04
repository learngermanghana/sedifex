import React, { useEffect, useMemo, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import './Products.css'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import { useAuthUser } from '../hooks/useAuthUser'
import { useMemberships } from '../hooks/useMemberships'
import {
  PRODUCT_CACHE_LIMIT,
  loadCachedProducts,
  saveCachedProducts,
} from '../utils/offlineCache'
import { normalizeBarcode } from '../utils/barcode'
import { useStorePreferences } from '../hooks/useStorePreferences'
import type { ItemType, Product } from '../types/product'
import { ProductImageUploadError, uploadProductImage } from '../api/productImageUpload'
import { useToast } from '../components/ToastProvider'
import { playSound } from '../utils/sound'

type CachedProduct = Omit<Product, 'id'>
type AbcBucket = 'A' | 'B' | 'C'
type ProductTab = 'add' | 'search'
type SaleRecord = {
  id: string
  items: Array<{
    productId: string | null
    qty: number
    price: number
    type?: string | null
    isService?: boolean
  }>
}

/**
 * Helpers
 */
function sanitizeNumber(value: unknown): number | null {
  if (typeof value !== 'number') return null
  if (!Number.isFinite(value)) return null
  if (value < 0) return null
  return value
}

function sanitizeTaxRate(value: unknown): number | null {
  if (typeof value !== 'number') return null
  if (!Number.isFinite(value)) return null
  if (value < 0) return null
  return value
}

// Users type VAT as "15" -> save 0.15
function parseTaxInput(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const raw = Number(trimmed)
  if (!Number.isFinite(raw) || raw < 0) return null
  // if > 1, treat as percent, else decimal
  const rate = raw > 1 ? raw / 100 : raw
  return rate
}

function formatVat(taxRate?: number | null): string {
  if (typeof taxRate !== 'number' || !Number.isFinite(taxRate) || taxRate <= 0) {
    return '—'
  }
  return `${(taxRate * 100).toFixed(0)}%`
}

function toDate(value: unknown): Date | null {
  if (!value) return null
  try {
    if (typeof (value as any).toDate === 'function') {
      const d: Date = (value as any).toDate()
      return Number.isNaN(d.getTime()) ? null : d
    }
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value)
      return Number.isNaN(parsed.getTime()) ? null : parsed
    }
  } catch {
    return null
  }
  return null
}

function mapFirestoreProduct(id: string, data: Record<string, unknown>): Product {
  const nameRaw = typeof data.name === 'string' ? data.name : ''
  const skuRaw = typeof data.sku === 'string' ? data.sku : ''

  // 🔹 Prefer explicit barcode field; fall back to sku (for old data)
  const barcodeSource =
    typeof data.barcode === 'string'
      ? data.barcode
      : typeof data.sku === 'string'
        ? data.sku
        : ''

  const normalizedBarcode = normalizeBarcode(barcodeSource)

  const itemType = data.itemType === 'service' ? 'service' : 'product'

  const expiryDate = toDate(data.expiryDate)
  const productionDate = toDate(data.productionDate)
  const manufacturerName = typeof data.manufacturerName === 'string' ? data.manufacturerName.trim() : ''
  const batchNumber = typeof data.batchNumber === 'string' ? data.batchNumber.trim() : ''
  const showOnReceipt = data.showOnReceipt === true
  const imageUrl = typeof data.imageUrl === 'string' && data.imageUrl.trim() ? data.imageUrl.trim() : null
  const imageAlt = typeof data.imageAlt === 'string' && data.imageAlt.trim() ? data.imageAlt.trim() : null
  const reorderPoint = sanitizeNumber(
    data.reorderPoint ?? data.reorderLevel ?? (data as any).reorderThreshold ?? null,
  )

  return {
    id,
    name: nameRaw.trim() || 'Untitled item',
    sku: skuRaw.trim() || null,
    barcode: normalizedBarcode || null,
    price: sanitizeNumber(data.price) ?? null,
    stockCount: sanitizeNumber(data.stockCount),
    reorderPoint,
    itemType,
    imageUrl,
    imageAlt: imageUrl ? imageAlt || (nameRaw.trim() || 'Product image') : null,
    taxRate: sanitizeTaxRate(data.taxRate),
    expiryDate,
    productionDate,
    manufacturerName: manufacturerName || null,
    batchNumber: batchNumber || null,
    showOnReceipt,
    lastReceiptAt: data.lastReceiptAt,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

const BACKFILLED_PRODUCTS = new Set<string>()

async function backfillProductDefaults(
  productId: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (BACKFILLED_PRODUCTS.has(productId)) return

  const updates: Record<string, unknown> = {}
  if (!('manufacturerName' in data)) updates.manufacturerName = null
  if (!('productionDate' in data)) updates.productionDate = null
  if (!('batchNumber' in data)) updates.batchNumber = null
  if (!('showOnReceipt' in data)) updates.showOnReceipt = false
  if (!('imageUrl' in data)) updates.imageUrl = null
  if (!('imageAlt' in data) && typeof data.imageUrl === 'string' && data.imageUrl.trim()) {
    updates.imageAlt = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : null
  }

  if (!Object.keys(updates).length) return

  BACKFILLED_PRODUCTS.add(productId)
  try {
    await updateDoc(doc(db, 'products', productId), updates)
  } catch (error) {
    BACKFILLED_PRODUCTS.delete(productId)
    console.warn('[products] Failed to backfill metadata defaults', error)
  }
}

function formatCurrency(amount: number | null | undefined): string {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return '—'
  return `GHS ${amount.toFixed(2)}`
}

function formatExpiry(expiryDate?: Date | null): string {
  if (!expiryDate) return '—'
  return expiryDate.toLocaleDateString()
}

function formatDateInputValue(date: Date | null | undefined): string {
  if (!date) return ''
  return date.toISOString().split('T')[0]
}

function parseDateInput(input: string): Date | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function normalizeImageUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.toString()
  } catch {
    return null
  }
}

function normalizeLookupValue(value: string | null | undefined): string {
  if (!value) return ''
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function formatLastReceipt(lastReceiptAt: unknown): string {
  if (!lastReceiptAt) return 'No receipts recorded'
  try {
    // Firestore Timestamp
    if (typeof (lastReceiptAt as any).toDate === 'function') {
      const d: Date = (lastReceiptAt as any).toDate()
      return d.toLocaleDateString()
    }
    if (lastReceiptAt instanceof Date) {
      return lastReceiptAt.toLocaleDateString()
    }
  } catch {
    // ignore
  }
  return 'No receipts recorded'
}

function normalizeSaleItems(items: unknown): SaleRecord['items'] {
  if (!Array.isArray(items)) return []
  return items.map(item => {
    const itemData = item as Record<string, unknown>
    const productId = typeof itemData.productId === 'string' ? itemData.productId : null
    const qty = Number(itemData.qty) || 0
    const price = Number(itemData.price) || 0
    const type = typeof itemData.type === 'string' ? itemData.type : null
    const isService = itemData.isService === true

    return {
      productId,
      qty,
      price,
      type,
      isService,
    }
  })
}

export default function Products() {
  const { storeId: activeStoreId } = useActiveStore()
  const { memberships } = useMemberships()
  const user = useAuthUser()
  const { preferences } = useStorePreferences(activeStoreId)
  const { publish } = useToast()

  const [products, setProducts] = useState<Product[]>([])
  const [sales, setSales] = useState<SaleRecord[]>([])
  const [activeTab, setActiveTab] = useState<ProductTab>('add')
  const [searchText, setSearchText] = useState('')
  const [showLowStockOnly, setShowLowStockOnly] = useState(false)
  const [expandedProductIds, setExpandedProductIds] = useState<Set<string>>(new Set())
  // add-item form state
  const [name, setName] = useState('')
  const [itemType, setItemType] = useState<ItemType>('product')
  const [sku, setSku] = useState('')
  const [priceInput, setPriceInput] = useState('')
  const [taxRateInput, setTaxRateInput] = useState('')
  const [reorderPointInput, setReorderPointInput] = useState('')
  const [openingStockInput, setOpeningStockInput] = useState('')
  const [expiryInput, setExpiryInput] = useState('')
  const [manufacturerInput, setManufacturerInput] = useState('')
  const [productionDateInput, setProductionDateInput] = useState('')
  const [batchNumberInput, setBatchNumberInput] = useState('')
  const [showOnReceiptInput, setShowOnReceiptInput] = useState(false)
  const [imageUrlInput, setImageUrlInput] = useState('')
  const [imageAltInput, setImageAltInput] = useState('')
  const [imageFileInput, setImageFileInput] = useState<File | null>(null)
  const [imageUploadError, setImageUploadError] = useState<string | null>(null)
  const [isUploadingImage, setIsUploadingImage] = useState(false)

  const [isSaving, setIsSaving] = useState(false)
  const [formStatus, setFormStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [formError, setFormError] = useState<string | null>(null)

  // edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editItemType, setEditItemType] = useState<ItemType>('product')
  const [editSku, setEditSku] = useState('')
  const [editPriceInput, setEditPriceInput] = useState('')
  const [editTaxRateInput, setEditTaxRateInput] = useState('')
  const [editReorderPointInput, setEditReorderPointInput] = useState('')
  const [editStockInput, setEditStockInput] = useState('') // 🔹 On hand (stock) editable
  const [editExpiryDateInput, setEditExpiryDateInput] = useState('')
  const [editProductionDateInput, setEditProductionDateInput] = useState('')
  const [editManufacturerInput, setEditManufacturerInput] = useState('')
  const [editBatchNumberInput, setEditBatchNumberInput] = useState('')
  const [editShowOnReceipt, setEditShowOnReceipt] = useState(false)
  const [editImageUrlInput, setEditImageUrlInput] = useState('')
  const [editImageAltInput, setEditImageAltInput] = useState('')
  const [salesError, setSalesError] = useState<string | null>(null)

  useEffect(() => {
    if (editingId) return
    setItemType(preferences.productDefaults.defaultItemType === 'service' ? 'service' : 'product')
  }, [editingId, preferences.productDefaults.defaultItemType])

  const activeMembership = useMemo(
    () =>
      activeStoreId
        ? memberships.find(membership => membership.storeId === activeStoreId) ?? null
        : null,
    [activeStoreId, memberships],
  )

  const canManageProducts = activeMembership?.role === 'owner'

  /**
   * Load products for the active store
   */
  useEffect(() => {
    let cancelled = false
    let receivedLiveSnapshot = false

    if (!activeStoreId) {
      setProducts([])
      return () => {
        cancelled = true
      }
    }

    // 1. Live Firestore subscription (primary source of truth)
    const q = query(
      collection(db, 'products'),
      where('storeId', '==', activeStoreId),
      orderBy('updatedAt', 'desc'),
      orderBy('createdAt', 'desc'),
      limit(PRODUCT_CACHE_LIMIT),
    )

    const unsubscribe = onSnapshot(q, snapshot => {
      receivedLiveSnapshot = true
      const rows: Product[] = snapshot.docs.map(d => {
        const raw = d.data() as Record<string, unknown>
        backfillProductDefaults(d.id, raw)
        return mapFirestoreProduct(d.id, raw)
      })

      // save for offline
      saveCachedProducts(
        rows.map(r => ({
          ...r,
          id: undefined as any, // cache doesn't need the id
        })),
        { storeId: activeStoreId },
      ).catch(error => {
        console.warn('[products] Failed to cache products', error)
      })

      const sorted = [...rows].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      )
      setProducts(sorted)
    })

    // 2. Fallback to cached products only if live data has not arrived yet.
    loadCachedProducts<CachedProduct>({ storeId: activeStoreId })
      .then(cached => {
        if (cancelled || receivedLiveSnapshot || !cached.length) return
        const mapped = cached.map((item, index) =>
          mapFirestoreProduct(
            // cached objects don't have ids, so we fake a stable-ish one
            (item as any).id ?? `cached-${index}`,
            item as any,
          ),
        )
        setProducts(
          mapped.sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
          ),
        )
      })
      .catch(error => {
        console.warn('[products] Failed to load cached products', error)
      })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [activeStoreId])

  /**
   * Load sales to compute ABC analysis
   */
  useEffect(() => {
    if (!activeStoreId) {
      setSales([])
      setSalesError(null)
      return
    }

    const q = query(
      collection(db, 'sales'),
      where('storeId', '==', activeStoreId),
      orderBy('createdAt', 'desc'),
      limit(500),
    )

    const unsubscribe = onSnapshot(
      q,
      snapshot => {
        const rows: SaleRecord[] = snapshot.docs.map(docSnap => {
          const data = docSnap.data() as Record<string, unknown>
          return {
            id: docSnap.id,
            items: normalizeSaleItems(data.items),
          }
        })
        setSales(rows)
        setSalesError(null)
      },
      error => {
        console.warn('[products] Failed to load sales for ABC analysis', error)
        setSales([])
        setSalesError('Sales data unavailable, ABC analysis may be incomplete.')
      },
    )

    return () => unsubscribe()
  }, [activeStoreId])

  const abcAnalysis = useMemo(() => {
    const revenueByProduct = new Map<string, number>()
    let totalRevenue = 0

    for (const sale of sales) {
      for (const item of sale.items) {
        if (!item.productId) continue
        const itemType = typeof item.type === 'string' ? item.type.toLowerCase() : null
        if (item.isService || itemType === 'service') {
          continue
        }
        const revenue = item.qty * item.price
        if (!Number.isFinite(revenue) || revenue <= 0) continue
        totalRevenue += revenue
        revenueByProduct.set(item.productId, (revenueByProduct.get(item.productId) ?? 0) + revenue)
      }
    }

    if (totalRevenue <= 0) return new Map<string, { bucket: AbcBucket; shareOfSales: number }>()

    const sorted = [...revenueByProduct.entries()].sort((a, b) => b[1] - a[1])
    const analysis = new Map<string, { bucket: AbcBucket; shareOfSales: number }>()
    let cumulativeRevenue = 0

    for (const [productId, revenue] of sorted) {
      cumulativeRevenue += revenue
      const cumulativeShare = cumulativeRevenue / totalRevenue
      const bucket: AbcBucket =
        cumulativeShare <= 0.7 ? 'A' : cumulativeShare <= 0.9 ? 'B' : 'C'
      analysis.set(productId, {
        bucket,
        shareOfSales: revenue / totalRevenue,
      })
    }

    return analysis
  }, [sales])

  const getAbcInfo = (productId: string) => {
    const entry = abcAnalysis.get(productId)
    if (!entry) {
      return { bucket: 'C' as AbcBucket, note: 'No sales yet' }
    }
    const shareLabel =
      entry.shareOfSales < 0.01
        ? '<1% of sales'
        : `${Math.round(entry.shareOfSales * 100)}% of sales`
    return { bucket: entry.bucket, note: shareLabel }
  }

  /**
   * Filtering logic
   */
  const visibleProducts = useMemo(() => {
    let result = products

    if (showLowStockOnly) {
      result = result.filter(p => {
        if (p.itemType !== 'product') return false
        if (typeof p.stockCount !== 'number') return false
        if (typeof p.reorderPoint !== 'number') return false
        return p.stockCount <= p.reorderPoint
      })
    }

    if (searchText.trim()) {
      const term = searchText.trim().toLowerCase()
      result = result.filter(p => {
        const inName = p.name.toLowerCase().includes(term)
        const inSku = (p.sku ?? '').toLowerCase().includes(term)
        const inBarcode = (p.barcode ?? '').toLowerCase().includes(term)
        return inName || inSku || inBarcode
      })
    }

    return result
  }, [products, searchText, showLowStockOnly])

  const editingProduct = useMemo(
    () => products.find(product => product.id === editingId) ?? null,
    [editingId, products],
  )

  const lowStockCount = useMemo(
    () =>
      products.filter(p => {
        if (p.itemType !== 'product') return false
        if (typeof p.stockCount !== 'number') return false
        if (typeof p.reorderPoint !== 'number') return false
        return p.stockCount <= p.reorderPoint
      }).length,
    [products],
  )

  /**
   * Add item handler
   */
  async function handleAddItem(event: React.FormEvent) {
    event.preventDefault()
    if (!activeStoreId) return

    setFormStatus('idle')
    setFormError(null)

    const trimmedName = name.trim()
    if (!trimmedName) {
      setFormStatus('error')
      setFormError('Please enter a name for this item.')
      return
    }

    const isService = itemType === 'service'

    const priceNumber = priceInput ? Number(priceInput) : NaN
    const reorderPointNumber = reorderPointInput ? Number(reorderPointInput) : NaN
    const openingStockNumber = openingStockInput ? Number(openingStockInput) : NaN
    const taxRateNumber = parseTaxInput(taxRateInput)
    const expiryDate = parseDateInput(expiryInput)
    const productionDate = parseDateInput(productionDateInput)
    const manufacturerName = manufacturerInput.trim()
    const batchNumber = batchNumberInput.trim()
    const normalizedImageUrl = normalizeImageUrl(imageUrlInput)
    const imageAlt = imageAltInput.trim()

    if (!isService && (Number.isNaN(priceNumber) || priceNumber < 0)) {
      setFormStatus('error')
      setFormError('Enter a valid selling price.')
      return
    }

    if (
      isStockTracked &&
      openingStockInput &&
      (Number.isNaN(openingStockNumber) || openingStockNumber < 0)
    ) {
      setFormStatus('error')
      setFormError('Opening stock must be zero or more.')
      return
    }
    if (imageUrlInput.trim() && !normalizedImageUrl) {
      setFormStatus('error')
      setFormError('Image URL must start with http:// or https://')
      return
    }

    let finalPrice: number | null = null
    if (!Number.isNaN(priceNumber) && priceNumber >= 0) {
      finalPrice = Number(priceNumber.toFixed(2)) // 🔹 respect user input (2dp)
    }

    const trimmedSku = sku.trim()
    const normalizedName = normalizeLookupValue(trimmedName)
    const normalizedSku = normalizeBarcode(trimmedSku)

    const duplicateNameProduct = products.find(
      product => normalizeLookupValue(product.name) === normalizedName,
    )
    if (duplicateNameProduct) {
      setFormStatus('error')
      setFormError(`"${trimmedName}" already exists. Update the existing item instead.`)
      return
    }

    if (!isService && normalizedSku) {
      const duplicateSkuProduct = products.find(product => {
        const existingSku = normalizeBarcode(product.barcode ?? product.sku ?? '')
        return existingSku === normalizedSku
      })

      if (duplicateSkuProduct) {
        setFormStatus('error')
        setFormError(`SKU "${trimmedSku}" is already assigned to another item.`)
        return
      }
    }

    setIsSaving(true)
    try {
      await addDoc(collection(db, 'products'), {
        storeId: activeStoreId,
        name: trimmedName,
        itemType,
        price: finalPrice,
        // 🔹 Keep SKU as typed, but also store a normalized barcode field
        sku: isService ? null : trimmedSku || null,
        barcode: isService ? null : normalizeBarcode(trimmedSku) || null,
        taxRate: taxRateNumber,
        reorderPoint:
          isStockTracked && !Number.isNaN(reorderPointNumber) && reorderPointNumber >= 0
            ? reorderPointNumber
            : null,
        stockCount:
          isStockTracked && !Number.isNaN(openingStockNumber) && openingStockNumber >= 0
            ? openingStockNumber
            : null,
        expiryDate: isStockTracked ? expiryDate : null,
        productionDate: !isService ? productionDate : null,
        manufacturerName: !isService && manufacturerName ? manufacturerName : null,
        batchNumber: !isService && batchNumber ? batchNumber : null,
        showOnReceipt: !isService && showOnReceiptInput,
        imageUrl: normalizedImageUrl,
        imageAlt: normalizedImageUrl ? imageAlt || trimmedName : null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      setFormStatus('success')
      setFormError(null)

      // reset form
      setName('')
      setItemType('product')
      setSku('')
      setPriceInput('')
      setTaxRateInput('')
      setReorderPointInput('')
      setOpeningStockInput('')
      setManufacturerInput('')
      setProductionDateInput('')
      setBatchNumberInput('')
      setShowOnReceiptInput(false)
      setImageUrlInput('')
      setImageAltInput('')

      await logInventoryActivity(
        `Added ${trimmedName}`,
        isService
          ? 'Service added to catalogue'
          : `SKU ${trimmedSku || '—'} · Price ${finalPrice !== null ? `GHS ${finalPrice.toFixed(2)}` : '—'}`,
      )
      void playSound('success')
    } catch (error) {
      console.error('[products] Failed to add item', error)
      setFormStatus('error')
      setFormError(
        error instanceof Error
          ? error.message
          : 'We could not save this item. Please try again.',
      )
      void playSound('error')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleImageUpload() {
    if (!imageFileInput) {
      setImageUploadError('Choose an image file before uploading.')
      return
    }

    setImageUploadError(null)
    setIsUploadingImage(true)
    try {
      const uploadedUrl = await uploadProductImage(imageFileInput)
      setImageUrlInput(uploadedUrl)
      setImageFileInput(null)
      publish({ tone: 'success', message: 'Image uploaded successfully.' })
      void playSound('action')
    } catch (error) {
      console.error('[products] Failed to upload product image', error)
      if (error instanceof ProductImageUploadError) {
        setImageUploadError(error.message)
      } else {
        setImageUploadError('Image upload failed. Please try again.')
      }
      void playSound('error')
    } finally {
      setIsUploadingImage(false)
    }
  }

  const handleItemTypeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value as ItemType
    setItemType(value)
    if (value === 'service') {
      // services should not have barcodes
      setSku('')
      setExpiryInput('')
      setManufacturerInput('')
      setProductionDateInput('')
      setBatchNumberInput('')
      setShowOnReceiptInput(false)
    }
  }

  const isService = itemType === 'service'
  const isStockTracked = itemType === 'product'
  const activityActor = user?.displayName || user?.email || 'Team member'

  async function logInventoryActivity(summary: string, detail: string) {
    if (!activeStoreId) return

    try {
      await addDoc(collection(db, 'activity'), {
        storeId: activeStoreId,
        type: 'inventory',
        summary,
        detail,
        actor: activityActor,
        createdAt: serverTimestamp(),
      })
    } catch (error) {
      console.warn('[activity] Failed to log product activity', error)
    }
  }

  /**
   * Edit helpers
   */
  function startEditing(product: Product) {
    if (!canManageProducts) return

    setActiveTab('search')
    setExpandedProductIds(prev => new Set(prev).add(product.id))
    setEditingId(product.id)
    setEditName(product.name)
    setEditItemType(product.itemType)
    setEditSku(product.sku ?? '')
    setEditPriceInput(
      typeof product.price === 'number' && Number.isFinite(product.price)
        ? String(product.price)
        : '',
    )
    setEditTaxRateInput(
      typeof product.taxRate === 'number' && Number.isFinite(product.taxRate)
        ? String((product.taxRate * 100).toFixed(0)) // show as percent
        : '',
    )
    setEditReorderPointInput(
      typeof product.reorderPoint === 'number' && Number.isFinite(product.reorderPoint)
        ? String(product.reorderPoint)
        : '',
    )
    setEditStockInput(
      typeof product.stockCount === 'number' && Number.isFinite(product.stockCount)
        ? String(product.stockCount)
        : '',
    )
    setEditExpiryDateInput(formatDateInputValue(product.expiryDate))
    setEditProductionDateInput(formatDateInputValue(product.productionDate))
    setEditManufacturerInput(product.manufacturerName ?? '')
    setEditBatchNumberInput(product.batchNumber ?? '')
    setEditShowOnReceipt(product.showOnReceipt === true)
    setEditImageUrlInput(product.imageUrl ?? '')
    setEditImageAltInput(product.imageAlt ?? '')
    setFormStatus('idle')
    setFormError(null)
  }

  function cancelEditing() {
    setEditingId(null)
  }

  function toggleExpandedProduct(productId: string) {
    setExpandedProductIds(prev => {
      const next = new Set(prev)
      if (next.has(productId)) {
        next.delete(productId)
      } else {
        next.add(productId)
      }
      return next
    })
  }

  async function handleSaveEdit(product: Product) {
    if (!canManageProducts) return
    if (!editingId || editingId !== product.id) return

    const trimmedName = editName.trim()
    if (!trimmedName) {
      setFormStatus('error')
      setFormError('Please enter a name for this item.')
      return
    }

    const isStockTracked = editItemType === 'product'
    const priceNumber = editPriceInput ? Number(editPriceInput) : NaN
    const reorderPointNumber = editReorderPointInput
      ? Number(editReorderPointInput)
      : NaN
    const taxRateNumber = parseTaxInput(editTaxRateInput)
    const stockNumberRaw =
      editStockInput.trim() === '' ? null : Number(editStockInput.trim())
    const expiryDate = parseDateInput(editExpiryDateInput)
    const productionDate = parseDateInput(editProductionDateInput)
    const manufacturerName = editManufacturerInput.trim()
    const batchNumber = editBatchNumberInput.trim()
    const normalizedImageUrl = normalizeImageUrl(editImageUrlInput)
    const imageAlt = editImageAltInput.trim()

    if (!isStockTracked && (Number.isNaN(priceNumber) || priceNumber < 0)) {
      setFormStatus('error')
      setFormError('Enter a valid selling price.')
      return
    }

    if (isStockTracked && stockNumberRaw !== null) {
      if (!Number.isFinite(stockNumberRaw) || stockNumberRaw < 0) {
        setFormStatus('error')
        setFormError('On hand must be zero or more.')
        return
      }
    }
    if (editImageUrlInput.trim() && !normalizedImageUrl) {
      setFormStatus('error')
      setFormError('Image URL must start with http:// or https://')
      return
    }

    let finalPrice: number | null = null
    if (!Number.isNaN(priceNumber) && priceNumber >= 0) {
      finalPrice = Number(priceNumber.toFixed(2))
    }

    const finalStock =
      !isStockTracked || stockNumberRaw === null ? null : Math.floor(stockNumberRaw)

    const trimmedSku = editSku.trim()

    setFormStatus('idle')
    setFormError(null)

    try {
      const ref = doc(db, 'products', product.id)
      await updateDoc(ref, {
        name: trimmedName,
        itemType: editItemType,
        sku: isStockTracked ? trimmedSku || null : null,
        barcode: isStockTracked ? normalizeBarcode(trimmedSku) || null : null,
        price: finalPrice,
        taxRate: taxRateNumber,
        reorderPoint:
          isStockTracked &&
          !Number.isNaN(reorderPointNumber) &&
          reorderPointNumber >= 0
            ? reorderPointNumber
            : null,
        stockCount: finalStock,
        expiryDate: isStockTracked ? expiryDate : null,
        productionDate: isStockTracked ? productionDate : null,
        manufacturerName: isStockTracked && manufacturerName ? manufacturerName : null,
        batchNumber: isStockTracked && batchNumber ? batchNumber : null,
        showOnReceipt: isStockTracked && editShowOnReceipt,
        imageUrl: normalizedImageUrl,
        imageAlt: normalizedImageUrl ? imageAlt || trimmedName : null,
        updatedAt: serverTimestamp(),
      })

      setEditingId(null)
      setFormStatus('success')
      setFormError('Item updated successfully.')

      await logInventoryActivity(
        `Updated ${trimmedName}`,
        isStockTracked
          ? `SKU ${trimmedSku || '—'} · Stock ${
              typeof finalStock === 'number' ? finalStock : '—'
            } · Price ${
              typeof finalPrice === 'number' ? `GHS ${finalPrice.toFixed(2)}` : '—'
            }`
          : 'Service or made-to-order details updated',
      )
    } catch (error) {
      console.error('[products] Failed to update item', error)
      setFormStatus('error')
      setFormError(
        error instanceof Error
          ? error.message
          : 'We could not update this item. Please try again.',
      )
    }
  }

  async function handleDelete(product: Product) {
    if (!canManageProducts) return

    const confirmed = window.confirm(
      `Delete "${product.name}"? This cannot be undone.`,
    )
    if (!confirmed) return

    try {
      const ref = doc(db, 'products', product.id)
      await deleteDoc(ref)
      if (editingId === product.id) {
        setEditingId(null)
      }

      await logInventoryActivity(
        `Deleted ${product.name}`,
        'Removed from catalogue',
      )
    } catch (error) {
      console.error('[products] Failed to delete item', error)
      setFormStatus('error')
      setFormError(
        error instanceof Error
          ? error.message
          : 'We could not delete this item. Please try again.',
      )
    }
  }

  return (
    <div className="page products-page">
      <header className="page__header products-page__header">
        <div>
          <h2 className="page__title">Items</h2>
          <p className="page__subtitle">
            Review inventory, monitor low stock alerts, and keep your catalogue of items
            and services tidy.
          </p>
        </div>
      </header>

      <div className="products-page__grid">
        <div className="products-page__tabs" role="tablist" aria-label="Items sub-tabs">
          <button
            type="button"
            role="tab"
            id="products-tab-add"
            aria-controls="products-panel-add"
            aria-selected={activeTab === 'add'}
            className={`products-page__tab ${activeTab === 'add' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('add')}
          >
            Add product
          </button>
          <button
            type="button"
            role="tab"
            id="products-tab-search"
            aria-controls="products-panel-search"
            aria-selected={activeTab === 'search'}
            className={`products-page__tab ${activeTab === 'search' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('search')}
          >
            Search products
          </button>
        </div>

        {/* Add item card */}
        <section
          className={`card products-page__add-card ${activeTab !== 'add' ? 'products-page__panel--hidden' : ''}`}
          role="tabpanel"
          id="products-panel-add"
          aria-labelledby="products-tab-add"
          hidden={activeTab !== 'add'}
        >
          <h3 className="card__title">Add item</h3>
          <p className="card__subtitle">
            Capture both physical products and services you offer so sales and records
            stay accurate.
          </p>

          {formStatus === 'success' && formError === null && (
            <p className="products__message products__message--success">
              Item added. You can now sell it from the Sell page.
            </p>
          )}

          {formStatus === 'success' && formError === 'Item updated successfully.' && (
            <p className="products__message products__message--success">
              {formError}
            </p>
          )}

          {formStatus === 'error' && formError && (
            <p className="products__message products__message--error">{formError}</p>
          )}

          <form className="form" onSubmit={handleAddItem}>
            <div className="field">
              <label className="field__label" htmlFor="add-name">
                Name
              </label>
              <input
                id="add-name"
                placeholder="e.g. House Blend Coffee or Acrylic Nails"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>

            <div className="field">
              <label className="field__label" htmlFor="add-type">
                Item type
              </label>
              <select id="add-type" value={itemType} onChange={handleItemTypeChange}>
                <option value="product">Physical product</option>
                <option value="service">Service</option>
              </select>
              <div>
                <p className="field__hint">
                  <strong>Physical product:</strong> Tracks on-hand stock for items you store so you
                  can watch low-stock alerts.
                </p>
                <p className="field__hint">
                  <strong>Service:</strong> No stock counts—best for labour or time-based work while
                  still setting a selling price.
                </p>
              </div>
            </div>

            {!isService && (
              <div className="field">
                <label className="field__label" htmlFor="add-sku">
                  SKU / Barcode
                </label>
                <input
                  id="add-sku"
                  placeholder="Scan or type the barcode, or use an internal code"
                  value={sku}
                  onChange={e => setSku(e.target.value)}
                />
                <p className="field__hint">
                  If you scan barcodes, this should match the code on the product. We
                  also store a normalized version (letters + digits) so camera scans work even if
                  you add spaces or dashes.
                </p>
              </div>
            )}

            <div className="field">
              <label className="field__label" htmlFor="add-price">
                Price
              </label>
              <input
                id="add-price"
                type="number"
                min="0"
                step="0.01"
                placeholder="How much you sell it for"
                value={priceInput}
                onChange={e => setPriceInput(e.target.value)}
              />
              <p className="field__hint">
                We save the price as you enter it, rounded to 2 decimal places.
              </p>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="add-opening-stock">
                Opening stock
              </label>
              <input
                id="add-opening-stock"
                type="number"
                min="0"
                step="1"
                placeholder="Quantity currently on hand"
                value={openingStockInput}
                onChange={e => setOpeningStockInput(e.target.value)}
                disabled={isService}
              />
            </div>

            <details className="products-page__optional-expander">
              <summary>Optional item details</summary>

              <div className="field">
                <label className="field__label" htmlFor="add-tax">
                  VAT (percent)
                </label>
                <input
                  id="add-tax"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 15 for 15% VAT, or leave blank"
                  value={taxRateInput}
                  onChange={e => setTaxRateInput(e.target.value)}
                />
              </div>

              <div className="field">
                <label className="field__label" htmlFor="add-reorder">
                  Reorder point
                </label>
                <input
                  id="add-reorder"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Alert when stock drops to..."
                  value={reorderPointInput}
                  onChange={e => setReorderPointInput(e.target.value)}
                  disabled={isService}
                />
              </div>

              {!isService && (
                <div className="field">
                  <label className="field__label" htmlFor="add-expiry">
                    Expiry date
                  </label>
                  <input
                    id="add-expiry"
                    type="date"
                    value={expiryInput}
                    onChange={e => setExpiryInput(e.target.value)}
                  />
                  <p className="field__hint">
                    Stay ahead of expiring batches so pharmacy stock never goes to waste.
                  </p>
                </div>
              )}

              {!isService && (
                <>
                  <div className="field">
                    <label className="field__label" htmlFor="add-production">
                      Production date <span className="field__optional">(optional)</span>
                    </label>
                    <input
                      id="add-production"
                      type="date"
                      value={productionDateInput}
                      onChange={e => setProductionDateInput(e.target.value)}
                    />
                  </div>

                  <div className="field">
                    <label className="field__label" htmlFor="add-manufacturer">
                      Manufacturer name <span className="field__optional">(optional)</span>
                    </label>
                    <input
                      id="add-manufacturer"
                      type="text"
                      value={manufacturerInput}
                      onChange={e => setManufacturerInput(e.target.value)}
                    />
                  </div>

                  <div className="field">
                    <label className="field__label" htmlFor="add-batch">
                      Batch number <span className="field__optional">(optional)</span>
                    </label>
                    <input
                      id="add-batch"
                      type="text"
                      value={batchNumberInput}
                      onChange={e => setBatchNumberInput(e.target.value)}
                    />
                  </div>

                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={showOnReceiptInput}
                      onChange={event => setShowOnReceiptInput(event.target.checked)}
                    />
                    <span>
                      Show production details on receipts and labels{' '}
                      <span className="field__optional">(optional)</span>
                    </span>
                  </label>
                </>
              )}

              <div className="field">
                <label className="field__label" htmlFor="add-image-file">
                  Upload image <span className="field__optional">(optional)</span>
                </label>
                <input
                  id="add-image-file"
                  type="file"
                  accept="image/*"
                  onChange={event => {
                    const file = event.target.files?.[0] ?? null
                    setImageFileInput(file)
                    setImageUploadError(null)
                  }}
                />
                <div className="products-page__upload-actions">
                  <button
                    type="button"
                    className="button button--secondary"
                    disabled={!imageFileInput || isUploadingImage}
                    onClick={() => {
                      void handleImageUpload()
                    }}
                  >
                    {isUploadingImage ? 'Uploading…' : 'Upload and use URL'}
                  </button>
                  {imageUploadError ? (
                    <p className="products-page__upload-error">{imageUploadError}</p>
                  ) : null}
                </div>
                <p className="field__hint">
                  Uploads to your own backend endpoint and auto-fills Image URL.
                </p>
              </div>

              <div className="field">
                <label className="field__label" htmlFor="add-image-url">
                  Image URL <span className="field__optional">(optional)</span>
                </label>
                <input
                  id="add-image-url"
                  type="url"
                  placeholder="https://example.com/product-image.jpg"
                  value={imageUrlInput}
                  onChange={e => setImageUrlInput(e.target.value)}
                />
              </div>

              <div className="field">
                <label className="field__label" htmlFor="add-image-alt">
                  Image alt text <span className="field__optional">(optional)</span>
                </label>
                <input
                  id="add-image-alt"
                  type="text"
                  placeholder="Accessible image description"
                  value={imageAltInput}
                  onChange={e => setImageAltInput(e.target.value)}
                />
                <p className="field__hint">Defaults to the item name when left empty.</p>
              </div>
            </details>

            <button
              type="submit"
              className="button button--primary"
              disabled={isSaving}
            >
              {isSaving ? 'Adding…' : 'Add item'}
            </button>
          </form>
        </section>

        {/* List card */}
        <section
          className={`card products-page__list-card ${activeTab !== 'search' ? 'products-page__panel--hidden' : ''}`}
          role="tabpanel"
          id="products-panel-search"
          aria-labelledby="products-tab-search"
          hidden={activeTab !== 'search'}
        >
          <div className="products-page__list-header">
            <div className="field field--inline">
              <label className="field__label" htmlFor="products-search">
                Search
              </label>
              <input
                id="products-search"
                placeholder="Search by name, SKU, or barcode"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
              />
            </div>
          </div>

          <div className="products-page__list-controls">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={showLowStockOnly}
                onChange={e => setShowLowStockOnly(e.target.checked)}
              />
              <span>Show low stock only ({lowStockCount})</span>
            </label>
            <button type="button" className="button button--ghost">
              Download reorder list
            </button>
          </div>
          <p className="products-page__abc-hint">
            ABC analysis ranks items by sales revenue from the last 500 sales. A = top 70%, B = next
            20%, C = remaining.
            {salesError ? <span className="products-page__abc-error">{salesError}</span> : null}
          </p>

          {editingProduct ? (
            editItemType !== 'product' ? (
              <section className="card products-page__edit-card" aria-live="polite">
                <p className="field__hint">
                  Receipt and batch details only apply to products. Switch this item back to a
                  product to edit its manufacturing info.
                </p>
              </section>
            ) : (
              <section className="card products-page__edit-card" aria-live="polite">
                <h4>Receipt &amp; batch details</h4>
                <p className="field__hint">
                  Add optional production details that can appear on receipts, labels, and invoices.
                </p>

                <div className="field">
                  <label className="field__label" htmlFor="edit-production">
                    Production date <span className="field__optional">(optional)</span>
                  </label>
                  <input
                    id="edit-production"
                    type="date"
                    value={editProductionDateInput}
                    onChange={event => setEditProductionDateInput(event.target.value)}
                  />
                </div>

                <div className="field">
                  <label className="field__label" htmlFor="edit-manufacturer">
                    Manufacturer name <span className="field__optional">(optional)</span>
                  </label>
                  <input
                    id="edit-manufacturer"
                    type="text"
                    value={editManufacturerInput}
                    onChange={event => setEditManufacturerInput(event.target.value)}
                  />
                </div>

                <div className="field">
                  <label className="field__label" htmlFor="edit-batch">
                    Batch number <span className="field__optional">(optional)</span>
                  </label>
                  <input
                    id="edit-batch"
                    type="text"
                    value={editBatchNumberInput}
                    onChange={event => setEditBatchNumberInput(event.target.value)}
                  />
                </div>

                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={editShowOnReceipt}
                    onChange={event => setEditShowOnReceipt(event.target.checked)}
                  />
                  <span>
                    Show production details on receipts and labels{' '}
                    <span className="field__optional">(optional)</span>
                  </span>
                </label>
              </section>
            )
          ) : null}

          {visibleProducts.length === 0 ? (
            <div className="empty-state">
              <h3 className="empty-state__title">No items found</h3>
              <p>
                Try a different search term, or add new items using the form on the left.
              </p>
            </div>
          ) : (
            <div className="products-page__list" aria-live="polite">
              {visibleProducts.map(product => {
                const isEditing = editingId === product.id
                const isExpanded = isEditing || expandedProductIds.has(product.id)
                const displayItemType = isEditing ? editItemType : product.itemType
                const isStockTracked = displayItemType === 'product'

                return (
                  <article
                    key={product.id}
                    className={`products-page__list-card ${isEditing ? 'is-editing' : ''}`}
                  >
                    <header className="products-page__list-card__header">
                      <div className="products-page__thumb-wrap">
                        {product.imageUrl ? (
                          <img
                            className="products-page__thumb"
                            src={product.imageUrl}
                            alt={product.imageAlt ?? product.name}
                            loading="lazy"
                          />
                        ) : (
                          <div className="products-page__thumb products-page__thumb--placeholder">
                            No image
                          </div>
                        )}
                      </div>
                      <div className="products-page__list-title">
                        <h4>{product.name}</h4>
                        <span className="products-page__badge products-page__badge--muted">
                          {displayItemType === 'service' ? 'Service' : 'Product'}
                        </span>
                        {isStockTracked && typeof product.reorderPoint === 'number' &&
                          typeof product.stockCount === 'number' &&
                          product.stockCount <= product.reorderPoint && (
                            <span className="products-page__pill">Low stock</span>
                          )}
                      </div>
                      <div className="products-page__list-meta">
                        <span className="products-page__meta-label">Last receipt:</span>
                        <span>{formatLastReceipt(product.lastReceiptAt)}</span>
                      </div>
                      <button
                        type="button"
                        className="button button--ghost products-page__expand-button"
                        onClick={() => toggleExpandedProduct(product.id)}
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? 'Hide details' : 'View details'}
                      </button>
                    </header>

                    {isExpanded ? (
                      <>
                        <div className="products-page__list-grid">
                          <div className="products-page__list-field">
                            <label className="field__label">Name</label>
                            {isEditing ? (
                              <input
                                value={editName}
                                onChange={event => setEditName(event.target.value)}
                              />
                            ) : (
                              <p className="products-page__list-value">{product.name}</p>
                            )}
                          </div>

                      <div className="products-page__list-field">
                        <label className="field__label">Item type</label>
                        {isEditing ? (
                          <select
                            value={editItemType}
                            onChange={event => setEditItemType(event.target.value as ItemType)}
                          >
                            <option value="product">Physical product</option>
                            <option value="service">Service</option>
                          </select>
                        ) : (
                          <p className="products-page__list-value">
                            {product.itemType === 'service' ? 'Service' : 'Physical product'}
                          </p>
                        )}
                      </div>

                      {displayItemType !== 'service' && (
                        <div className="products-page__list-field">
                          <label className="field__label">SKU / Barcode</label>
                          {isEditing ? (
                            <input
                              value={editSku}
                              onChange={event => setEditSku(event.target.value)}
                              placeholder="Scan or type"
                            />
                          ) : (
                            <p className="products-page__list-value">{product.sku || '—'}</p>
                          )}
                        </div>
                      )}

                      <div className="products-page__list-field">
                        <label className="field__label">Image URL</label>
                        {isEditing ? (
                          <input
                            type="url"
                            value={editImageUrlInput}
                            onChange={event => setEditImageUrlInput(event.target.value)}
                            placeholder="https://example.com/image.jpg"
                          />
                        ) : (
                          <p className="products-page__list-value">{product.imageUrl || '—'}</p>
                        )}
                      </div>

                      <div className="products-page__list-field">
                        <label className="field__label">Image alt text</label>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editImageAltInput}
                            onChange={event => setEditImageAltInput(event.target.value)}
                            placeholder="Accessible image description"
                          />
                        ) : (
                          <p className="products-page__list-value">
                            {product.imageAlt || product.name}
                          </p>
                        )}
                      </div>

                      <div className="products-page__list-field">
                        <label className="field__label">VAT</label>
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editTaxRateInput}
                            onChange={event => setEditTaxRateInput(event.target.value)}
                            placeholder="e.g. 15"
                          />
                        ) : (
                          <p className="products-page__list-value">{formatVat(product.taxRate)}</p>
                        )}
                      </div>

                      <div className="products-page__list-field">
                        <label className="field__label">Price</label>
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editPriceInput}
                            onChange={event => setEditPriceInput(event.target.value)}
                          />
                        ) : (
                          <p className="products-page__list-value">{formatCurrency(product.price)}</p>
                        )}
                      </div>

                      <div className="products-page__list-field">
                        <label className="field__label">ABC class</label>
                        {isStockTracked ? (
                          (() => {
                            const abcInfo = getAbcInfo(product.id)
                            return (
                              <div className="products-page__abc">
                                <span
                                  className={`products-page__badge products-page__badge--abc-${abcInfo.bucket.toLowerCase()}`}
                                >
                                  {abcInfo.bucket}
                                </span>
                                <span className="products-page__abc-note">{abcInfo.note}</span>
                              </div>
                            )
                          })()
                        ) : (
                          <p className="products-page__list-value">—</p>
                        )}
                      </div>

                      <div className="products-page__list-field">
                        <label className="field__label">On hand</label>
                        {isStockTracked ? (
                          isEditing ? (
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={editStockInput}
                              onChange={event => setEditStockInput(event.target.value)}
                            />
                          ) : (
                            <p className="products-page__list-value">{product.stockCount ?? 0}</p>
                          )
                        ) : (
                          <p className="products-page__list-value">—</p>
                        )}
                      </div>

                      <div className="products-page__list-field">
                        <label className="field__label">Reorder point</label>
                        {isStockTracked ? (
                          isEditing ? (
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={editReorderPointInput}
                              onChange={event => setEditReorderPointInput(event.target.value)}
                            />
                          ) : (
                            <p className="products-page__list-value">{product.reorderPoint ?? '—'}</p>
                          )
                        ) : (
                          <p className="products-page__list-value">—</p>
                        )}
                      </div>

                      <div className="products-page__list-field">
                        <label className="field__label">Expiry date</label>
                        {isStockTracked ? (
                          isEditing ? (
                            <input
                              type="date"
                              value={editExpiryDateInput}
                              onChange={event => setEditExpiryDateInput(event.target.value)}
                            />
                          ) : (
                            <p className="products-page__list-value">{formatExpiry(product.expiryDate)}</p>
                          )
                        ) : (
                          <p className="products-page__list-value">—</p>
                        )}
                      </div>

                      {isStockTracked && (
                        <>
                          <div className="products-page__list-field">
                            <label className="field__label">Production date</label>
                            {isEditing ? (
                              <input
                                type="date"
                                value={editProductionDateInput}
                                onChange={event =>
                                  setEditProductionDateInput(event.target.value)
                                }
                              />
                            ) : (
                              <p className="products-page__list-value">
                                {formatExpiry(product.productionDate)}
                              </p>
                            )}
                          </div>

                          <div className="products-page__list-field">
                            <label className="field__label">Manufacturer</label>
                            {isEditing ? (
                              <input
                                type="text"
                                value={editManufacturerInput}
                                onChange={event => setEditManufacturerInput(event.target.value)}
                              />
                            ) : (
                              <p className="products-page__list-value">
                                {product.manufacturerName || '—'}
                              </p>
                            )}
                          </div>

                          <div className="products-page__list-field">
                            <label className="field__label">Batch number</label>
                            {isEditing ? (
                              <input
                                type="text"
                                value={editBatchNumberInput}
                                onChange={event => setEditBatchNumberInput(event.target.value)}
                              />
                            ) : (
                              <p className="products-page__list-value">{product.batchNumber || '—'}</p>
                            )}
                          </div>
                        </>
                      )}
                        </div>

                        <div className="products-page__list-actions">
                          {!canManageProducts ? (
                            <span className="products-page__list-value">View only</span>
                          ) : isEditing ? (
                            <>
                              <button
                                type="button"
                                className="button button--primary"
                                onClick={() => handleSaveEdit(product)}
                              >
                                Save changes
                              </button>
                              <button
                                type="button"
                                className="button button--ghost"
                                onClick={cancelEditing}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="button button--danger"
                                onClick={() => handleDelete(product)}
                              >
                                Delete
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="button button--ghost"
                                onClick={() => startEditing(product)}
                              >
                                Edit details
                              </button>
                              <button
                                type="button"
                                className="button button--danger"
                                onClick={() => handleDelete(product)}
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    ) : null}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
