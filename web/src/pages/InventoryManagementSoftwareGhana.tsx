import React, { useEffect } from 'react'
import { Link } from 'react-router-dom'

import '../App.css'
import './InventorySystemGhana.css'

const PAGE_TITLE = 'Inventory Management Software in Ghana | Sedifex'
const PAGE_DESCRIPTION =
  'Sedifex helps businesses in Ghana manage inventory, send branded Bulk SMS, connect their websites, display TikTok/YouTube videos, and keep sites updated.'

const FEATURES = [
  {
    title: 'Real-time inventory management',
    description:
      'Track stock movement instantly so you can avoid stockouts, overstocking, and costly manual mistakes.',
  },
  {
    title: 'Branded Bulk SMS',
    description:
      'Send promotions and updates with your company identity to build trust and keep customers engaged.',
  },
  {
    title: 'Connected website support',
    description:
      'Share products and services through your own connected business website.',
  },
  {
    title: 'TikTok + YouTube website display',
    description:
      'Embed social videos on your website to increase product visibility and engagement.',
  },
  {
    title: 'Website updates from Sedifex',
    description:
      'Keep your public information current by reflecting key updates from Sedifex to your online pages.',
  },
  {
    title: 'Connected communication',
    description:
      'Align communication between inventory, sales, and customer updates in one connected workflow.',
  },
]

const AUDIENCE = [
  'Retail shops',
  'Pharmacies and health stores',
  'Supermarkets and mini-marts',
  'Distributors and wholesalers',
  'SMEs scaling operations in Ghana',
]

const FAQS = [
  {
    question: 'Is Sedifex only for inventory tracking?',
    answer:
      'No. Sedifex combines inventory management with branded communication and visibility tools such as website integrations and social video tools.',
  },
  {
    question: 'Can Sedifex be used by small businesses in Ghana?',
    answer: 'Yes. Sedifex is designed for SMEs and growing teams.',
  },
  {
    question: 'Can we display TikTok and YouTube videos on our site?',
    answer: 'Yes. Sedifex supports displaying TikTok and YouTube videos on your website.',
  },
]

function upsertMetaTag(attrName: 'name' | 'property', attrValue: string, content: string) {
  const selector = `meta[${attrName}='${attrValue}']`
  let tag = document.head.querySelector(selector)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attrName, attrValue)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

export default function InventoryManagementSoftwareGhana() {
  useEffect(() => {
    document.title = PAGE_TITLE
    upsertMetaTag('name', 'description', PAGE_DESCRIPTION)
    upsertMetaTag('property', 'og:title', PAGE_TITLE)
    upsertMetaTag('property', 'og:description', PAGE_DESCRIPTION)
    upsertMetaTag('property', 'og:type', 'website')
    upsertMetaTag('property', 'og:url', window.location.href)
  }, [])

  return (
    <main className="seo-page">
      <header className="seo-page__hero">
        <div className="seo-page__hero-content">
          <span className="seo-page__eyebrow">Inventory management software Ghana</span>
          <h1>Inventory management software in Ghana for smarter stock control.</h1>
          <p>
            Sedifex helps Ghana businesses manage inventory, communicate with customers through
            branded Bulk SMS, and improve online visibility with a connected business website.
          </p>
          <div className="seo-page__hero-actions">
            <a className="seo-page__secondary" href="mailto:info@sedifex.com">
              Book demo
            </a>
            <Link className="seo-page__cta" to="/pricing">
              View pricing
            </Link>
          </div>
        </div>
      </header>

      <section className="seo-page__section">
        <div className="seo-page__section-header">
          <h2>What makes Sedifex different</h2>
        </div>
        <div className="seo-page__grid">
          {FEATURES.map(feature => (
            <article key={feature.title} className="seo-page__card">
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="seo-page__section seo-page__section--highlight">
        <div className="seo-page__section-header">
          <h2>Built for growing businesses in Ghana</h2>
          <p>
            Sedifex is ideal for teams that need inventory control and customer communication in
            one platform.
          </p>
        </div>
        <div className="seo-page__grid">
          {AUDIENCE.map(item => (
            <article key={item} className="seo-page__card">
              <h3>{item}</h3>
            </article>
          ))}
        </div>
      </section>

      <section className="seo-page__section">
        <div className="seo-page__section-header">
          <h2>Frequently asked questions</h2>
        </div>
        <div className="seo-page__faq">
          {FAQS.map(item => (
            <article key={item.question} className="seo-page__faq-item">
              <h3>{item.question}</h3>
              <p>{item.answer}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
