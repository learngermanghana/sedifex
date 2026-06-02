import React, { useState } from 'react'

export default function ProductPhotoAssist() {
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState('')

  function handleApply() {
    if (!file) {
      setStatus('Choose a product image first.')
      return
    }
    setStatus('Image helper is ready. Upload wiring comes next.')
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
        onClick={handleApply}
        style={{ marginTop: 8, border: 0, borderRadius: 14, padding: '10px 12px', background: '#059669', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
      >
        Upload image to form
      </button>
      {status ? <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.5, color: '#334155' }}>{status}</p> : null}
    </div>
  )
}
