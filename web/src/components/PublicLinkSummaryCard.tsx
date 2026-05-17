import { useEffect, useMemo, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import { buildPromoSlug } from '../utils/promoSlug'

type StorePublicSummary = {
  name?: string | null
  displayName?: string | null
  promoSlug?: string | null
}

export default function PublicLinkSummaryCard() {
  const { storeId } = useActiveStore()
  const [summary, setSummary] = useState<StorePublicSummary | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadSummary() {
      if (!storeId) {
        setSummary(null)
        return
      }
      try {
        const snapshot = await getDoc(doc(db, 'stores', storeId))
        if (cancelled) return
        setSummary(snapshot.exists() ? snapshot.data() as StorePublicSummary : null)
      } catch (error) {
        console.warn('[public-link-summary] failed to load store summary', error)
        if (!cancelled) setSummary(null)
      }
    }
    void loadSummary()
    return () => {
      cancelled = true
    }
  }, [storeId])

  const publicUrl = useMemo(() => {
    if (!storeId) return ''
    const slug = buildPromoSlug(summary?.promoSlug, summary?.displayName, summary?.name, storeId)
    return `sedifex.com/${slug}`
  }, [storeId, summary])

  if (!storeId) return null

  return (
    <section className="account-overview__card" aria-labelledby="public-link-summary-title">
      <div className="account-overview__section-header">
        <div>
          <h2 id="public-link-summary-title">Public Sedifex link</h2>
          <p className="account-overview__subtitle">
            This free link uses the same data you manage in Sedifex. Promo details, gallery albums, inventory, services, and blog posts can update the public customer view and can also power your own website integration.
          </p>
        </div>
      </div>
      <div className="account-overview__banner" role="note">
        <p><strong>Public URL:</strong> {publicUrl}</p>
        <p>Keep your promo page, gallery, items, and blog posts updated. Sedifex organizes that content for customers at this link, and your own website can reuse the same data through the integration endpoints.</p>
      </div>
    </section>
  )
}
