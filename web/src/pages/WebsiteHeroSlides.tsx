import React, { useEffect, useMemo, useState } from 'react'
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
} from 'firebase/firestore'
import { db } from '../firebase'
import { uploadProductImage } from '../api/productImageUpload'
import { useActiveStore } from '../hooks/useActiveStore'
import { useToast } from '../components/ToastProvider'
import './AccountOverview.css'

type HeroSlideStatus = 'active' | 'draft' | 'paused' | 'expired'
type HeroSlideTextColor = 'light' | 'dark'
type HeroSlideOverlayStyle = 'none' | 'dark' | 'light' | 'gradient'
type HeroSlideLayout = 'left_text' | 'center_text' | 'right_text'
type Tab = 'active' | 'add'

type HeroSlide = {
  id: string
  title: string
  eyebrow: string | null
  subtitle: string | null
  ctaLabel: string | null
  ctaHref: string | null
  secondaryCtaLabel: string | null
  secondaryCtaHref: string | null
  imageUrl: string | null
  imagePath: string | null
  mobileImageUrl: string | null
  placement: 'home_hero'
  status: HeroSlideStatus
  priority: number
  startsAt: string | null
  endsAt: string | null
  accent: string | null
  textColor: HeroSlideTextColor
  overlayStyle: HeroSlideOverlayStyle
  layout: HeroSlideLayout
  createdAt: string
  updatedAt: string
  viewCount: number
  clickCount: number
}

type SlideDraft = {
  id: string
  title: string
  eyebrow: string
  subtitle: string
  ctaLabel: string
  ctaHref: string
  secondaryCtaLabel: string
  secondaryCtaHref: string
  imageUrl: string
  imagePath: string
  mobileImageUrl: string
  status: HeroSlideStatus
  priority: string
  startsAt: string
  endsAt: string
  accent: string
  textColor: HeroSlideTextColor
  overlayStyle: HeroSlideOverlayStyle
  layout: HeroSlideLayout
}

const DEFAULT_PLACEMENT = 'home_hero'
const COLLECTION_NAME = 'websiteHeroSlides'

function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function nullable(value: string) {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeStatus(value: unknown): HeroSlideStatus {
  return value === 'active' || value === 'paused' || value === 'expired' || value === 'draft' ? value : 'draft'
}

function normalizeTextColor(value: unknown): HeroSlideTextColor {
  return value === 'dark' ? 'dark' : 'light'
}

function normalizeOverlayStyle(value: unknown): HeroSlideOverlayStyle {
  return value === 'none' || value === 'light' || value === 'gradient' || value === 'dark' ? value : 'gradient'
}

function normalizeLayout(value: unknown): HeroSlideLayout {
  return value === 'center_text' || value === 'right_text' || value === 'left_text' ? value : 'left_text'
}

function isSlideActive(slide: Pick<HeroSlide, 'status' | 'startsAt' | 'endsAt'>) {
  if (slide.status !== 'active') return false
  const now = Date.now()
  const start = slide.startsAt ? Date.parse(slide.startsAt) : null
  const end = slide.endsAt ? Date.parse(slide.endsAt) : null
  if (start && Number.isFinite(start) && start > now) return false
  if (end && Number.isFinite(end) && end < now) return false
  return true
}

function sortSlides(slides: HeroSlide[]) {
  return [...slides].sort((a, b) => {
    const priority = a.priority - b.priority
    if (priority !== 0) return priority
    return b.updatedAt.localeCompare(a.updatedAt)
  })
}

function safePathSegment(value: string) {
  const cleaned = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned || 'slide'
}

function fileExtension(file: File) {
  const fromName = file.name.match(/\.([a-zA-Z0-9_-]{1,10})$/)?.[0]
  if (fromName) return fromName.toLowerCase()
  if (file.type === 'image/png') return '.png'
  if (file.type === 'image/webp') return '.webp'
  if (file.type === 'image/gif') return '.gif'
  return '.jpg'
}

function emptyDraft(priority = 10): SlideDraft {
  return {
    id: '',
    title: '',
    eyebrow: '',
    subtitle: '',
    ctaLabel: '',
    ctaHref: '',
    secondaryCtaLabel: '',
    secondaryCtaHref: '',
    imageUrl: '',
    imagePath: '',
    mobileImageUrl: '',
    status: 'draft',
    priority: String(priority),
    startsAt: '',
    endsAt: '',
    accent: '#4f46e5',
    textColor: 'light',
    overlayStyle: 'gradient',
    layout: 'left_text',
  }
}

function draftFromSlide(slide: HeroSlide): SlideDraft {
  return {
    id: slide.id,
    title: slide.title,
    eyebrow: slide.eyebrow ?? '',
    subtitle: slide.subtitle ?? '',
    ctaLabel: slide.ctaLabel ?? '',
    ctaHref: slide.ctaHref ?? '',
    secondaryCtaLabel: slide.secondaryCtaLabel ?? '',
    secondaryCtaHref: slide.secondaryCtaHref ?? '',
    imageUrl: slide.imageUrl ?? '',
    imagePath: slide.imagePath ?? '',
    mobileImageUrl: slide.mobileImageUrl ?? '',
    status: slide.status,
    priority: String(slide.priority),
    startsAt: slide.startsAt ? slide.startsAt.slice(0, 16) : '',
    endsAt: slide.endsAt ? slide.endsAt.slice(0, 16) : '',
    accent: slide.accent ?? '#4f46e5',
    textColor: slide.textColor,
    overlayStyle: slide.overlayStyle,
    layout: slide.layout,
  }
}

function normalizeSlide(id: string, data: Record<string, unknown>): HeroSlide {
  return {
    id,
    title: text(data.title),
    eyebrow: nullable(text(data.eyebrow)),
    subtitle: nullable(text(data.subtitle)),
    ctaLabel: nullable(text(data.ctaLabel)),
    ctaHref: nullable(text(data.ctaHref)),
    secondaryCtaLabel: nullable(text(data.secondaryCtaLabel)),
    secondaryCtaHref: nullable(text(data.secondaryCtaHref)),
    imageUrl: nullable(text(data.imageUrl)),
    imagePath: nullable(text(data.imagePath)),
    mobileImageUrl: nullable(text(data.mobileImageUrl)),
    placement: DEFAULT_PLACEMENT,
    status: normalizeStatus(data.status),
    priority: numberValue(data.priority, 10),
    startsAt: nullable(text(data.startsAt)),
    endsAt: nullable(text(data.endsAt)),
    accent: nullable(text(data.accent)),
    textColor: normalizeTextColor(data.textColor),
    overlayStyle: normalizeOverlayStyle(data.overlayStyle),
    layout: normalizeLayout(data.layout),
    createdAt: text(data.createdAt),
    updatedAt: text(data.updatedAt),
    viewCount: numberValue(data.viewCount),
    clickCount: numberValue(data.clickCount),
  }
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span style={{ border: '1px solid rgba(255,255,255,.22)', borderRadius: 999, padding: '6px 10px', background: 'rgba(255,255,255,.08)', color: '#e5e7eb', fontSize: 12, fontWeight: 700 }}>{children}</span>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label><span>{label}</span>{children}</label>
}

export default function WebsiteHeroSlides() {
  const { storeId, isLoading, error } = useActiveStore()
  const { publish } = useToast()
  const [slides, setSlides] = useState<HeroSlide[]>([])
  const [tab, setTab] = useState<Tab>('active')
  const [draft, setDraft] = useState<SlideDraft>(() => emptyDraft())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')

  const sortedSlides = useMemo(() => sortSlides(slides), [slides])
  const activeSlides = useMemo(() => sortedSlides.filter(isSlideActive), [sortedSlides])
  const inactiveSlides = useMemo(() => sortedSlides.filter(slide => !isSlideActive(slide)), [sortedSlides])

  async function loadSlides(activeStoreId: string) {
    setBusy(true)
    setMessage('')
    try {
      const snapshot = await getDocs(collection(db, 'stores', activeStoreId, COLLECTION_NAME))
      setSlides(sortSlides(snapshot.docs.map(slideDoc => normalizeSlide(slideDoc.id, slideDoc.data()))))
    } catch (loadError) {
      console.error('[website-hero-slides] load failed', loadError)
      setMessage('Unable to load website hero slides.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!storeId) return
    void loadSlides(storeId)
  }, [storeId])

  function updateDraft<K extends keyof SlideDraft>(key: K, value: SlideDraft[K]) {
    setDraft(current => ({ ...current, [key]: value }))
  }

  async function uploadImage() {
    if (!storeId || !imageFile) return
    setUploading(true)
    setMessage('')
    try {
      const isEditingExistingSlide = Boolean(editingId && draft.id)
      const slideId = draft.id || `slide-${Date.now()}`
      const filename = `${safePathSegment(draft.title || slideId)}-${Date.now()}${fileExtension(imageFile)}`
      const imagePath = `stores/${storeId}/hero-slides/${slideId}/${filename}`
      const url = await uploadProductImage(imageFile, { storagePath: imagePath })
      const imageUpdate = { imageUrl: url, imagePath, updatedAt: new Date().toISOString() }

      if (isEditingExistingSlide) {
        await setDoc(doc(db, 'stores', storeId, COLLECTION_NAME, slideId), imageUpdate, { merge: true })
        setSlides(current => sortSlides(current.map(slide => slide.id === slideId ? { ...slide, ...imageUpdate } : slide)))
      }

      setDraft(current => ({ ...current, imageUrl: url, imagePath }))
      setImageFile(null)
      publish({
        message: isEditingExistingSlide
          ? 'Hero slide image uploaded and saved. It will remain after refresh.'
          : 'Hero slide image uploaded. Fill the text fields, then save the slide.',
        tone: 'success',
      })
    } catch (uploadError) {
      console.error('[website-hero-slides] upload failed', uploadError)
      setMessage('Unable to upload hero slide image. Try a smaller image.')
    } finally {
      setUploading(false)
    }
  }

  async function saveSlide(event: React.FormEvent) {
    event.preventDefault()
    if (!storeId) return
    const title = draft.title.trim()
    if (!title) {
      setMessage('Add a main title before saving the slide.')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const slideRef = draft.id ? doc(db, 'stores', storeId, COLLECTION_NAME, draft.id) : doc(collection(db, 'stores', storeId, COLLECTION_NAME))
      const now = new Date().toISOString()
      const payload = {
        title,
        eyebrow: nullable(draft.eyebrow),
        subtitle: nullable(draft.subtitle),
        ctaLabel: nullable(draft.ctaLabel),
        ctaHref: nullable(draft.ctaHref),
        secondaryCtaLabel: nullable(draft.secondaryCtaLabel),
        secondaryCtaHref: nullable(draft.secondaryCtaHref),
        imageUrl: nullable(draft.imageUrl),
        imagePath: nullable(draft.imagePath),
        mobileImageUrl: nullable(draft.mobileImageUrl),
        placement: DEFAULT_PLACEMENT,
        status: draft.status,
        priority: numberValue(draft.priority, 10),
        startsAt: nullable(draft.startsAt),
        endsAt: nullable(draft.endsAt),
        accent: nullable(draft.accent),
        textColor: draft.textColor,
        overlayStyle: draft.overlayStyle,
        layout: draft.layout,
        updatedAt: now,
        ...(draft.id ? {} : { createdAt: now, viewCount: 0, clickCount: 0 }),
      }
      await setDoc(slideRef, payload, { merge: true })
      setDraft(emptyDraft(slides.length + 1))
      setEditingId(null)
      setTab('active')
      await loadSlides(storeId)
      publish({ message: 'Website hero slide saved.', tone: 'success' })
    } catch (saveError) {
      console.error('[website-hero-slides] save failed', saveError)
      setMessage('Unable to save website hero slide.')
    } finally {
      setBusy(false)
    }
  }

  async function updateStatus(slide: HeroSlide, status: HeroSlideStatus) {
    if (!storeId) return
    setBusy(true)
    try {
      await setDoc(doc(db, 'stores', storeId, COLLECTION_NAME, slide.id), { status, updatedAt: new Date().toISOString() }, { merge: true })
      await loadSlides(storeId)
      publish({ message: status === 'paused' ? 'Slide paused.' : 'Slide updated.', tone: 'success' })
    } catch (statusError) {
      console.error('[website-hero-slides] status update failed', statusError)
      setMessage('Unable to update slide status.')
    } finally {
      setBusy(false)
    }
  }

  async function removeSlide(slide: HeroSlide) {
    if (!storeId) return
    const shouldDelete = window.confirm('Delete this website hero slide? Choose Cancel if you only want to expire it instead.')
    setBusy(true)
    try {
      if (shouldDelete) {
        await deleteDoc(doc(db, 'stores', storeId, COLLECTION_NAME, slide.id))
        publish({ message: 'Slide deleted.', tone: 'success' })
      } else {
        await setDoc(doc(db, 'stores', storeId, COLLECTION_NAME, slide.id), { status: 'expired', endsAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true })
        publish({ message: 'Slide expired.', tone: 'success' })
      }
      await loadSlides(storeId)
    } catch (deleteError) {
      console.error('[website-hero-slides] delete failed', deleteError)
      setMessage('Unable to delete or expire slide.')
    } finally {
      setBusy(false)
    }
  }

  function beginEdit(slide: HeroSlide) {
    setDraft(draftFromSlide(slide))
    setEditingId(slide.id)
    setTab('add')
  }

  if (error) return <div role="alert">{error}</div>

  return (
    <main className="account-overview">
      <header style={{ borderRadius: 28, background: 'linear-gradient(135deg, #020617 0%, #111827 52%, #4338ca 100%)', color: '#fff', padding: '28px', boxShadow: '0 24px 60px rgba(15,23,42,.24)', marginBottom: 20 }}>
        <p style={{ margin: '0 0 10px', color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '.16em', fontSize: 12, fontWeight: 800 }}>Homepage Slides</p>
        <h1 style={{ margin: 0, fontSize: 'clamp(2rem, 4vw, 3.5rem)', lineHeight: 1 }}>Website Hero Slides</h1>
        <p style={{ maxWidth: 760, color: '#cbd5e1', fontSize: 16, lineHeight: 1.7 }}>Create homepage banners that your connected website can show as a sliding hero section.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 18 }}>
          <Chip>Collection: websiteHeroSlides</Chip>
          <Chip>Placement: home_hero</Chip>
          <Chip>Website API: /v1IntegrationHeroSlides</Chip>
        </div>
      </header>

      {isLoading || busy ? <p>Loading website hero slides…</p> : null}
      {!storeId && !isLoading ? <p>Select a workspace first.</p> : null}
      {message ? <p className="account-overview__error" role="alert">{message}</p> : null}

      {storeId ? (
        <>
          <section className="account-overview__card">
            <div className="account-overview__tabs">
              <button type="button" className={`account-overview__tab ${tab === 'active' ? 'is-active' : ''}`} onClick={() => setTab('active')}>Active Slides</button>
              <button type="button" className={`account-overview__tab ${tab === 'add' ? 'is-active' : ''}`} onClick={() => { setTab('add'); if (!editingId) setDraft(emptyDraft(slides.length + 1)) }}>Add Slide</button>
            </div>
          </section>

          {tab === 'active' ? (
            <section className="account-overview__card">
              <h2>Live homepage slides</h2>
              <p className="account-overview__hint">Active means status is active, the start date has passed, and the end date has not passed. Slides are sorted by priority, then most recent update.</p>
              {activeSlides.length === 0 ? <p className="account-overview__hint">No active homepage slides yet. Open Add Slide to create one.</p> : null}
              <div style={{ display: 'grid', gap: 16 }}>
                {activeSlides.map(slide => (
                  <SlideCard key={slide.id} slide={slide} onEdit={beginEdit} onPause={item => void updateStatus(item, 'paused')} onRemove={item => void removeSlide(item)} />
                ))}
              </div>
              {inactiveSlides.length > 0 ? (
                <details style={{ marginTop: 20 }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 800 }}>Draft, paused, and expired slides ({inactiveSlides.length})</summary>
                  <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
                    {inactiveSlides.map(slide => (
                      <SlideCard key={slide.id} slide={slide} onEdit={beginEdit} onPause={item => void updateStatus(item, 'paused')} onRemove={item => void removeSlide(item)} />
                    ))}
                  </div>
                </details>
              ) : null}
            </section>
          ) : (
            <section className="account-overview__card">
              <h2>{editingId ? 'Edit slide' : 'Add slide'}</h2>
              <p className="account-overview__hint">{editingId ? 'Uploading a replacement image saves it to this slide immediately. Change any text fields, then save the slide.' : 'Step 1: upload the image. Step 2: fill the text fields. Step 3: save the slide.'}</p>
              <form className="account-overview__profile-form" onSubmit={saveSlide}>
                <div style={{ border: '1px dashed #cbd5e1', borderRadius: 18, background: '#f8fafc', padding: 16 }}>
                  <Field label="Upload hero image first">
                    <input type="file" accept="image/*" onChange={event => setImageFile(event.target.files?.[0] ?? null)} />
                  </Field>
                  <button type="button" className="button button--secondary" disabled={!imageFile || uploading} onClick={() => void uploadImage()}>{uploading ? 'Uploading…' : 'Upload image'}</button>
                  <p className="account-overview__hint">Uploads are stored under stores/{storeId}/hero-slides.</p>
                </div>

                {draft.imageUrl ? <img src={draft.imageUrl} alt={draft.title || 'Hero slide preview'} style={{ width: '100%', maxHeight: 320, objectFit: 'cover', borderRadius: 18, border: '1px solid #e5e7eb' }} /> : null}

                <Field label="Image URL"><input type="url" value={draft.imageUrl} onChange={event => updateDraft('imageUrl', event.target.value)} placeholder="Upload an image and the URL fills automatically" /></Field>
                <Field label="Small label / eyebrow"><input value={draft.eyebrow} onChange={event => updateDraft('eyebrow', event.target.value)} placeholder="New collection" /></Field>
                <Field label="Main title"><input value={draft.title} onChange={event => updateDraft('title', event.target.value)} placeholder="Bring your homepage to life" required /></Field>
                <Field label="Subtitle"><textarea rows={4} value={draft.subtitle} onChange={event => updateDraft('subtitle', event.target.value)} placeholder="Short supporting message for the hero banner." /></Field>
                <div className="account-overview__form-grid">
                  <Field label="Button text"><input value={draft.ctaLabel} onChange={event => updateDraft('ctaLabel', event.target.value)} placeholder="Shop now" /></Field>
                  <Field label="Button link"><input value={draft.ctaHref} onChange={event => updateDraft('ctaHref', event.target.value)} placeholder="/products" /></Field>
                  <Field label="Secondary button text"><input value={draft.secondaryCtaLabel} onChange={event => updateDraft('secondaryCtaLabel', event.target.value)} placeholder="Learn more" /></Field>
                  <Field label="Secondary button link"><input value={draft.secondaryCtaHref} onChange={event => updateDraft('secondaryCtaHref', event.target.value)} placeholder="/about" /></Field>
                  <Field label="Accent color"><input value={draft.accent} onChange={event => updateDraft('accent', event.target.value)} placeholder="#4f46e5" /></Field>
                  <Field label="Priority"><input type="number" value={draft.priority} onChange={event => updateDraft('priority', event.target.value)} /></Field>
                  <Field label="Status"><select value={draft.status} onChange={event => updateDraft('status', event.target.value as HeroSlideStatus)}><option value="active">active</option><option value="draft">draft</option><option value="paused">paused</option><option value="expired">expired</option></select></Field>
                  <Field label="Start date"><input type="datetime-local" value={draft.startsAt} onChange={event => updateDraft('startsAt', event.target.value)} /></Field>
                  <Field label="End date"><input type="datetime-local" value={draft.endsAt} onChange={event => updateDraft('endsAt', event.target.value)} /></Field>
                  <Field label="Layout"><select value={draft.layout} onChange={event => updateDraft('layout', event.target.value as HeroSlideLayout)}><option value="left_text">left_text</option><option value="center_text">center_text</option><option value="right_text">right_text</option></select></Field>
                  <Field label="Overlay style"><select value={draft.overlayStyle} onChange={event => updateDraft('overlayStyle', event.target.value as HeroSlideOverlayStyle)}><option value="gradient">gradient</option><option value="dark">dark</option><option value="light">light</option><option value="none">none</option></select></Field>
                  <Field label="Text color"><select value={draft.textColor} onChange={event => updateDraft('textColor', event.target.value as HeroSlideTextColor)}><option value="light">light</option><option value="dark">dark</option></select></Field>
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  {editingId ? <button type="button" className="button button--ghost" onClick={() => { setDraft(emptyDraft(slides.length + 1)); setEditingId(null) }}>Cancel edit</button> : null}
                  <button className="button button--primary" type="submit" disabled={busy || uploading}>{busy ? 'Saving…' : 'Save slide'}</button>
                </div>
              </form>
            </section>
          )}
        </>
      ) : null}
    </main>
  )
}

function SlideCard({ slide, onEdit, onPause, onRemove }: { slide: HeroSlide; onEdit: (slide: HeroSlide) => void; onPause: (slide: HeroSlide) => void; onRemove: (slide: HeroSlide) => void }) {
  const active = isSlideActive(slide)
  return (
    <article style={{ border: '1px solid #e5e7eb', borderRadius: 22, background: active ? '#f8fafc' : '#fff', padding: 16 }}>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', alignItems: 'start' }}>
        <div style={{ minHeight: 190, borderRadius: 18, overflow: 'hidden', background: 'linear-gradient(135deg, #020617, #4338ca)' }}>
          {slide.imageUrl ? <img src={slide.imageUrl} alt={slide.title || 'Hero slide'} style={{ width: '100%', height: 220, objectFit: 'cover', display: 'block' }} /> : <div style={{ color: '#fff', padding: 24, fontWeight: 800 }}>No image uploaded</div>}
        </div>
        <div>
          <p style={{ margin: 0, color: slide.accent || '#4f46e5', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.12em', fontSize: 12 }}>{slide.eyebrow || 'Homepage slide'}</p>
          <h3 style={{ margin: '8px 0', fontSize: 22 }}>{slide.title || 'Untitled slide'}</h3>
          <p className="account-overview__hint">{slide.subtitle || 'No subtitle added.'}</p>
          <p className="account-overview__hint"><strong>Status:</strong> {active ? 'Active' : slide.status} · <strong>Priority:</strong> {slide.priority} · <strong>Layout:</strong> {slide.layout}</p>
          <p className="account-overview__hint"><strong>Schedule:</strong> {slide.startsAt || 'Now'} → {slide.endsAt || 'No end date'}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
            <button type="button" className="button button--secondary" onClick={() => onEdit(slide)}>Edit</button>
            <button type="button" className="button button--ghost" onClick={() => onPause(slide)}>Pause</button>
            <button type="button" className="button button--ghost" onClick={() => onRemove(slide)}>Delete / expire</button>
          </div>
        </div>
      </div>
    </article>
  )
}
