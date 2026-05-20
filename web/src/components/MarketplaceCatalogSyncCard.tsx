import React, { useEffect, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { doc, getDoc, Timestamp } from 'firebase/firestore'
import { db, functions } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import { useToast } from './ToastProvider'

type CatalogHealth = {
  lastSyncedAt: Timestamp | null
  listings: number
  products: number
  services: number
  outOfSync: number
}

type SyncResponse = {
  ok?: boolean
  storeId?: string
  publicCatalogDocCount?: {
    listings?: number
    products?: number
    services?: number
  } | null
  publicCatalogOutOfSyncCount?: number | null
  publicCatalogLastSyncedAt?: string | null
}

type Props = {
  canSync: boolean
}

function toTimestamp(value: unknown): Timestamp | null {
  if (value && typeof value === 'object' && typeof (value as Timestamp).toDate === 'function') {
    return value as Timestamp
  }
  return null
}

function numberField(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

function formatTimestamp(timestamp: Timestamp | null) {
  if (!timestamp) return 'Not synced yet'
  try {
    return timestamp.toDate().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return 'Not synced yet'
  }
}

function readinessLabel(health: CatalogHealth | null) {
  if (!health) return 'Checking marketplace readiness…'
  if (health.outOfSync > 0) return `${health.outOfSync} item${health.outOfSync === 1 ? '' : 's'} need sync`
  const total = health.listings || health.products + health.services
  if (total === 0) return 'No public listings yet'
  return `${total} public listing${total === 1 ? '' : 's'} synced`
}

export default function MarketplaceCatalogSyncCard({ canSync }: Props) {
  const { storeId } = useActiveStore()
  const { publish } = useToast()
  const [health, setHealth] = useState<CatalogHealth | null>(null)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)

  async function loadHealth() {
    if (!storeId) {
      setHealth(null)
      return
    }
    setLoading(true)
    try {
      const snapshot = await getDoc(doc(db, 'stores', storeId))
      const data = snapshot.data() ?? {}
      const count = data.publicCatalogDocCount && typeof data.publicCatalogDocCount === 'object'
        ? data.publicCatalogDocCount as Record<string, unknown>
        : {}
      setHealth({
        lastSyncedAt: toTimestamp(data.publicCatalogLastSyncedAt),
        listings: numberField(count.listings),
        products: numberField(count.products),
        services: numberField(count.services),
        outOfSync: numberField(data.publicCatalogOutOfSyncCount),
      })
    } catch (error) {
      console.error('[marketplace-sync] Failed to load catalog health', error)
      publish({ message: 'Unable to load marketplace catalog health.', tone: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadHealth()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId])

  async function handleSync() {
    if (!storeId) return
    if (!canSync) {
      publish({ message: 'Only the workspace owner can sync the marketplace catalog.', tone: 'error' })
      return
    }

    setSyncing(true)
    try {
      const callable = httpsCallable(functions, 'adminSyncStorePublicCatalog')
      const response = await callable({ storeId })
      const payload = (response.data ?? {}) as SyncResponse
      const count = payload.publicCatalogDocCount ?? {}
      setHealth(current => ({
        lastSyncedAt: current?.lastSyncedAt ?? null,
        listings: numberField(count.listings),
        products: numberField(count.products),
        services: numberField(count.services),
        outOfSync: numberField(payload.publicCatalogOutOfSyncCount),
      }))
      publish({ message: 'Marketplace catalog synced.', tone: 'success' })
      await loadHealth()
    } catch (error) {
      console.error('[marketplace-sync] Failed to sync public catalog', error)
      const message = typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : 'Unable to sync marketplace catalog.'
      publish({ message, tone: 'error' })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="account-overview__card" role="status" aria-live="polite">
      <h3>Marketplace readiness</h3>
      <p className="account-overview__hint">
        Keep Sedifex Market updated even while product data is still incomplete. The marketplace will show placeholders for missing images, but this sync repairs public listing records.
      </p>
      <div className="account-overview__website-sync-keys">
        <p className="account-overview__hint"><strong>{loading ? 'Loading…' : readinessLabel(health)}</strong></p>
        <p className="account-overview__hint">Last synced: {formatTimestamp(health?.lastSyncedAt ?? null)}</p>
        <p className="account-overview__hint">
          Listings: {health?.listings ?? 0}
          {' · '}
          Products: {health?.products ?? 0}
          {' · '}
          Services: {health?.services ?? 0}
        </p>
        <p className="account-overview__hint">Out of sync: {health?.outOfSync ?? 0}</p>
      </div>
      <div className="account-overview__website-sync-actions">
        <button type="button" className="button button--secondary" onClick={() => void loadHealth()} disabled={loading || syncing}>
          Refresh status
        </button>
        <button type="button" className="button button--primary" onClick={handleSync} disabled={!canSync || syncing || !storeId}>
          {syncing ? 'Syncing…' : 'Sync Marketplace Catalog'}
        </button>
      </div>
    </div>
  )
}
