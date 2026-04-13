import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
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
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GenerateSocialPostResponse | null>(null)

  useEffect(() => {
    if (!storeId) {
      setProducts([])
      setSelectedId('')
      return
    }

    const productsQuery = query(
      collection(db, 'products'),
      where('storeId', '==', storeId),
      orderBy('updatedAt', 'desc'),
      orderBy('createdAt', 'desc'),
    )

    const unsubscribe = onSnapshot(
      productsQuery,
      snapshot => {
        const rows = snapshot.docs.map(entry => mapProduct(entry.id, entry.data() as Record<string, unknown>))
        const sorted = rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
        setProducts(sorted)
        setSelectedId(current => (current && sorted.some(item => item.id === current) ? current : sorted[0]?.id ?? ''))
      },
      error => {
        console.error('[social-media] Failed to load products', error)
        publish({ tone: 'error', message: 'Unable to load products for social generation.' })
      },
    )

    return () => unsubscribe()
  }, [publish, storeId])

  const selectedProduct = useMemo(
    () => products.find(product => product.id === selectedId) ?? null,
    [products, selectedId],
  )

  async function handleGenerate() {
    if (!storeId || !selectedProduct) return
    setLoading(true)
    try {
      const response = await requestSocialPost({
        storeId,
        platform,
        productId: selectedProduct.id,
      })
      setResult(response)
      publish({ tone: 'success', message: 'Social post draft generated. Review before publishing.' })
    } catch (error) {
      console.error('[social-media] Failed to generate social post', error)
      publish({ tone: 'error', message: 'Could not generate social draft right now. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <PageSection title="Social media" subtitle="Generate Instagram or TikTok-ready captions, hashtags, creative direction, and CTA from your existing product catalog.">
      <div style={{ display: 'grid', gap: 12 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Platform</span>
          <select value={platform} onChange={event => setPlatform(event.target.value as SocialPlatform)}>
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
          </select>
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span>Product or service</span>
          <select value={selectedId} onChange={event => setSelectedId(event.target.value)} disabled={!products.length}>
            {products.length ? (
              products.map(product => (
                <option key={product.id} value={product.id}>
                  {product.name} {product.itemType === 'service' ? '(service)' : ''}
                </option>
              ))
            ) : (
              <option value="">No products found</option>
            )}
          </select>
        </label>

        <button className="button" type="button" onClick={handleGenerate} disabled={loading || !storeId || !selectedProduct}>
          {loading ? 'Generating…' : 'Generate social post'}
        </button>

        {result ? (
          <div style={{ display: 'grid', gap: 10, border: '1px solid var(--line, #ddd)', borderRadius: 12, padding: 14 }}>
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
          </div>
        ) : null}
      </div>
    </PageSection>
  )
}
