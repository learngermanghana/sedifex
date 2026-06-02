import React, { FormEvent, useState } from 'react'
import { useLocation } from 'react-router-dom'
import ProductPhotoAssist from './ProductPhotoAssist'

type Change = {
  field: 'name' | 'price' | 'description'
  label: string
  current: string
  value: string
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

export default function AskSedifexAgent({ enabled }: { enabled: boolean }) {
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [command, setCommand] = useState('')
  const [message, setMessage] = useState('')
  const [changes, setChanges] = useState<Change[]>([])
  const isProductsPage = location.pathname.startsWith('/products') || location.pathname.startsWith('/items')

  if (!enabled) return null

  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const ids = getTargetIds()
    const text = command.trim().toLowerCase()
    setChanges([])

    if (!isProductsPage) {
      setMessage('This first Ask Sedifex release only works on the Products page.')
      return
    }
    if (!ids) {
      setMessage('Open Add Item or edit a product first, then ask again.')
      return
    }
    if (!text) {
      setMessage('Type what you want Sedifex to change first.')
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
      setMessage('I could not prepare a safe edit. Try: change price to 150, make name professional, or write description.')
      return
    }

    setChanges(next)
    setMessage(`I prepared ${next.length} safe change${next.length === 1 ? '' : 's'}. Review before applying.`)
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
        <div style={{ width: 'min(400px, calc(100vw - 32px))', background: '#fff', border: '1px solid #dbe3ef', borderRadius: 24, boxShadow: '0 20px 55px rgba(15,23,42,.22)', overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ background: '#0f172a', color: '#fff', padding: 16, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <strong>Ask Sedifex</strong>
              <p style={{ margin: '4px 0 0', color: '#cbd5e1', fontSize: 12 }}>Product Agent: name, price, description, and image.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} style={{ background: 'transparent', border: 0, color: '#fff', fontSize: 20, cursor: 'pointer' }}>x</button>
          </div>
          <div style={{ padding: 16 }}>
            <form onSubmit={prepare} style={{ display: 'grid', gap: 10 }}>
              <textarea
                value={command}
                onChange={event => setCommand(event.target.value)}
                placeholder="Tell Sedifex what to change..."
                rows={3}
                style={{ width: '100%', borderRadius: 16, border: '1px solid #cbd5e1', padding: 12, font: 'inherit', resize: 'vertical', background: '#ffffff', color: '#0f172a', WebkitTextFillColor: '#0f172a', caretColor: '#4f46e5', opacity: 1 }}
              />
              <button type="submit" style={{ border: 0, borderRadius: 16, padding: '12px 14px', background: '#4f46e5', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Prepare edit</button>
            </form>
            <ProductPhotoAssist />
            {message ? <p style={{ margin: '12px 0 0', fontSize: 13, lineHeight: 1.6, color: '#334155' }}>{message}</p> : null}
            {changes.length ? (
              <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                {changes.map(change => (
                  <div key={change.field} style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 10, background: '#f8fafc' }}>
                    <strong style={{ display: 'block', fontSize: 12, color: '#475569' }}>{change.label}</strong>
                    <p style={{ margin: '6px 0 0', fontSize: 12 }}><b>Current:</b> {change.current || 'Empty'}</p>
                    <p style={{ margin: '4px 0 0', fontSize: 12 }}><b>New:</b> {change.value}</p>
                  </div>
                ))}
                <button type="button" onClick={applyChanges} style={{ border: 0, borderRadius: 14, padding: 10, background: '#0f172a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Apply to form</button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      <button type="button" onClick={() => setOpen(value => !value)} style={{ border: 0, borderRadius: 999, padding: '13px 18px', background: '#0f172a', color: '#fff', fontWeight: 800, boxShadow: '0 14px 30px rgba(15,23,42,.25)', cursor: 'pointer' }}>Ask Sedifex</button>
    </div>
  )
}
