import React from 'react'

import GoogleBusinessMediaUploader from '../components/GoogleBusinessMediaUploader'
import { useActiveStore } from '../hooks/useActiveStore'
import './GoogleShopping.css'

export default function GoogleBusinessProfile() {
  const { storeId } = useActiveStore()

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
        <GoogleBusinessMediaUploader storeId={storeId} />
      )}
    </main>
  )
}
