import React from 'react'
import { Link, useLocation } from 'react-router-dom'

import './GoogleConnect.css'

const TABS = [
  { to: '/ads', label: 'Google Ads' },
  { to: '/google-shopping', label: 'Google Shopping' },
  { to: '/google-business', label: 'Google Business Profile' },
]

export default function GoogleConnect() {
  const location = useLocation()

  return (
    <main className="google-connect-page">
      <header className="google-connect-page__header">
        <h1>Google Connect</h1>
        <p>Use one workspace to jump into Ads, Shopping, and Business Profile setup.</p>
      </header>

      <nav className="google-connect-page__tabs" aria-label="Google tools">
        {TABS.map(tab => {
          const active = location.pathname === tab.to
          return (
            <Link key={tab.to} to={tab.to} className={`google-connect-page__tab ${active ? 'is-active' : ''}`}>
              {tab.label}
            </Link>
          )
        })}
      </nav>

      <section className="google-connect-page__panel">
        <p>Select a Google tool above to continue setup.</p>
      </section>
    </main>
  )
}
