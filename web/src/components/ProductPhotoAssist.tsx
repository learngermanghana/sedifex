import React, { useState } from 'react'
import { uploadProductImage as sendPhoto } from '../api/productImageUpload'

function setFieldValue(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function findPhotoUrlField() {
  const addIds = ['add-image-url', 'add-image-url-2', 'add-image-url-3']
  for (const id of addIds) {
    const field = document.getElementById(id)
    if (field instanceof HTMLInputElement && !field.value.trim()) return field
  }

  const urlFields = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="url"]'))
  return urlFields.find(field => `${field.id} ${field.placeholder}`.toLowerCase().includes('image')) ?? null
}

export default function ProductPhotoAssist() {
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleApply() {
    if (!file) {
      setStatus('Choose a product image first.')
      return
    }

    const target = findPhotoUrlField()
    if (!target) {
      setStatus('Open Add Item or edit a product so I can place the image.')
      return
    }

    setBusy(true)
    setStatus('Uploading image...')
    try {
      const url = await sendPhoto(file)
      setFieldValue(target, url)
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setFile(null)
      setStatus('Image uploaded and placed in the product image field. Review and save manually.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Image upload failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: 12, border: '1px solid #e2e8f0', borderRadius: 16, padding: 12, background: '#f8fafc' }}>
      <strong style={{ display: 'block', fontSize: 13, color: '#0f172a' }}>Product image</strong>
      <input
        type="file"
        accept="image/*"
        onChange={event => setFile(event.target.files?.[0] ?? null)}
        style={{ marginTop: 8, width: '100%' }}
      />
      <button
        type="button"
        onClick={() => void handleApply()}
        disabled={busy}
        style={{ marginTop: 8, border: 0, borderRadius: 14, padding: '10px 12px', background: '#059669', color: '#fff', fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1 }}
      >
        {busy ? 'Uploading image...' : 'Upload image to form'}
      </button>
      {status ? <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.5, color: '#334155' }}>{status}</p> : null}
    </div>
  )
}
