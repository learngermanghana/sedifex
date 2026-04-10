import React from 'react'
import { Link, useLocation } from 'react-router-dom'

import './GoogleConnect.css'

type GoogleToolTab = {
  to: string
  label: string
  summary: string
  checklist: string[]
}

const TABS: GoogleToolTab[] = [
  {
    to: '/ads',
    label: 'Google Ads',
    summary: 'Create campaigns with AI-ready briefs and budget controls from one screen.',
    checklist: ['Connect account', 'Add billing details', 'Launch your first campaign'],
  },
  {
    to: '/google-shopping',
    label: 'Google Shopping',
    summary: 'Sync products to Merchant Center and resolve feed issues before they block sales.',
    checklist: ['Connect Merchant account', 'Map product fields', 'Run sync and fix warnings'],
  },
  {
    to: '/google-business',
    label: 'Google Business Profile',
    summary: 'Manage listing visibility, branches, and profile consistency for local discovery.',
    checklist: ['Authorize Business Profile', 'Choose account location', 'Review profile health'],
  },
]

export default function GoogleConnect() {
  const location = useLocation()

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
        {TABS.map(tab => {
          const active = location.pathname === tab.to

          return (
            <article key={tab.to} className={`google-connect-card ${active ? 'is-active' : ''}`}>
              <div className="google-connect-card__top">
                <h2>{tab.label}</h2>
                <span className="google-connect-card__status">{active ? 'Current' : 'Available'}</span>
              </div>
              <p>{tab.summary}</p>

              <ul>
                {tab.checklist.map(item => (
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
