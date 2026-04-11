import React, { useEffect, useMemo, useState } from 'react'

import GoogleConnectionStatusCard from '../components/GoogleConnectionStatusCard'
import { fetchGoogleIntegrationOverview, type GoogleIntegrationKey } from '../api/googleIntegrations'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import { Link, useLocation } from 'react-router-dom'

import './GoogleConnect.css'

type GoogleToolTab = {
  to: string
  label: string
  summary: string
  checklist: string[]
  integration: GoogleIntegrationKey
}

const TABS: GoogleToolTab[] = [
  {
    to: '/ads',
    label: 'Google Ads',
    integration: 'ads',
    summary: 'Create campaigns with AI-ready briefs and budget controls from one screen.',
    checklist: ['Connect account', 'Add billing details', 'Launch your first campaign'],
  },
  {
    to: '/google-shopping',
    label: 'Google Shopping',
    integration: 'merchant',
    summary: 'Sync products to Merchant Center and resolve feed issues before they block sales.',
    checklist: ['Connect Merchant account', 'Map product fields', 'Run sync and fix warnings'],
  },
  {
    to: '/google-business',
    label: 'Google Business Profile',
    integration: 'business',
    summary: 'Manage listing visibility, branches, and profile consistency for local discovery.',
    checklist: ['Authorize Business Profile', 'Choose account location', 'Review profile health'],
  },
]

export default function GoogleConnect() {
  const location = useLocation()
  const { storeId } = useActiveStore()
  const [integrationHealth, setIntegrationHealth] = useState<Record<GoogleIntegrationKey, string>>({
    ads: 'Needs permission',
    business: 'Needs permission',
    merchant: 'Needs permission',
  })
  const [merchantStoreConnected, setMerchantStoreConnected] = useState(false)

  useEffect(() => {
    if (!storeId) return
    let mounted = true

    fetchGoogleIntegrationOverview(storeId)
      .then((overview) => {
        if (!mounted) return
        setIntegrationHealth({
          ads: overview.integrations.ads.hasRequiredScope ? 'Connected' : 'Needs permission',
          business: overview.integrations.business.hasRequiredScope ? 'Connected' : 'Needs permission',
          merchant: overview.integrations.merchant.hasRequiredScope ? 'Connected' : 'Needs permission',
        })
      })
      .catch(() => {
        if (!mounted) return
        setIntegrationHealth({
          ads: 'Needs permission',
          business: 'Needs permission',
          merchant: 'Needs permission',
        })
      })

    return () => {
      mounted = false
    }
  }, [storeId])

  useEffect(() => {
    if (!storeId) return
    const unsubscribe = onSnapshot(doc(db, 'storeSettings', storeId), (snap) => {
      const data = snap.data() as Record<string, any> | undefined
      const googleShopping = (data?.googleShopping ?? {}) as Record<string, any>
      const connection = (googleShopping.connection ?? {}) as Record<string, any>
      setMerchantStoreConnected(connection.connected === true)
    })
    return () => unsubscribe()
  }, [storeId])

  const cardStatuses = useMemo(() => {
    return {
      ads: integrationHealth.ads,
      business: integrationHealth.business,
      merchant:
        integrationHealth.merchant === 'Connected' && !merchantStoreConnected
          ? 'Action required'
          : integrationHealth.merchant,
    } as Record<GoogleIntegrationKey, string>
  }, [integrationHealth, merchantStoreConnected])

  return (
    <main className="google-connect-page">
      <header className="google-connect-page__header">
        <h1>Google Connect</h1>
        <p>
          Manage Google Ads, Shopping, and Business Profile from one workspace. Start with the integration that
          impacts revenue fastest, then complete the rest.
        </p>
      </header>

      <section className="google-connect-page__cards" aria-label="Google integrations">
        {TABS.map((tab) => {
          const active = location.pathname === tab.to

          return (
            <article key={tab.to} className={`google-connect-card ${active ? 'is-active' : ''}`}>
              <div className="google-connect-card__top">
                <h2>{tab.label}</h2>
                <span className={`google-connect-card__status google-connect-card__status--${cardStatuses[tab.integration].toLowerCase().replace(/\s+/g, '-')}`}>
                  {cardStatuses[tab.integration]}
                </span>
              </div>
              <p>{tab.summary}</p>

              <ul>
                {tab.checklist.map((item) => (
                  <li key={`${tab.to}-${item}`}>{item}</li>
                ))}
              </ul>

              <Link to={tab.to} className="google-connect-card__cta" aria-current={active ? 'page' : undefined}>
                {active ? 'Continue setup' : `Open ${tab.label}`}
              </Link>
            </article>
          )
        })}
      </section>

      {storeId ? <GoogleConnectionStatusCard storeId={storeId} /> : null}

      <section className="google-connect-page__panel" aria-label="Suggested sequence">
        <h3>Recommended setup order</h3>
        <ol>
          <li>Connect Google Ads first to start generating traffic quickly.</li>
          <li>Connect Google Shopping to capture high-intent product searches.</li>
          <li>Finish Google Business Profile for local trust and map visibility.</li>
        </ol>
      </section>
    </main>
  )
}
