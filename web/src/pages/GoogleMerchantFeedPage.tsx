import { useEffect, useMemo, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import PageSection from '../layout/PageSection'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import { useToast } from '../components/ToastProvider'

const PUBLIC_SEDIFEX_API_BASE_URL = 'https://us-central1-sedifex-web.cloudfunctions.net'

type StoreFeedState = {
  name: string
  promoSlug: string
  promoWebsiteUrl: string
}

function buildMerchantFeedUrl(state: StoreFeedState): string | null {
  if (!state.promoSlug) return null
  return `${PUBLIC_SEDIFEX_API_BASE_URL}/integrationGoogleMerchantFeed?slug=${encodeURIComponent(state.promoSlug)}`
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  throw new Error('Clipboard is unavailable in this browser.')
}

export default function GoogleMerchantFeedPage() {
  const { storeId } = useActiveStore()
  const { publish } = useToast()
  const [loading, setLoading] = useState(true)
  const [state, setState] = useState<StoreFeedState>({
    name: 'Your store',
    promoSlug: '',
    promoWebsiteUrl: '',
  })

  useEffect(() => {
    let cancelled = false

    async function loadStore() {
      if (!storeId) {
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const storeRef = doc(db, 'stores', storeId)
        const snapshot = await getDoc(storeRef)
        const data = (snapshot.data() ?? {}) as Record<string, unknown>
        if (cancelled) return
        setState({
          name:
            (typeof data.displayName === 'string' && data.displayName.trim()) ||
            (typeof data.name === 'string' && data.name.trim()) ||
            'Your store',
          promoSlug: typeof data.promoSlug === 'string' ? data.promoSlug.trim() : '',
          promoWebsiteUrl: typeof data.promoWebsiteUrl === 'string' ? data.promoWebsiteUrl.trim() : '',
        })
      } catch (error) {
        console.error('[merchant-feed] Failed to load store profile', error)
        if (!cancelled) {
          publish({ tone: 'error', message: 'Unable to load store details for Merchant feed.' })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadStore()
    return () => {
      cancelled = true
    }
  }, [publish, storeId])

  const merchantFeedUrl = useMemo(() => buildMerchantFeedUrl(state), [state])

  return (
    <PageSection
      title="Google Merchant feed"
      subtitle="Share one XML URL with Google Merchant Center. Google will keep fetching updated products from that single feed link."
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <p style={{ margin: 0 }}>
          <strong>Store:</strong> {state.name}
        </p>
        <p style={{ margin: 0 }}>
          <strong>Integration slug:</strong> {state.promoSlug || 'Not set yet'}
        </p>
        <p style={{ margin: 0 }}>
          <strong>Your website:</strong>{' '}
          {state.promoWebsiteUrl ? <code>{state.promoWebsiteUrl}</code> : 'Connect your own website through Website integration.'}
        </p>
        <p style={{ margin: 0 }}>
          <strong>Merchant feed URL:</strong>{' '}
          {merchantFeedUrl ? <code>{merchantFeedUrl}</code> : 'An integration slug is required for this existing feed.'}
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => {
              if (!merchantFeedUrl) {
                publish({ tone: 'error', message: 'This feed needs an integration slug before it can be copied.' })
                return
              }
              copyText(merchantFeedUrl)
                .then(() => publish({ tone: 'success', message: 'Merchant feed URL copied.' }))
                .catch(() => publish({ tone: 'error', message: 'Unable to copy Merchant feed URL.' }))
            }}
            disabled={loading}
          >
            Copy merchant feed URL
          </button>
          {merchantFeedUrl ? (
            <a className="button button--ghost" href={merchantFeedUrl} target="_blank" rel="noreferrer">
              Preview XML
            </a>
          ) : null}
        </div>

        <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>
          <li>Open Google Merchant Center and add a data source.</li>
          <li>Choose scheduled fetch and paste the Merchant feed URL above.</li>
          <li>Set the fetch frequency (for example: daily).</li>
          <li>Use diagnostics in Merchant Center to fix any field warnings.</li>
        </ol>
      </div>
    </PageSection>
  )
}
