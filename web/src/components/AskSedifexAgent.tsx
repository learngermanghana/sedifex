import React, { FormEvent, useEffect, useMemo, useState } from 'react'
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore'
import { useLocation, useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import ProductPhotoAssist from './ProductPhotoAssist'

type Change = {
  field: 'name' | 'price' | 'description'
  label: string
  current: string
  value: string
}

type AgentItem = {
  id: string
  name: string
  category: string
  itemType: string
  price: number | null
  stockCount: number | null
  imageUrl: string | null
  isPublished: boolean
  isMarketplaceVisible: boolean
}

function readField(id: string) {
  const element = document.getElementById(id)
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return element.value.trim()
  return ''
}

function writeField(id: string, value: string) {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return false
  element.value = value
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}

function getTargetIds() {
  if (document.getElementById('item-name') && document.getElementById('item-price') && document.getElementById('item-description')) {
    return { name: 'item-name', price: 'item-price', description: 'item-description' }
  }
  if (document.getElementById('edit-name') && document.getElementById('edit-price') && document.getElementById('edit-description')) {
    return { name: 'edit-name', price: 'edit-price', description: 'edit-description' }
  }
  if (document.getElementById('add-name') && document.getElementById('add-price') && document.getElementById('add-description')) {
    return { name: 'add-name', price: 'add-price', description: 'add-description' }
  }
  return null
}

function titleCase(value: string) {
  return value
    .trim()
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function cleanSearch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function extractNumber(command: string) {
  const match = command.match(/[0-9]+(?:\.[0-9]{1,2})?/)
  return match ? match[0] : ''
}

function makeName(current: string) {
  const base = titleCase(current || 'Quality Item')
  if (base.toLowerCase().includes('premium')) return base
  return base.length < 18 ? `Premium ${base}` : base
}

function makeDescription(name: string) {
  const itemName = titleCase(name || 'This item')
  return `${itemName} is carefully selected to give customers good value, a clean buying experience, and reliable everyday use.`
}

function isEditCommand(text: string) {
  const lower = text.toLowerCase()
  return [
    'change',
    'update',
    'set ',
    'price',
    'amount',
    'cost',
    'name',
    'rename',
    'professional',
    'description',
    'describe',
    'write',
    'better',
  ].some(word => lower.includes(word))
}

function normalizeItem(id: string, data: Record<string, unknown>): AgentItem {
  const itemType = data.itemType === 'service' ? 'service' : data.itemType === 'course' ? 'course' : 'product'
  const price = typeof data.price === 'number' && Number.isFinite(data.price) ? data.price : null
  const stockCount = typeof data.stockCount === 'number' && Number.isFinite(data.stockCount) ? data.stockCount : null
  return {
    id,
    name: typeof data.name === 'string' && data.name.trim() ? titleCase(data.name) : 'Untitled item',
    category: typeof data.category === 'string' && data.category.trim() ? titleCase(data.category) : itemType === 'service' ? 'Services' : itemType === 'course' ? 'Courses' : 'Products',
    itemType,
    price,
    stockCount,
    imageUrl: typeof data.imageUrl === 'string' && data.imageUrl.trim() ? data.imageUrl.trim() : null,
    isPublished: data.isPublished === true || data.status === 'published',
    isMarketplaceVisible: data.isMarketplaceVisible === true,
  }
}

function findMatches(items: AgentItem[], term: string) {
  const cleaned = cleanSearch(term)
  const words = cleaned.split(' ').filter(Boolean)
  if (!words.length) return []

  return items
    .map(item => {
      const haystack = cleanSearch(`${item.name} ${item.category} ${item.itemType}`)
      const score = words.reduce((total, word) => total + (haystack.includes(word) ? 1 : 0), 0)
      const nameBoost = words.some(word => cleanSearch(item.name).includes(word)) ? 2 : 0
      return { item, score: score + nameBoost }
    })
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .slice(0, 6)
    .map(result => result.item)
}

function formatPrice(value: number | null) {
  return typeof value === 'number' ? `GHS ${value.toFixed(2)}` : 'No price'
}

export default function AskSedifexAgent({ enabled }: { enabled: boolean }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { storeId } = useActiveStore()
  const [open, setOpen] = useState(false)
  const [command, setCommand] = useState('')
  const [message, setMessage] = useState('')
  const [changes, setChanges] = useState<Change[]>([])
  const [items, setItems] = useState<AgentItem[]>([])
  const [matches, setMatches] = useState<AgentItem[]>([])
  const isProductsPage = location.pathname.startsWith('/products') || location.pathname.startsWith('/items')

  useEffect(() => {
    if (!enabled || !storeId) {
      setItems([])
      return undefined
    }

    const productsQuery = query(collection(db, 'products'), where('storeId', '==', storeId), limit(200))
    return onSnapshot(productsQuery, snapshot => {
      setItems(snapshot.docs.map(doc => normalizeItem(doc.id, doc.data() as Record<string, unknown>)))
    }, error => {
      console.warn('[ask-sedifex] Could not load product search list', error)
      setItems([])
    })
  }, [enabled, storeId])

  const helperText = useMemo(() => {
    if (!storeId) return 'Select a store first, then ask me to find or edit items.'
    return 'Type a product name to search. Type an action to edit, for example: change price to 50.'
  }, [storeId])

  if (!enabled) return null

  function runSearch(term: string) {
    const found = findMatches(items, term)
    setMatches(found)
    setChanges([])
    if (!found.length) {
      setMessage(`I did not find an item matching “${term}”. Try another product name or category.`)
      return
    }
    setMessage(`I found ${found.length} matching item${found.length === 1 ? '' : 's'} for “${term}”.`)
  }

  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const ids = getTargetIds()
    const rawText = command.trim()
    const text = rawText.toLowerCase()
    setChanges([])
    setMatches([])

    if (!rawText) {
      setMessage('Type a product name to search, or type an edit command like “change price to 150”.')
      return
    }

    const editCommand = isEditCommand(text)
    if (!editCommand) {
      runSearch(rawText)
      return
    }

    if (!isProductsPage || !ids) {
      const found = findMatches(items, rawText)
      setMatches(found)
      setMessage(found.length
        ? 'I found possible items. To change details, open the Items page, choose the item, then ask me to edit it.'
        : 'To edit an item, open the Items page and click Add Item or edit a product first. To search, just type the product name.'
      )
      return
    }

    const currentName = readField(ids.name)
    const currentPrice = readField(ids.price)
    const currentDescription = readField(ids.description)
    const next: Change[] = []

    if (text.includes('price')) {
      const price = extractNumber(text)
      if (price && price !== currentPrice) next.push({ field: 'price', label: 'Price', current: currentPrice, value: price })
    }

    if (text.includes('name') || text.includes('rename') || text.includes('professional')) {
      const name = makeName(currentName)
      if (name && name.toLowerCase() !== currentName.toLowerCase()) next.push({ field: 'name', label: 'Name', current: currentName, value: name })
    }

    if (text.includes('description') || text.includes('describe') || text.includes('write') || text.includes('better')) {
      const name = next.find(change => change.field === 'name')?.value || currentName
      const description = makeDescription(name)
      if (description !== currentDescription) next.push({ field: 'description', label: 'Description', current: currentDescription, value: description })
    }

    if (!next.length) {
      setMessage('I understood this as an edit, but I need a clearer action. Try “change price to 150” or “write description”.')
      return
    }

    setChanges(next)
    setMessage(`I prepared ${next.length} safe change${next.length === 1 ? '' : 's'}. Review, then apply to the form.`)
  }

  function applyChanges() {
    const ids = getTargetIds()
    if (!ids) return
    changes.forEach(change => {
      if (change.field === 'name') writeField(ids.name, change.value)
      if (change.field === 'price') writeField(ids.price, change.value)
      if (change.field === 'description') writeField(ids.description, change.value)
    })
    document.getElementById(ids.name)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setMessage('Applied to the form. Please review and save manually.')
  }

  return (
    <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 80, maxWidth: 'calc(100vw - 32px)' }}>
      {open ? (
        <div style={{ width: 'min(420px, calc(100vw - 32px))', background: '#fff', border: '1px solid #dbe3ef', borderRadius: 24, boxShadow: '0 20px 55px rgba(15,23,42,.22)', overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ background: '#0f172a', color: '#fff', padding: 16, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <strong>Ask Sedifex</strong>
              <p style={{ margin: '4px 0 0', color: '#cbd5e1', fontSize: 12 }}>Search items or prepare safe product edits.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} style={{ background: 'transparent', border: 0, color: '#fff', fontSize: 20, cursor: 'pointer' }}>x</button>
          </div>
          <div style={{ padding: 16 }}>
            <p style={{ margin: '0 0 10px', fontSize: 12, lineHeight: 1.5, color: '#475569' }}>{helperText}</p>
            <form onSubmit={prepare} style={{ display: 'grid', gap: 10 }}>
              <textarea
                value={command}
                onChange={event => setCommand(event.target.value)}
                placeholder="Search Cream, or type: change price to 150"
                rows={3}
                style={{ width: '100%', borderRadius: 16, border: '1px solid #cbd5e1', padding: 12, font: 'inherit', resize: 'vertical', background: '#ffffff', color: '#0f172a', WebkitTextFillColor: '#0f172a', caretColor: '#4f46e5', opacity: 1 }}
              />
              <button type="submit" style={{ border: 0, borderRadius: 16, padding: '12px 14px', background: '#4f46e5', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Search / prepare edit</button>
            </form>
            <ProductPhotoAssist />
            {message ? <p style={{ margin: '12px 0 0', fontSize: 13, lineHeight: 1.6, color: '#334155' }}>{message}</p> : null}
            {matches.length ? (
              <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                {matches.map(item => (
                  <div key={item.id} style={{ display: 'grid', gridTemplateColumns: item.imageUrl ? '52px 1fr' : '1fr', gap: 10, border: '1px solid #e2e8f0', borderRadius: 14, padding: 10, background: '#f8fafc' }}>
                    {item.imageUrl ? <img src={item.imageUrl} alt={item.name} style={{ width: 52, height: 52, borderRadius: 12, objectFit: 'cover' }} /> : null}
                    <div>
                      <strong style={{ display: 'block', color: '#0f172a', fontSize: 13 }}>{item.name}</strong>
                      <p style={{ margin: '4px 0 0', color: '#475569', fontSize: 12 }}>{formatPrice(item.price)} · {item.category}</p>
                      <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 12 }}>{item.itemType === 'product' ? `Stock: ${item.stockCount ?? 'not set'}` : titleCase(item.itemType)}{item.isMarketplaceVisible ? ' · Marketplace visible' : ''}</p>
                    </div>
                  </div>
                ))}
                {!isProductsPage ? <button type="button" onClick={() => navigate('/products')} style={{ border: 0, borderRadius: 14, padding: 10, background: '#0f172a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Open Items page</button> : null}
              </div>
            ) : null}
            {changes.length ? (
              <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                {changes.map(change => (
                  <div key={change.field} style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 10, background: '#f8fafc' }}>
                    <strong style={{ display: 'block', fontSize: 12, color: '#475569' }}>{change.label}</strong>
                    <p style={{ margin: '6px 0 0', fontSize: 12, color: '#0f172a' }}><b>Current:</b> {change.current || 'Empty'}</p>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#0f172a' }}><b>New:</b> {change.value}</p>
                  </div>
                ))}
                <button type="button" onClick={applyChanges} style={{ border: 0, borderRadius: 14, padding: 10, background: '#0f172a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Apply to form</button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      <button type="button" onClick={() => setOpen(value => !value)} style={{ border: 0, borderRadius: 999, padding: '13px 18px', background: 'linear-gradient(135deg, #38bdf8, #8b5cf6)', color: '#fff', fontWeight: 900, boxShadow: '0 14px 30px rgba(15,23,42,.35)', cursor: 'pointer' }}>Ask Sedifex</button>
    </div>
  )
}
