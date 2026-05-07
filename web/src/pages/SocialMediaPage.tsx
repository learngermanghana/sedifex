import { useEffect, useMemo, useState } from 'react'
import { FirebaseError } from 'firebase/app'
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import PageSection from '../layout/PageSection'
import { useActiveStore } from '../hooks/useActiveStore'
import { useToast } from '../components/ToastProvider'
import {
  confirmSocialBackendReachable,
  requestSocialPost,
  type GenerateSocialPostResponse,
  type SocialPlatform,
} from '../api/socialPost'
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

type RegenerateTarget = 'all' | 'caption' | 'hashtags'
type ContentTone = 'standard' | 'playful' | 'professional'
type ContentLength = 'short' | 'medium' | 'long'
type LaunchPlatformTarget = 'instagram' | 'tiktok' | 'google_business'
type SocialHistoryEntry = {
  id: string
  createdAtIso: string
  platform: SocialPlatform
  productId: string | null
  productName: string
  post: GenerateSocialPostResponse['post']
}

type ParsedMarketingDescription = {
  intro: string
  keyBenefits: string[]
  bestUseCase: string | null
  closing: string | null
}

type StoreContactDetails = {
  phone: string | null
  email: string | null
  website: string | null
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function cleanRichText(value: string): string {
  return value
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseMarketingDescription(value: string | null): ParsedMarketingDescription | null {
  if (!value) return null

  const normalized = value.replace(/\r\n/g, '\n').trim()
  if (!normalized) return null

  const chunks = normalized
    .split(/\n+/)
    .map(line => cleanRichText(line))
    .filter(Boolean)

  if (!chunks.length) return null

  const keyBenefitsIndex = chunks.findIndex(line => /^key benefits:?$/i.test(line))
  const bestUseCaseIndex = chunks.findIndex(line => /^best use case:?$/i.test(line))

  const introEnd = keyBenefitsIndex >= 0 ? keyBenefitsIndex : bestUseCaseIndex >= 0 ? bestUseCaseIndex : chunks.length
  const intro = chunks
    .slice(0, introEnd)
    .filter(line => !/^(product name|category|item type):/i.test(line))
    .join(' ')

  const keyBenefitsStart = keyBenefitsIndex >= 0 ? keyBenefitsIndex + 1 : -1
  const keyBenefitsEnd = bestUseCaseIndex >= 0 ? bestUseCaseIndex : chunks.length
  const keyBenefits =
    keyBenefitsStart >= 0
      ? chunks
          .slice(keyBenefitsStart, keyBenefitsEnd)
          .map(line => line.replace(/^[-•]\s*/, '').replace(/^[^:]+:\s*/, match => match))
          .filter(Boolean)
      : []

  const bestUseCase =
    bestUseCaseIndex >= 0
      ? chunks
          .slice(bestUseCaseIndex + 1)
          .find(line => !/^[-•]\s*$/.test(line) && !/^don.t wait/i.test(line) && !/^order now/i.test(line)) ?? null
      : null

  const closing =
    chunks.find(line => /^don.t wait/i.test(line) || /^order now/i.test(line) || /start your journey/i.test(line)) ?? null

  if (!intro && !keyBenefits.length && !bestUseCase && !closing) return null

  return {
    intro,
    keyBenefits,
    bestUseCase,
    closing,
  }
}

function getCallableErrorMessage(error: unknown): string | null {
  if (!(error instanceof FirebaseError)) return null

  const callableError = error as FirebaseError & {
    code?: string
    customData?: {
      body?: {
        error?: {
          message?: unknown
        }
      }
    }
  }

  const errorCode = typeof callableError.code === 'string' ? callableError.code.trim() : ''
  if (errorCode === 'functions/unavailable') {
    return 'AI backend is unreachable right now. Confirm Firebase Functions is deployed and the project config points to the right environment.'
  }
  if (errorCode === 'functions/not-found') {
    return 'AI endpoint is missing. Deploy the latest Firebase Functions so generateSocialPost is available.'
  }
  if (errorCode === 'functions/internal') {
    return 'The AI service is online but failed to generate content. Please retry in a moment.'
  }
  if (errorCode === 'functions/failed-precondition') {
    return 'AI generator is not fully configured yet. Verify OPENAI_API_KEY is set for Firebase Functions.'
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

function normalizeGeneratedPost(post: GenerateSocialPostResponse['post']): GenerateSocialPostResponse['post'] {
  const normalizedCaption = post.caption.replace(/\r\n/g, '\n').trim()
  const captionMatch = normalizedCaption.match(
    /(?:^|\n)\s*caption\s*:\s*([\s\S]*?)(?=\n\s*(?:cta|hashtags|image prompt|design spec|selected image)\s*:|$)/i,
  )
  const hashtagsMatch = normalizedCaption.match(/(?:^|\n)\s*hashtags\s*:\s*([^\n]+)/i)

  const cleanCaption = (captionMatch?.[1] ?? normalizedCaption).trim()
  const parsedHashtags =
    post.hashtags.length > 0
      ? post.hashtags
      : (hashtagsMatch?.[1] ?? '')
          .split(/[,\s]+/)
          .map(tag => tag.trim())
          .filter(Boolean)
          .map(tag => (tag.startsWith('#') ? tag : `#${tag}`))
          .slice(0, 10)

  return {
    ...post,
    caption: cleanCaption,
    hashtags: parsedHashtags,
  }
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch (_error) {
    // fall back to document.execCommand for browsers with partial clipboard support (notably some iOS/Safari flows)
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  document.body.appendChild(textarea)

  const selection = document.getSelection()
  const previousRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null

  textarea.focus()
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)

  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch (_error) {
    copied = false
  }

  document.body.removeChild(textarea)
  if (selection && previousRange) {
    selection.removeAllRanges()
    selection.addRange(previousRange)
  }

  return copied
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
  const [storeContact, setStoreContact] = useState<StoreContactDetails>({
    phone: null,
    email: null,
    website: null,
  })

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

  useEffect(() => {
    let cancelled = false

    async function loadStoreContactDetails() {
      if (!storeId) {
        setStoreContact({ phone: null, email: null, website: null })
        return
      }

      try {
        const snapshot = await getDoc(doc(db, 'stores', storeId))
        if (!snapshot.exists() || cancelled) return
        const data = snapshot.data()
        const contactInfo =
          typeof data.contactInfo === 'object' && data.contactInfo
            ? (data.contactInfo as Record<string, unknown>)
            : null
        const phone = firstNonEmptyString(
          data.phone,
          data.phoneNumber,
          data.mobile,
          data.whatsappNumber,
          contactInfo?.phone,
          contactInfo?.phoneNumber,
          contactInfo?.mobile,
        )
        const email = firstNonEmptyString(data.email, data.ownerEmail, contactInfo?.email)
        const websiteCandidates = [
          typeof data.website === 'string' ? data.website.trim() : '',
          typeof data.websiteUrl === 'string' ? data.websiteUrl.trim() : '',
          typeof data.websiteLink === 'string' ? data.websiteLink.trim() : '',
          typeof contactInfo?.website === 'string' ? contactInfo.website.trim() : '',
        ].filter(Boolean)
        const website = websiteCandidates[0] || null
        if (!cancelled) {
          setStoreContact({ phone, email, website })
        }
      } catch (error) {
        console.warn('[social-media] Failed to load store contact details', error)
      }
    }

    void loadStoreContactDetails()
    return () => {
      cancelled = true
    }
  }, [storeId])

  const contactCta = useMemo(() => {
    const contactLines = [
      storeContact.phone ? `Call now: ${storeContact.phone}` : null,
      storeContact.email ? `Email: ${storeContact.email}` : null,
      storeContact.website ? `Visit: ${storeContact.website}` : null,
    ].filter(Boolean)
    if (!contactLines.length) {
      return 'Message us now to place your order and get full details.'
    }
    return contactLines.join(' • ')
  }, [storeContact.email, storeContact.phone, storeContact.website])

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
    const parsedDescription = parseMarketingDescription(selectedProduct.description)

    return {
      category: selectedProduct.category || 'Uncategorized',
      price: typeof selectedProduct.price === 'number' ? `GHS ${selectedProduct.price.toFixed(2)}` : 'Price not set',
      description: selectedProduct.description || 'No description',
      parsedDescription,
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

    const normalizedPost = normalizeGeneratedPost(post)
    const cleanCaption = normalizedPost.caption.trim()
    const maxLen = maxCaption[lengthPreset]
    const trimmedCaption =
      cleanCaption.length > maxLen ? `${cleanCaption.slice(0, Math.max(maxLen - 1, 1)).trimEnd()}…` : cleanCaption

    return {
      ...normalizedPost,
      caption: `${tonePrefix[tone]}${trimmedCaption}`.trim(),
      hashtags: normalizedPost.hashtags.slice(0, hashtagLimit[lengthPreset]),
      cta: tone === 'professional' ? normalizedPost.cta.replace('!', '.').trim() : normalizedPost.cta,
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
    const requestPayload = {
      storeId,
      platform,
      productId: selectedProduct.id,
      product: {
        id: selectedProduct.id,
        name: selectedProduct.name,
        category: selectedProduct.category,
        description: selectedProduct.description,
        price: selectedProduct.price,
        imageUrl: selectedProduct.imageUrl,
        itemType: selectedProduct.itemType,
      },
    }

    const mergeGeneratedResult = (response: GenerateSocialPostResponse) => {
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
              },
            }

      setResult(merged)
      persistHistory(merged)
      return merged
    }

    try {
      const response = await requestSocialPost(requestPayload)
      mergeGeneratedResult(response)
      publish({ tone: 'success', message: 'Social post draft generated. Review before publishing.' })
    } catch (error) {
      console.error('[social-media] Failed to generate social post', error)
      const backendReachable = await confirmSocialBackendReachable()

      if (backendReachable) {
        try {
          publish({ tone: 'warning', message: 'AI backend is reachable. Retrying generation once…' })
          const retryResponse = await requestSocialPost(requestPayload)
          mergeGeneratedResult(retryResponse)
          publish({ tone: 'success', message: 'Social post draft generated after retry.' })
          return
        } catch (retryError) {
          console.error('[social-media] Retry failed after backend reachability check', retryError)
          const retryMessage = getCallableErrorMessage(retryError)
          publish({ tone: 'error', message: retryMessage || 'Retry failed. Please try again shortly.' })
          setInlineError(
            retryMessage ||
              'Generation failed after retry. Confirm Firebase Functions configuration and try again in a moment.',
          )
          return
        }
      }

      const serverMessage = getCallableErrorMessage(error)
      publish({
        tone: 'error',
        message:
          serverMessage ||
          'Could not generate social draft right now. Please check backend deployment/configuration and try again.',
      })
      setInlineError(
        serverMessage ||
          'Generation failed. Firebase Functions AI backend appears unreachable. Deploy/verify backend, then retry.',
      )
    } finally {
      setLoading(false)
    }
  }

  async function handleCopyPost() {
    if (!result) return
    const imageLine = result.product.imageUrl ? `Image: ${result.product.imageUrl}` : null
    const fullText = [result.post.caption, contactCta, result.post.hashtags.join(' '), imageLine].filter(Boolean).join('\n\n')
    const copied = await copyTextToClipboard(fullText)
    if (copied) {
      publish({ tone: 'success', message: 'Post text and image link copied.' })
    } else {
      publish({ tone: 'error', message: 'Clipboard not available in this browser.' })
    }
  }

  async function handleSendToPlatform(target: LaunchPlatformTarget) {
    if (!result) return

    const imageLine = result.product.imageUrl ? `Image: ${result.product.imageUrl}` : null
    const fullText = [result.post.caption, contactCta, result.post.hashtags.join(' '), imageLine].filter(Boolean).join('\n\n')

    const copied = await copyTextToClipboard(fullText)
    if (copied) {
      publish({
        tone: 'success',
        message: `Draft copied with image link. Paste it in ${target === 'instagram' ? 'Instagram' : target === 'tiktok' ? 'TikTok' : 'Google Business Profile'}.`,
      })
    } else {
      publish({
        tone: 'error',
        message: 'Could not copy draft automatically. You can still copy manually below.',
      })
    }

    const destination =
      target === 'instagram'
        ? 'https://www.instagram.com/'
        : target === 'tiktok'
          ? 'https://www.tiktok.com/upload?lang=en'
          : 'https://business.google.com/'
    window.open(destination, '_blank', 'noopener,noreferrer')
  }

  function handleDownload() {
    if (!result) return
    const imageLine = result.product.imageUrl ? `Image: ${result.product.imageUrl}` : ''
    const body = [
      `Platform: ${result.post.platform}`,
      `Product: ${result.product.name}`,
      '',
      'Manual upload steps:',
      '1. Open the original image link.',
      '2. Hold (mobile) or right-click (desktop) the picture to save it.',
      `3. Upload image in the ${result.post.platform === 'instagram' ? 'Instagram' : result.post.platform === 'tiktok' ? 'TikTok' : 'Google Business Profile'} app.`,
      '4. Paste caption + hashtags + image link.',
      '',
      'Draft content:',
      result.post.caption,
      contactCta,
      result.post.hashtags.join(' '),
      imageLine,
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
    <PageSection title="Social media" subtitle="Generate Instagram, TikTok, or Google Business-ready captions, hashtags, and CTA from your existing product catalog.">
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
            <option value="google_business">Google Business</option>
          </select>
        </label>

        {platform === 'google_business' ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <button
              type="button"
              className="button secondary"
              onClick={() => window.open('https://business.google.com/', '_blank', 'noopener,noreferrer')}
            >
              Open Google Business Profile
            </button>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>
              Sedifex generates the Google post draft for you, then copies caption + hashtags + image link. Final posting still happens inside Google Business Profile.
            </p>
          </div>
        ) : null}

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
            {selectedPreview.parsedDescription ? (
              <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
                {selectedPreview.parsedDescription.intro ? <p style={{ margin: 0 }}>{selectedPreview.parsedDescription.intro}</p> : null}
                {selectedPreview.parsedDescription.keyBenefits.length ? (
                  <div style={{ display: 'grid', gap: 4 }}>
                    <strong style={{ margin: 0 }}>Key benefits</strong>
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      {selectedPreview.parsedDescription.keyBenefits.map(benefit => (
                        <li key={benefit}>{benefit}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {selectedPreview.parsedDescription.bestUseCase ? (
                  <p style={{ margin: 0 }}>
                    <strong>Best use case:</strong> {selectedPreview.parsedDescription.bestUseCase}
                  </p>
                ) : null}
                {selectedPreview.parsedDescription.closing ? <p style={{ margin: 0 }}>{selectedPreview.parsedDescription.closing}</p> : null}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 14 }}>{selectedPreview.description}</p>
            )}
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
            </div>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{result.post.caption}</p>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{contactCta}</p>
            <p style={{ margin: 0, color: 'var(--muted, #555)' }}>{result.post.hashtags.join(' ')}</p>
            {result.post.disclaimer ? <p style={{ margin: 0 }}><strong>Disclaimer:</strong> {result.post.disclaimer}</p> : null}
            <p style={{ margin: 0 }}>
              <strong>Selected image:</strong>{' '}
              {result.product.imageUrl
                ? 'Use Open original image, then hold/right-click the picture to save when needed.'
                : 'No image URL on this item yet.'}
            </p>
            {result.product.imageUrl ? (
              <p style={{ margin: 0, fontSize: 13 }}>
                <strong>Image URL:</strong>{' '}
                <a href={result.product.imageUrl} target="_blank" rel="noopener noreferrer">
                  Open original image
                </a>
              </p>
            ) : null}
            <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
              Step 1: Open original image and hold/right-click the picture to save. Step 2: Use Send to Instagram/TikTok/Google Business (or open app manually). Step 3: Paste caption + hashtags + image link.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button type="button" className="button secondary" onClick={() => void handleSendToPlatform('instagram')}>
                Send to Instagram
              </button>
              <button type="button" className="button secondary" onClick={() => void handleSendToPlatform('tiktok')}>
                Send to TikTok
              </button>
              <button type="button" className="button secondary" onClick={() => void handleSendToPlatform('google_business')}>
                Send to Google Business
              </button>
              <button type="button" className="button secondary" onClick={() => void handleCopyPost()}>Copy text + image link</button>
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
