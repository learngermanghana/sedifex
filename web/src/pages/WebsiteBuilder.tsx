import React, { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import GallerySettings from './GallerySettings'
import PromoSettings from './PromoSettings'
import SocialLinksSettings from './SocialLinksSettings'
import WebsiteHeroSlides from './WebsiteHeroSlides'
import './AccountOverview.css'
import './WebsiteBuilder.css'

type BuilderSectionId = 'overview' | 'promo' | 'gallery' | 'hero' | 'social'

type BuilderSection = {
  id: Exclude<BuilderSectionId, 'overview'>
  label: string
  Component: React.ComponentType
}

const BUILDER_SECTIONS: BuilderSection[] = [
  {
    id: 'promo',
    label: 'Promo',
    Component: PromoSettings,
  },
  {
    id: 'gallery',
    label: 'Gallery',
    Component: GallerySettings,
  },
  {
    id: 'hero',
    label: 'Hero',
    Component: WebsiteHeroSlides,
  },
  {
    id: 'social',
    label: 'Social',
    Component: SocialLinksSettings,
  },
]

function isBuilderSectionId(value: string | null): value is BuilderSectionId {
  return value === 'overview' || BUILDER_SECTIONS.some(section => section.id === value)
}

export default function WebsiteBuilder() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedSectionId = searchParams.get('section')
  const selectedSectionId: BuilderSectionId = isBuilderSectionId(requestedSectionId) ? requestedSectionId : 'overview'

  const selectedSection = useMemo(
    () => BUILDER_SECTIONS.find(section => section.id === selectedSectionId) ?? null,
    [selectedSectionId],
  )
  const SelectedComponent = selectedSection?.Component ?? null

  function selectSection(nextSectionId: BuilderSectionId) {
    setSearchParams({ section: nextSectionId })
  }

  const sectionTabs: Array<{ id: BuilderSectionId; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'hero', label: 'Hero' },
    { id: 'promo', label: 'Promo' },
    { id: 'gallery', label: 'Gallery' },
    { id: 'social', label: 'Social' },
  ]

  return (
    <div className="account-overview website-builder-page">
      <header className="account-overview__section-header website-builder-page__header">
        <div>
          <p className="account-overview__eyebrow">Website building</p>
          <h1>Website Builder</h1>
          <p className="account-overview__subtitle">
            Manage the public website from one place. Start with Overview, then open only the section you want to change.
          </p>
        </div>
      </header>

      <nav className="website-builder-page__tabs" aria-label="Website Builder sections">
        {sectionTabs.map(section => (
          <button
            key={section.id}
            type="button"
            className={`website-builder-page__tab ${selectedSectionId === section.id ? 'is-active' : ''}`}
            aria-pressed={selectedSectionId === section.id}
            onClick={() => selectSection(section.id)}
          >
            {section.label}
          </button>
        ))}
      </nav>

      {selectedSectionId === 'overview' ? (
        <section className="website-builder-page__overview" aria-label="Website Builder overview">
          {BUILDER_SECTIONS.map(section => (
            <button
              type="button"
              key={section.id}
              className="website-builder-page__overview-card"
              onClick={() => selectSection(section.id)}
            >
              <strong>{section.label}</strong>
              <span>
                {section.id === 'hero' ? 'Update the main website banner and headline.' :
                 section.id === 'promo' ? 'Manage current promotions and campaign content.' :
                 section.id === 'gallery' ? 'Manage public website photos and albums.' :
                 'Update public contact and social links.'}
              </span>
              <span className="website-builder-page__overview-action">Open →</span>
            </button>
          ))}
        </section>
      ) : selectedSection && SelectedComponent ? (
        <section className="website-builder-page__section-shell" aria-live="polite">
          <div className="website-builder-page__section-break">
            <span className="website-builder-page__section-kicker">Website section</span>
            <h2>{selectedSection.label}</h2>
          </div>

          <div className="website-builder-page__section-body">
            <SelectedComponent />
          </div>
        </section>
      ) : null}
    </div>
  )
}
