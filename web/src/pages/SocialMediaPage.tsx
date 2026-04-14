import { useEffect, useMemo, useState } from 'react'
import { FirebaseError } from 'firebase/app'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import PageSection from '../layout/PageSection'
import { useActiveStore } from '../hooks/useActiveStore'
import { useToast } from '../components/ToastProvider'
import { requestSocialPost, type GenerateSocialPostResponse, type SocialPlatform } from '../api/socialPost'
import type { Product } from '../types/product'

type ProductOption = {
  id: string
  name: string
  category: string | null
  description: string | null
  price: number | null
  imageUrl: string | null
  itemType: Product['itemType']
}

type RegenerateTarget = 'all' | 'caption' | 'hashtags' | 'cta'
type CopyTarget = 'caption' | 'hashtags' | 'full'
type ContentTone = 'standard' | 'playful' | 'professional'
type ContentLength = 'short' | 'medium' | 'long'
type SocialHistoryEntry = {
  id: string
  createdAtIso: string
  platform: SocialPlatform
  productId: string | null
  productName: string
  post: GenerateSocialPostResponse['post']
}

function getCallableErrorMessage(error: unknown): string | null {
  if (!(error instanceof FirebaseError)) return null

  const callableError = error as FirebaseError & {
    customData?: {
      body?: {
        error?: {
          message?: unknown
        }
      }
    }
  }

  const bodyMessage = callableError.customData?.body?.error?.message
  if (typeof bodyMessage === 'string' && bodyMessage.trim()) {
    return bodyMessage.trim()
  }

  const rawMessage = typeof error.message === 'string' ? error.message : ''
  const normalized = rawMessage.replace(/^Firebase:\s*/i, '').trim()
  if (!normalized) return null

  const colonIndex = normalized.indexOf(':')
  return colonIndex >= 0 ? normalized.slice(colonIndex + 1).trim() : normalized
}

function mapProduct(id: string, raw: Record<string, unknown>): ProductOption {
  return {
    id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Untitled item',
    category: typeof raw.category === 'string' ? raw.category.trim() : null,
    description: typeof raw.description === 'string' ? raw.description.trim() : null,
    price: typeof raw.price === 'number' && Number.isFinite(raw.price) ? raw.price : null,
    imageUrl: typeof raw.imageUrl === 'string' && raw.imageUrl.trim() ? raw.imageUrl.trim() : null,
    itemType: raw.itemType === 'service' || raw.itemType === 'made_to_order' ? raw.itemType : 'product',
  }
}

export default function SocialMediaPage() {
  const { storeId } = useActiveStore()
  const { publish } = useToast()
  const [products, setProducts] = useState<ProductOption[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [platform, setPlatform] = useState<SocialPlatform>('instagram')
  const [tone, setTone] = useState<ContentTone>('standard')
  const [lengthPreset, setLengthPreset] = useState<ContentLength>('medium')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GenerateSocialPostResponse | null>(null)
  const [inlineError, setInlineError] = useState<string | null>(null)
  const [productLoadError, setProductLoadError] = useState<string | null>(null)
  const [history, setHistory] = useState<SocialHistoryEntry[]>([])
  const [productSearchTerm, setProductSearchTerm] = useState('')

  useEffect(() => {
    if (!storeId) {
      setProducts([])
      setSelectedId('')
      setProductLoadError(null)
      return
    }

    const productsQuery = query(collection(db, 'products'), where('storeId', '==', storeId))

    const unsubscribe = onSnapshot(
      productsQuery,
      snapshot => {
        const rows = snapshot.docs.map(entry => mapProduct(entry.id, entry.data() as Record<string, unknown>))
        const sorted = rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
        setProducts(sorted)
        setSelectedId(current => (current && sorted.some(item => item.id === current) ? current : sorted[0]?.id ?? ''))
        setProductSearchTerm(current => current.trim())
        setProductLoadError(null)
      },
      error => {
        console.error('[social-media] Failed to load products', error)
        publish({ tone: 'error', message: 'Unable to load products for social generation.' })
        setProductLoadError('Unable to load products right now. Please refresh or try again shortly.')
      },
    )

    return () => unsubscribe()
  }, [publish, storeId])

  useEffect(() => {
    if (!storeId) {
      setHistory([])
      return
    }
    try {
      const key = `social-history-${storeId}`
      const raw = window.localStorage.getItem(key)
      if (!raw) {
        setHistory([])
        return
      }
      const parsed = JSON.parse(raw) as SocialHistoryEntry[]
      setHistory(Array.isArray(parsed) ? parsed.slice(0, 8) : [])
    } catch (_error) {
      setHistory([])
    }
  }, [storeId])

  const selectedProduct = useMemo(
    () => products.find(product => product.id === selectedId) ?? null,
    [products, selectedId],
  )

  const filteredProducts = useMemo(() => {
    const normalizedSearch = productSearchTerm.trim().toLowerCase()
    if (!normalizedSearch) return products
    return products.filter(product => {
      const name = product.name.toLowerCase()
      const category = product.category?.toLowerCase() ?? ''
      const description = product.description?.toLowerCase() ?? ''
      return (
        name.includes(normalizedSearch) ||
        category.includes(normalizedSearch) ||
        description.includes(normalizedSearch)
      )
    })
  }, [productSearchTerm, products])

  useEffect(() => {
    if (!filteredProducts.length) {
      setSelectedId('')
      return
    }
    setSelectedId(current => (current && filteredProducts.some(product => product.id === current) ? current : filteredProducts[0].id))
  }, [filteredProducts])

  const selectedPreview = useMemo(() => {
    if (!selectedProduct) return null
    return {
      category: selectedProduct.category || 'Uncategorized',
      price: typeof selectedProduct.price === 'number' ? `GHS ${selectedProduct.price.toFixed(2)}` : 'Price not set',
      description: selectedProduct.description || 'No description',
      imageUrl: selectedProduct.imageUrl,
    }
  }, [selectedProduct])

  function applyPresets(post: GenerateSocialPostResponse['post']) {
    const tonePrefix: Record<ContentTone, string> = {
      standard: '',
      playful: '✨ ',
      professional: 'Pro Tip: ',
    }
    const maxCaption: Record<ContentLength, number> = { short: 90, medium: 170, long: 220 }
    const hashtagLimit: Record<ContentLength, number> = { short: 5, medium: 7, long: 10 }

    const cleanCaption = post.caption.trim()
    const maxLen = maxCaption[lengthPreset]
    const trimmedCaption =
      cleanCaption.length > maxLen ? `${cleanCaption.slice(0, Math.max(maxLen - 1, 1)).trimEnd()}…` : cleanCaption

    return {
      ...post,
      caption: `${tonePrefix[tone]}${trimmedCaption}`.trim(),
      hashtags: post.hashtags.slice(0, hashtagLimit[lengthPreset]),
      cta: tone === 'professional' ? post.cta.replace('!', '.').trim() : post.cta,
    }
  }

  function persistHistory(nextResult: GenerateSocialPostResponse) {
    if (!storeId) return
    const nextEntry: SocialHistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAtIso: new Date().toISOString(),
      platform: nextResult.post.platform,
      productId: nextResult.productId,
      productName: nextResult.product.name,
      post: nextResult.post,
    }
    const nextHistory = [nextEntry, ...history].slice(0, 8)
    setHistory(nextHistory)
    try {
      window.localStorage.setItem(`social-history-${storeId}`, JSON.stringify(nextHistory))
    } catch (_error) {
      // no-op localStorage may be blocked in private mode
    }
  }

  async function handleGenerate(target: RegenerateTarget = 'all') {
    if (!storeId || !selectedProduct) return
    setLoading(true)
    setInlineError(null)
    try {
      const response = await requestSocialPost({
        storeId,
        platform,
        productId: selectedProduct.id,
      })
      const styledPost = applyPresets(response.post)
      const styledResponse: GenerateSocialPostResponse = {
        ...response,
        post: styledPost,
      }

      const merged =
        target === 'all' || !result
          ? styledResponse
          : {
              ...result,
              product: styledResponse.product,
              productId: styledResponse.productId,
              post: {
                ...result.post,
                ...(target === 'caption' ? { caption: styledResponse.post.caption } : {}),
                ...(target === 'hashtags' ? { hashtags: styledResponse.post.hashtags } : {}),
                ...(target === 'cta' ? { cta: styledResponse.post.cta } : {}),
              },
            }

      setResult(merged)
      persistHistory(merged)
      publish({ tone: 'success', message: 'Social post draft generated. Review before publishing.' })
    } catch (error) {
      console.error('[social-media] Failed to generate social post', error)
      const serverMessage = getCallableErrorMessage(error)
      publish({ tone: 'error', message: serverMessage || 'Could not generate social draft right now. Please try again.' })
      setInlineError(serverMessage || 'Generation failed. Check your network and try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy(target: CopyTarget) {
    if (!result) return
    const fullText = [
      `Caption: ${result.post.caption}`,
      `CTA: ${result.post.cta}`,
      `Hashtags: ${result.post.hashtags.join(' ')}`,
      `Image prompt: ${result.post.imagePrompt}`,
    ].join('\n')
    const text = target === 'caption' ? result.post.caption : target === 'hashtags' ? result.post.hashtags.join(' ') : fullText
    try {
      await navigator.clipboard.writeText(text)
      publish({ tone: 'success', message: `${target === 'full' ? 'Post draft' : target} copied.` })
    } catch (_error) {
      publish({ tone: 'error', message: 'Clipboard not available in this browser.' })
    }
  }

  function handleDownload() {
    if (!result) return
    const body = [
      `Platform: ${result.post.platform}`,
      `Product: ${result.product.name}`,
      '',
      `Caption: ${result.post.caption}`,
      `CTA: ${result.post.cta}`,
      `Hashtags: ${result.post.hashtags.join(' ')}`,
      `Image prompt: ${result.post.imagePrompt}`,
      `Design spec: ${result.post.designSpec.aspectRatio} · ${result.post.designSpec.visualStyle}`,
      `Safe text zones: ${result.post.designSpec.safeTextZones.join(' | ')}`,
      result.post.disclaimer ? `Disclaimer: ${result.post.disclaimer}` : '',
    ]
      .filter(Boolean)
      .join('\n')
    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `social-post-${result.post.platform}-${new Date().toISOString().slice(0, 10)}.txt`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <PageSection title="Social media" subtitle="Generate Instagram or TikTok-ready captions, hashtags, creative direction, and CTA from your existing product catalog.">
      <div
        style={{ display: 'grid', gap: 12 }}
        onKeyDown={event => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !loading && selectedProduct) {
            event.preventDefault()
            void handleGenerate('all')
          }
        }}
      >
        <label style={{ display: 'grid', gap: 6 }}>
          <span id="social-platform-label">Platform</span>
          <select aria-labelledby="social-platform-label" value={platform} onChange={event => setPlatform(event.target.value as SocialPlatform)}>
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
          </select>
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span id="social-product-search-label">Search products or services</span>
          <input
            aria-labelledby="social-product-search-label"
            type="search"
            value={productSearchTerm}
            onChange={event => setProductSearchTerm(event.target.value)}
            placeholder="Type product, service, or category"
          />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span id="social-product-label">Product or service</span>
          <select aria-labelledby="social-product-label" value={selectedId} onChange={event => setSelectedId(event.target.value)} disabled={!filteredProducts.length}>
            {filteredProducts.length ? (
              filteredProducts.map(product => (
                <option key={product.id} value={product.id}>
                  {product.name} {product.itemType === 'service' ? '(service)' : ''}
                </option>
              ))
            ) : (
              <option value="">{products.length ? 'No matching products or services' : 'No products found'}</option>
            )}
          </select>
        </label>
        {productLoadError ? <p style={{ margin: 0, color: 'var(--danger, #c62828)' }}>{productLoadError}</p> : null}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Tone preset</span>
            <select value={tone} onChange={event => setTone(event.target.value as ContentTone)}>
              <option value="standard">Standard</option>
              <option value="playful">Playful</option>
              <option value="professional">Professional</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Length preset</span>
            <select value={lengthPreset} onChange={event => setLengthPreset(event.target.value as ContentLength)}>
              <option value="short">Short</option>
              <option value="medium">Medium</option>
              <option value="long">Long</option>
            </select>
          </label>
        </div>

        {selectedPreview ? (
          <div style={{ display: 'grid', gap: 6, border: '1px solid var(--line, #ddd)', borderRadius: 10, padding: 10 }}>
            <strong style={{ margin: 0 }}>{selectedProduct?.name}</strong>
            <p style={{ margin: 0, fontSize: 14, opacity: 0.9 }}>{selectedPreview.category} · {selectedPreview.price}</p>
            <p style={{ margin: 0, fontSize: 14 }}>{selectedPreview.description}</p>
            {selectedPreview.imageUrl ? (
              <img src={selectedPreview.imageUrl} alt={`${selectedProduct?.name} preview`} style={{ maxWidth: 220, borderRadius: 8 }} />
            ) : (
              <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>No image available for this item.</p>
            )}
          </div>
        ) : null}

        <button className="button" type="button" onClick={() => void handleGenerate('all')} disabled={loading || !storeId || !selectedProduct}>
          {loading ? 'Generating…' : 'Generate social post'}
        </button>
        <p style={{ margin: 0, fontSize: 12, opacity: 0.75 }}>Tip: press Ctrl/Cmd + Enter to generate quickly.</p>
        {inlineError ? <p style={{ margin: 0, color: 'var(--danger, #c62828)' }}>{inlineError}</p> : null}

        {result ? (
          <div style={{ display: 'grid', gap: 10, border: '1px solid var(--line, #ddd)', borderRadius: 12, padding: 14 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button type="button" className="button secondary" onClick={() => void handleGenerate('caption')} disabled={loading}>Regenerate caption</button>
              <button type="button" className="button secondary" onClick={() => void handleGenerate('hashtags')} disabled={loading}>Regenerate hashtags</button>
              <button type="button" className="button secondary" onClick={() => void handleGenerate('cta')} disabled={loading}>Regenerate CTA</button>
            </div>
            <p style={{ margin: 0 }}><strong>Caption:</strong> {result.post.caption}</p>
            <p style={{ margin: 0 }}><strong>CTA:</strong> {result.post.cta}</p>
            <p style={{ margin: 0 }}><strong>Hashtags:</strong> {result.post.hashtags.join(' ')}</p>
            <p style={{ margin: 0 }}><strong>Image prompt:</strong> {result.post.imagePrompt}</p>
            <p style={{ margin: 0 }}><strong>Design spec:</strong> {result.post.designSpec.aspectRatio} · {result.post.designSpec.visualStyle}</p>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {result.post.designSpec.safeTextZones.map(zone => (
                <li key={zone}>{zone}</li>
              ))}
            </ul>
            {result.post.disclaimer ? <p style={{ margin: 0 }}><strong>Disclaimer:</strong> {result.post.disclaimer}</p> : null}
            <p style={{ margin: 0 }}><strong>Selected image:</strong> {result.product.imageUrl || 'No image URL on this item yet.'}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button type="button" className="button secondary" onClick={() => void handleCopy('caption')}>Copy caption</button>
              <button type="button" className="button secondary" onClick={() => void handleCopy('hashtags')}>Copy hashtags</button>
              <button type="button" className="button secondary" onClick={() => void handleCopy('full')}>Copy full draft</button>
              <button type="button" className="button secondary" onClick={handleDownload}>Download .txt</button>
            </div>
          </div>
        ) : null}

        {history.length ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <strong>Recent generations</strong>
            {history.map(entry => (
              <button
                key={entry.id}
                type="button"
                className="button secondary"
                style={{ textAlign: 'left' }}
                onClick={() =>
                  setResult(current =>
                    current
                      ? { ...current, productId: entry.productId, product: { ...current.product, name: entry.productName }, post: entry.post }
                      : {
                          storeId: storeId || '',
                          productId: entry.productId,
                          product: {
                            id: entry.productId ?? undefined,
                            name: entry.productName,
                            category: null,
                            description: null,
                            price: null,
                            imageUrl: null,
                            itemType: 'product',
                          },
                          post: entry.post,
                        },
                  )
                }
              >
                {new Date(entry.createdAtIso).toLocaleString()} · {entry.platform} · {entry.productName}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </PageSection>
  )
}
