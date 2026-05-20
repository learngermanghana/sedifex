import { useEffect, useMemo, useRef, useState } from 'react'
import './BlogPage.css'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import { requestAiAdvisor } from '../api/aiAdvisor'
import { ProductImageUploadError, uploadProductImage } from '../api/productImageUpload'

const BLOG_AUTOSAVE_VERSION = 1
const BLOG_AUTOSAVE_DELAY_MS = 4000

type CatalogItem = {
  id: string
  name: string
  itemType: 'product' | 'service' | 'course'
  price: number | null
  description: string | null
  imageUrl: string | null
}

type BlogPost = {
  id: string
  title: string
  slug: string
  excerpt: string | null
  content: string
  metaTitle: string | null
  metaDescription: string | null
  canonicalUrl: string | null
  ogImage: string | null
  tags: string[]
  publishAt: string | null
  linkUrl: string | null
  imageUrl: string | null
  status: 'draft' | 'published' | 'scheduled' | 'archived'
  updatedAt: string | null
}

type BlogAutoSaveDraft = {
  version: number
  editingPostId: string | null
  title: string
  content: string
  metaTitle: string
  metaDescription: string
  publishAt: string
  status: 'draft' | 'published' | 'scheduled'
  selectedCatalogItemId: string
  imageUrl: string | null
  customImageSelected: boolean
  selectedFileName: string | null
  updatedAt: number
}

function formatPastedContent(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(block => block.split('\n').map(line => line.trim()).filter(Boolean).join(' '))
    .filter(Boolean)
    .join('\n\n')
}

function makeSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function getCatalogImageUrl(data: Record<string, unknown>): string | null {
  const imageCandidates = [data.imageUrl, data.image_url, data.image, data.thumbnail, data.photo1, data.photo_1]
  for (const candidate of imageCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  const imageArrays = [data.imageUrls, data.images, data.gallery, data.photos]
  for (const value of imageArrays) {
    if (!Array.isArray(value)) continue
    const firstImage = value.find((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    if (firstImage) return firstImage.trim()
  }
  return null
}

function getBlogAutoSaveKey(storeId: string): string {
  return `sedifex:blog-editor-draft:${storeId}`
}

function isValidAutoSaveStatus(value: unknown): value is BlogAutoSaveDraft['status'] {
  return value === 'draft' || value === 'published' || value === 'scheduled'
}

function hasAutoSaveContent(draft: Pick<BlogAutoSaveDraft, 'title' | 'content' | 'metaTitle' | 'metaDescription' | 'publishAt' | 'selectedCatalogItemId' | 'imageUrl'>): boolean {
  return Boolean(
    draft.title.trim() ||
      draft.content.trim() ||
      draft.metaTitle.trim() ||
      draft.metaDescription.trim() ||
      draft.publishAt.trim() ||
      draft.selectedCatalogItemId.trim() ||
      draft.imageUrl,
  )
}

function readAutoSavedDraft(storeId: string): BlogAutoSaveDraft | null {
  try {
    const raw = window.localStorage.getItem(getBlogAutoSaveKey(storeId))
    if (!raw) return null
    const draft = JSON.parse(raw) as Partial<BlogAutoSaveDraft>
    if (draft.version !== BLOG_AUTOSAVE_VERSION) return null
    if (!isValidAutoSaveStatus(draft.status)) return null

    return {
      version: BLOG_AUTOSAVE_VERSION,
      editingPostId: typeof draft.editingPostId === 'string' ? draft.editingPostId : null,
      title: typeof draft.title === 'string' ? draft.title : '',
      content: typeof draft.content === 'string' ? draft.content : '',
      metaTitle: typeof draft.metaTitle === 'string' ? draft.metaTitle : '',
      metaDescription: typeof draft.metaDescription === 'string' ? draft.metaDescription : '',
      publishAt: typeof draft.publishAt === 'string' ? draft.publishAt : '',
      status: draft.status,
      selectedCatalogItemId: typeof draft.selectedCatalogItemId === 'string' ? draft.selectedCatalogItemId : '',
      imageUrl: typeof draft.imageUrl === 'string' && draft.imageUrl.trim() ? draft.imageUrl : null,
      customImageSelected: draft.customImageSelected === true,
      selectedFileName: typeof draft.selectedFileName === 'string' && draft.selectedFileName.trim() ? draft.selectedFileName : null,
      updatedAt: typeof draft.updatedAt === 'number' ? draft.updatedAt : Date.now(),
    }
  } catch {
    return null
  }
}

function saveAutoSavedDraft(storeId: string, draft: BlogAutoSaveDraft): void {
  try {
    if (!hasAutoSaveContent(draft)) {
      window.localStorage.removeItem(getBlogAutoSaveKey(storeId))
      return
    }
    window.localStorage.setItem(getBlogAutoSaveKey(storeId), JSON.stringify(draft))
  } catch {
    // Local storage may be unavailable or full. Ignore so the editor remains usable.
  }
}

function clearAutoSavedDraft(storeId: string): void {
  try {
    window.localStorage.removeItem(getBlogAutoSaveKey(storeId))
  } catch {
    // Ignore local storage errors.
  }
}

export default function BlogPage() {
  const { storeId } = useActiveStore()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [metaTitle, setMetaTitle] = useState('')
  const [metaDescription, setMetaDescription] = useState('')
  const [publishAt, setPublishAt] = useState('')
  const [status, setStatus] = useState<'draft' | 'published' | 'scheduled'>('draft')
  const [saving, setSaving] = useState(false)
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [editingPostId, setEditingPostId] = useState<string | null>(null)
  const [isAiGenerating, setIsAiGenerating] = useState(false)
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([])
  const [selectedCatalogItemId, setSelectedCatalogItemId] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [customImageSelected, setCustomImageSelected] = useState(false)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const [uploadStatus, setUploadStatus] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [autoSaveReady, setAutoSaveReady] = useState(false)
  const [autoSaveMessage, setAutoSaveMessage] = useState<string | null>(null)
  const [dailyShareEnabled, setDailyShareEnabled] = useState(false)

  async function loadPosts() {
    if (!storeId) return
    const q = query(collection(db, 'blogPosts'), where('storeId', '==', storeId), orderBy('updatedAt', 'desc'), limit(50))
    const snap = await getDocs(q)
    setPosts(
      snap.docs.map(d => {
        const data = d.data() as Record<string, unknown>
        return {
          id: d.id,
          title: String(data.title ?? ''),
          slug: String(data.slug ?? ''),
          excerpt: typeof data.excerpt === 'string' ? data.excerpt : null,
          content: String(data.content ?? ''),
          metaTitle: typeof data.metaTitle === 'string' ? data.metaTitle : null,
          metaDescription: typeof data.metaDescription === 'string' ? data.metaDescription : null,
          canonicalUrl: typeof data.canonicalUrl === 'string' ? data.canonicalUrl : null,
          ogImage: typeof data.ogImage === 'string' ? data.ogImage : null,
          tags: Array.isArray(data.tags) ? data.tags.filter((item): item is string => typeof item === 'string') : [],
          publishAt: typeof data.publishAt?.toDate === 'function' ? data.publishAt.toDate().toISOString().slice(0, 16) : null,
          linkUrl: typeof data.linkUrl === 'string' ? data.linkUrl : null,
          imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : typeof data.ogImage === 'string' ? data.ogImage : null,
          status: data.status === 'published' || data.status === 'scheduled' || data.status === 'archived' ? data.status : 'draft',
          updatedAt: typeof data.updatedAt?.toDate === 'function' ? data.updatedAt.toDate().toLocaleString() : null,
        }
      }),
    )
  }

  useEffect(() => {
    void loadPosts()
  }, [storeId])

  useEffect(() => {
    setAutoSaveReady(false)
    setAutoSaveMessage(null)
    if (!storeId) return

    const draft = readAutoSavedDraft(storeId)
    if (draft && hasAutoSaveContent(draft)) {
      setEditingPostId(draft.editingPostId)
      setTitle(draft.title)
      setContent(draft.content)
      setMetaTitle(draft.metaTitle)
      setMetaDescription(draft.metaDescription)
      setPublishAt(draft.publishAt)
      setStatus(draft.status)
      setSelectedCatalogItemId(draft.selectedCatalogItemId)
      setImageUrl(draft.imageUrl)
      setCustomImageSelected(draft.customImageSelected)
      setSelectedFileName(draft.selectedFileName)
      setAutoSaveMessage(`Recovered auto-saved draft from ${new Date(draft.updatedAt).toLocaleString()}.`)
    }

    setAutoSaveReady(true)
  }, [storeId])

  useEffect(() => {
    if (!storeId || !autoSaveReady || saving || uploadingImage) return undefined

    const draft: BlogAutoSaveDraft = {
      version: BLOG_AUTOSAVE_VERSION,
      editingPostId,
      title,
      content,
      metaTitle,
      metaDescription,
      publishAt,
      status,
      selectedCatalogItemId,
      imageUrl,
      customImageSelected,
      selectedFileName,
      updatedAt: Date.now(),
    }

    const timeoutId = window.setTimeout(() => {
      saveAutoSavedDraft(storeId, draft)
      if (hasAutoSaveContent(draft)) {
        setAutoSaveMessage(`Auto-saved ${new Date(draft.updatedAt).toLocaleTimeString()}.`)
      } else {
        setAutoSaveMessage(null)
      }
    }, BLOG_AUTOSAVE_DELAY_MS)

    return () => window.clearTimeout(timeoutId)
  }, [
    storeId,
    autoSaveReady,
    saving,
    uploadingImage,
    editingPostId,
    title,
    content,
    metaTitle,
    metaDescription,
    publishAt,
    status,
    selectedCatalogItemId,
    imageUrl,
    customImageSelected,
    selectedFileName,
  ])

  useEffect(() => {
    async function loadAutomationSettings() {
      if (!storeId) {
        setDailyShareEnabled(false)
        return
      }
      const settingsSnap = await getDoc(doc(db, 'storeSettings', storeId))
      const data = settingsSnap.data() as Record<string, unknown> | undefined
      const blogAutomation = (data?.blogAutomation ?? {}) as Record<string, unknown>
      setDailyShareEnabled(blogAutomation.dailyProductShareEnabled === true)
    }
    void loadAutomationSettings()
  }, [storeId])

  async function saveDailyShareSetting() {
    if (!storeId) return
    await setDoc(
      doc(db, 'storeSettings', storeId),
      { blogAutomation: { dailyProductShareEnabled: dailyShareEnabled, updatedAt: serverTimestamp() } },
      { merge: true },
    )
    setMessage('Daily featured product sharing preference saved.')
  }

  useEffect(() => {
    async function loadCatalogItems() {
      if (!storeId) {
        setCatalogItems([])
        setSelectedCatalogItemId('')
        return
      }
      const q = query(collection(db, 'products'), where('storeId', '==', storeId), orderBy('name', 'asc'), limit(200))
      const snap = await getDocs(q)
      const rows: CatalogItem[] = snap.docs.map(docSnap => {
        const data = docSnap.data() as Record<string, unknown>
        return {
          id: docSnap.id,
          name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Untitled item',
          itemType: data.itemType === 'course' ? 'course' : data.itemType === 'service' ? 'service' : 'product',
          price: typeof data.price === 'number' && Number.isFinite(data.price) ? data.price : null,
          description: typeof data.description === 'string' && data.description.trim() ? data.description.trim() : null,
          imageUrl: getCatalogImageUrl(data),
        }
      })
      setCatalogItems(rows)
      setSelectedCatalogItemId(current => (current && rows.some(item => item.id === current) ? current : ''))
    }

    void loadCatalogItems()
  }, [storeId])

  const selectedCatalogItem = useMemo(
    () => catalogItems.find(item => item.id === selectedCatalogItemId) ?? null,
    [catalogItems, selectedCatalogItemId],
  )

  useEffect(() => {
    if (!selectedCatalogItem || customImageSelected) return
    if (selectedCatalogItem.imageUrl) {
      setImageUrl(selectedCatalogItem.imageUrl)
      setSelectedFileName(null)
      setUploadStatus(`Using ${selectedCatalogItem.name} image for this post.`)
      return
    }
    setImageUrl(null)
    setUploadStatus(`${selectedCatalogItem.name} has no product image yet. You can browse and add one manually.`)
  }, [selectedCatalogItem, customImageSelected])

  async function handleBrowseImage(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setUploadStatus('Please choose a valid image file.')
      return
    }

    setSelectedFileName(file.name)
    setCustomImageSelected(true)
    setImageUrl(null)
    setUploadingImage(true)
    setUploadStatus(`Uploading image: ${file.name}`)

    try {
      const uploadedUrl = await uploadProductImage(file, {
        storagePath: storeId ? `stores/${storeId}/blog` : 'blog',
      })
      setImageUrl(uploadedUrl)
      setUploadStatus(`Image uploaded: ${file.name}`)
    } catch (error) {
      setCustomImageSelected(false)
      setSelectedFileName(null)
      setImageUrl(selectedCatalogItem?.imageUrl ?? null)
      setUploadStatus(
        error instanceof ProductImageUploadError || error instanceof Error
          ? error.message
          : 'Could not upload image.',
      )
      if (fileInputRef.current) fileInputRef.current.value = ''
    } finally {
      setUploadingImage(false)
    }
  }

  function clearFeaturedImage() {
    setImageUrl(null)
    setSelectedFileName(null)
    setCustomImageSelected(false)
    setUploadStatus(selectedCatalogItem?.imageUrl ? `Using ${selectedCatalogItem.name} image for this post.` : null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (selectedCatalogItem?.imageUrl) setImageUrl(selectedCatalogItem.imageUrl)
  }

  function discardAutoSavedDraft() {
    if (!storeId) return
    clearAutoSavedDraft(storeId)
    setTitle('')
    setContent('')
    setMetaTitle('')
    setMetaDescription('')
    setPublishAt('')
    setStatus('draft')
    setSelectedCatalogItemId('')
    setImageUrl(null)
    setCustomImageSelected(false)
    setSelectedFileName(null)
    setEditingPostId(null)
    setAutoSaveMessage('Auto-saved draft cleared.')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function generateBlogWithAi() {
    if (!storeId) return
    setIsAiGenerating(true)
    setMessage(null)
    try {
      const itemContext = selectedCatalogItem
        ? [
            `Featured ${selectedCatalogItem.itemType}: ${selectedCatalogItem.name}.`,
            selectedCatalogItem.price != null ? `Price: GHS ${selectedCatalogItem.price.toFixed(2)}.` : null,
            selectedCatalogItem.description ? `Details: ${selectedCatalogItem.description}.` : null,
            selectedCatalogItem.imageUrl ? 'This item has an image; use it as the post image.' : null,
            'Use this item naturally in the post.',
          ]
            .filter(Boolean)
            .join(' ')
        : null

      const recentTitles = posts
        .slice(0, 8)
        .map(post => post.title.trim())
        .filter(Boolean)
      const strategy = [
        'Do not keep repeating "new arrivals" unless the user explicitly asks for it.',
        'Pick one fresh angle such as: how-to/use tips, customer story, seasonal advice, bundle offer, product comparison, FAQ, or behind-the-scenes.',
        'Make the title specific and different from recent titles.',
      ].join(' ')

      const prompt = [
        'Write a clear blog post for a retail store website in simple language.',
        `Working title: ${title.trim() || 'Helpful Product Spotlight and Tips'}.`,
        strategy,
        recentTitles.length ? `Recent titles to avoid repeating: ${recentTitles.join(' | ')}` : null,
        itemContext,
        'Return this format exactly:',
        'TITLE: <post title>',
        'CONTENT: <blog post body with paragraphs>',
      ]
        .filter(Boolean)
        .join('\n')
      const result = await requestAiAdvisor({ question: prompt, storeId })
      const advice = result.advice || ''
      const titleMatch = advice.match(/TITLE:\s*([\s\S]*?)(?:\nCONTENT:|$)/i)
      const contentMatch = advice.match(/CONTENT:\s*([\s\S]*)$/i)
      const nextTitle = titleMatch?.[1]?.trim() || title.trim()
      const nextContent = contentMatch?.[1]?.trim() || advice.trim()
      if (nextTitle) setTitle(nextTitle)
      if (nextContent) setContent(nextContent)

      if (!metaTitle.trim()) setMetaTitle(nextTitle || title.trim())
      if (!metaDescription.trim()) {
        const firstParagraph = nextContent.split(/\n\s*\n/)[0] || nextContent
        const compact = firstParagraph.replace(/\s+/g, ' ').trim()
        setMetaDescription(compact.slice(0, 155))
      }

      setMessage('AI draft generated. Empty metadata fields were auto-filled. Review before saving.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not generate blog draft.')
    } finally {
      setIsAiGenerating(false)
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!storeId) return
    if (uploadingImage) {
      setMessage('Please wait until the image upload finishes before saving the post.')
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const slug = makeSlug(title)
      const featuredImageUrl = imageUrl || selectedCatalogItem?.imageUrl || null
      const payload = {
        storeId,
        title: title.trim(),
        slug,
        excerpt: null,
        content: content.trim(),
        metaTitle: metaTitle.trim() || title.trim() || null,
        metaDescription: metaDescription.trim() || content.trim().replace(/\s+/g, ' ').slice(0, 155) || null,
        canonicalUrl: null,
        ogImage: featuredImageUrl,
        tags: [],
        publishAt: publishAt ? new Date(publishAt) : null,
        linkUrl: null,
        imageUrl: featuredImageUrl,
        imageSource: customImageSelected ? 'custom_upload' : selectedCatalogItem ? 'catalog_item' : 'none',
        featuredItemId: selectedCatalogItem?.id ?? null,
        featuredItemName: selectedCatalogItem?.name ?? null,
        featuredItemType: selectedCatalogItem?.itemType ?? null,
        status,
        publishedAt: status === 'published' ? serverTimestamp() : null,
        updatedAt: serverTimestamp(),
      }

      if (editingPostId) await updateDoc(doc(db, 'blogPosts', editingPostId), payload)
      else await addDoc(collection(db, 'blogPosts'), { ...payload, createdAt: serverTimestamp() })

      clearAutoSavedDraft(storeId)
      setTitle('')
      setContent('')
      setMetaTitle('')
      setMetaDescription('')
      setPublishAt('')
      setStatus('draft')
      setImageUrl(null)
      setCustomImageSelected(false)
      setSelectedFileName(null)
      setAutoSaveMessage(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setEditingPostId(null)
      setMessage(editingPostId ? 'Post updated.' : 'Post saved.')
      await loadPosts()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save post.')
    } finally {
      setSaving(false)
    }
  }

  function editPost(post: BlogPost) {
    setEditingPostId(post.id)
    setTitle(post.title)
    setContent(post.content)
    setMetaTitle(post.metaTitle ?? '')
    setMetaDescription(post.metaDescription ?? '')
    setPublishAt(post.publishAt ?? '')
    setStatus(post.status === 'archived' ? 'draft' : post.status)
    setImageUrl(post.imageUrl ?? post.ogImage ?? null)
    setCustomImageSelected(false)
    setSelectedFileName(null)
    setAutoSaveMessage(null)
  }

  async function archivePost(postId: string) {
    await updateDoc(doc(db, 'blogPosts', postId), { status: 'archived', updatedAt: serverTimestamp() })
    await loadPosts()
  }

  async function permanentlyDeletePost(postId: string) {
    await deleteDoc(doc(db, 'blogPosts', postId))
    await loadPosts()
  }

  async function publishPost(postId: string) {
    await updateDoc(doc(db, 'blogPosts', postId), { status: 'published', publishedAt: serverTimestamp(), updatedAt: serverTimestamp() })
    await loadPosts()
  }

  return (
    <main className="page">
      <section className="blog-page">
        <header className="card blog-page__header">
          <div className="blog-page__title">
            <h1>Blog</h1>
            <p>Write updates and publish polished posts for your public audience.</p>
          </div>
          <div className="blog-page__top-actions">
            <div className="blog-page__image-panel">
              <div>
                <strong>Featured image</strong>
                <p>Product images are used automatically. Browse only when you want to override it.</p>
              </div>
              <input
                ref={fileInputRef}
                className="blog-page__file-input"
                type="file"
                accept="image/*"
                onChange={event => void handleBrowseImage(event.currentTarget.files?.[0])}
              />
              <div className="blog-page__image-actions">
                <button type="button" className="button button--ghost" onClick={() => fileInputRef.current?.click()} disabled={uploadingImage}>
                  {uploadingImage ? 'Uploading…' : 'Browse image'}
                </button>
                {imageUrl ? (
                  <button type="button" className="button button--ghost" onClick={clearFeaturedImage} disabled={uploadingImage}>
                    Clear image
                  </button>
                ) : null}
              </div>
              {selectedFileName ? <p className="blog-page__upload-status">File: {selectedFileName}</p> : null}
              {uploadStatus ? <p className="blog-page__upload-status">{uploadStatus}</p> : null}
              {imageUrl ? <img className="blog-page__image-preview" src={imageUrl} alt="Selected blog featured preview" /> : null}
            </div>
          </div>
        </header>

        <div className="blog-page__content">
          <article className="card blog-page__editor">
            <form className="blog-page__editor-form" onSubmit={onSubmit}>
              <label className="stack">
                <span>Title</span>
                <input value={title} onChange={e => setTitle(e.target.value)} required minLength={5} />
              </label>

              <label className="stack">
                <span>Featured product or service (optional)</span>
                <select value={selectedCatalogItemId} onChange={e => { setCustomImageSelected(false); setSelectedFileName(null); setSelectedCatalogItemId(e.target.value) }}>
                  <option value="">Select from your products/services</option>
                  {catalogItems.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.itemType}){item.imageUrl ? ' — image available' : ' — no image'}
                    </option>
                  ))}
                </select>
              </label>

              <label className="stack">
                <span>Post content</span>
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  onPaste={event => {
                    const pasted = event.clipboardData.getData('text')
                    if (!pasted) return
                    event.preventDefault()
                    const formatted = formatPastedContent(pasted)
                    const el = event.currentTarget
                    const next = `${content.slice(0, el.selectionStart)}${formatted}${content.slice(el.selectionEnd)}`
                    setContent(next)
                  }}
                  rows={18}
                  required
                />
              </label>

              <label className="stack">
                <span>Meta title</span>
                <input value={metaTitle} onChange={e => setMetaTitle(e.target.value)} maxLength={120} />
              </label>

              <label className="stack">
                <span>Meta description</span>
                <textarea value={metaDescription} onChange={e => setMetaDescription(e.target.value)} rows={3} maxLength={320} />
              </label>

              <div className="blog-page__meta-grid">
                <label className="stack"><span>Publish at</span><input type="datetime-local" value={publishAt} onChange={e => setPublishAt(e.target.value)} /></label>
                <label className="stack">
                  <span>Status</span>
                  <select value={status} onChange={e => setStatus(e.target.value as 'draft' | 'published' | 'scheduled')}>
                    <option value="draft">Draft</option>
                    <option value="published">Publish now</option>
                    <option value="scheduled">Scheduled</option>
                  </select>
                </label>
              </div>

              <div className="blog-page__toolbar blog-page__toolbar--actions">
                <label className="blog-page__toggle">
                  <input type="checkbox" checked={dailyShareEnabled} onChange={e => setDailyShareEnabled(e.target.checked)} />
                  <span>Auto-publish one product daily (opt-in)</span>
                </label>
                <button type="button" className="button button--ghost" onClick={() => void saveDailyShareSetting()} disabled={!storeId || saving || uploadingImage}>
                  Save daily share setting
                </button>
                <button type="button" className="button button--ghost" onClick={() => void generateBlogWithAi()} disabled={isAiGenerating || saving || uploadingImage || !storeId}>
                  {isAiGenerating ? 'Generating…' : 'Generate with A.I'}
                </button>
                <button type="button" className="button button--ghost" onClick={discardAutoSavedDraft} disabled={!storeId || saving || uploadingImage}>
                  Clear draft
                </button>
                <button type="submit" disabled={saving || uploadingImage || !storeId}>{saving ? 'Saving…' : uploadingImage ? 'Uploading image…' : editingPostId ? 'Update Post' : 'Save Post'}</button>
              </div>
            </form>
            {autoSaveMessage ? <p className="blog-page__upload-status">{autoSaveMessage}</p> : null}
            {message ? <p>{message}</p> : null}
          </article>
        </div>

        <section className="card blog-page__posts">
          <div className="blog-page__searchbar">
            <h2 style={{ margin: 0 }}>Posts</h2>
            <input placeholder="Search and filters coming soon" disabled />
          </div>
          <ul className="blog-page__list">
            {posts.map(post => (
              <li key={post.id} className="blog-post-item">
                <div className="blog-post-item__top">
                  {post.imageUrl ? <img className="blog-post-item__image" src={post.imageUrl} alt={post.title} /> : null}
                  <div>
                    <h3 className="blog-post-item__title">{post.title}</h3>
                    <div className="blog-post-item__meta">
                      <span className="blog-status-badge" data-status={post.status}>{post.status}</span>
                      {post.slug ? <span className="blog-post-item__slug">/{post.slug}</span> : null}
                      {post.updatedAt ? <span>Updated {post.updatedAt}</span> : null}
                    </div>
                  </div>
                  <div className="blog-post-item__actions">
                    {post.status !== 'published' ? <button className="button button--ghost" onClick={() => void publishPost(post.id)}>Publish</button> : null}
                    <button onClick={() => editPost(post)}>Edit</button>
                    <button className="button button--ghost" onClick={() => void archivePost(post.id)}>Archive</button>
                    <button className="button button--ghost button--danger-subtle" onClick={() => void permanentlyDeletePost(post.id)}>Delete</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  )
}
