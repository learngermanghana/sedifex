import React, { useEffect, useState } from 'react'

import GoogleBusinessMediaUploader from '../components/GoogleBusinessMediaUploader'
import GoogleConnectionStatusCard from '../components/GoogleConnectionStatusCard'
import { useActiveStore } from '../hooks/useActiveStore'
import { useGoogleIntegrationStatus } from '../hooks/useGoogleIntegrationStatus'
import { clearGoogleOAuthQueryState, parseGoogleOAuthQueryState } from '../utils/googleOAuthCallback'
import './GoogleShopping.css'

export default function GoogleBusinessProfile() {
  const { storeId } = useActiveStore()
  const [message, setMessage] = useState('')

  const {
    isLoading,
    isStartingOAuth,
    isConnected,
    hasGoogleConnection,
    buttonLabel,
    stateTitle,
    error,
    startOAuth,
  } = useGoogleIntegrationStatus({
    integration: 'business',
    storeId,
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const queryState = parseGoogleOAuthQueryState(window.location.search)
    if (!queryState.status) return

    if (queryState.status === 'success') {
      setMessage(queryState.message || 'Google connected successfully.')
    } else {
      setMessage(queryState.message || 'Google OAuth failed.')
    }

    const nextUrl = clearGoogleOAuthQueryState(window.location.href)
    window.history.replaceState({}, '', nextUrl)
  }, [])

  useEffect(() => {
    if (!error) return
    setMessage(error)
  }, [error])

  return (
    <main className="google-shopping-page">
      <header className="google-shopping-page__header">
        <h1>Google Business Profile</h1>
        <p>
          Upload location media directly to Google Business Profile. Sedifex stores only media metadata
          after Google confirms upload.
        </p>
      </header>

      {!storeId ? (
        <section className="google-shopping-panel">
          <p>Please choose a store first.</p>
        </section>
      ) : (
        <>
          <GoogleConnectionStatusCard storeId={storeId} currentIntegration="business" message={message} />

          <section className="google-shopping-panel">
            <h2>{stateTitle}</h2>
            <p>
              {!hasGoogleConnection
                ? 'Connect your Google account to continue.'
                : !isConnected
                  ? 'Your Google account is connected. Grant Google Business Profile access to continue.'
                  : 'Google Business Profile access is connected for this store.'}
            </p>
            {isLoading ? <p className="google-shopping-panel__hint">Checking Google connection…</p> : null}
            {!isConnected && !isLoading ? (
              <button type="button" onClick={() => void startOAuth()} disabled={isStartingOAuth}>
                {isStartingOAuth ? 'Connecting…' : buttonLabel}
              </button>
            ) : null}
          </section>

          {isConnected ? <GoogleBusinessMediaUploader storeId={storeId} /> : null}
        </>
      )}
    </main>
  )
}
