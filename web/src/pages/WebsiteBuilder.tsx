import React, { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import GallerySettings from './GallerySettings'
import PromoSettings from './PromoSettings'
import SocialLinksSettings from './SocialLinksSettings'
import WebsiteHeroSlides from './WebsiteHeroSlides'
import './AccountOverview.css'
import './WebsiteBuilder.css'

type BuilderSectionId = 'promo' | 'gallery' | 'hero' | 'social'

type BuilderSection = {
  id: BuilderSectionId
  label: string
  description: string
  Component: React.ComponentType
}

const BUILDER_SECTIONS: BuilderSection[] = [
  {
    id: 'promo',
    label: 'Promo',
    description: 'Update the public promo title, dates, summary, image, and Sedifex public link content.',
    Component: PromoSettings,
  },
  {
    id: 'gallery',
    label: 'Gallery',
    description: 'Manage albums and images your public website can show in gallery sections.',
    Component: GallerySettings,
  },
  {
    id: 'hero',
    label: 'Hero page',
    description: 'Create homepage hero slides and banners for connected website templates.',
    Component: WebsiteHeroSlides,
  },
  {
    id: 'social',
    label: 'Social settings',
    description: 'Maintain public profile, contact, social links, logos, and share images.',
    Component: SocialLinksSettings,
  },
]

function isBuilderSectionId(value: string | null): value is BuilderSectionId {
  return BUILDER_SECTIONS.some(section => section.id === value)
}

export default function WebsiteBuilder() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedSectionId = searchParams.get('section')
  const selectedSectionId: BuilderSectionId = isBuilderSectionId(requestedSectionId) ? requestedSectionId : 'promo'

  const selectedSection = useMemo(
    () => BUILDER_SECTIONS.find(section => section.id === selectedSectionId) ?? BUILDER_SECTIONS[0],
    [selectedSectionId],
  )
  const SelectedComponent = selectedSection.Component

  function selectSection(nextSectionId: BuilderSectionId) {
    setSearchParams({ section: nextSectionId })
  }

  return (
    <div className="account-overview website-builder-page">
      <header className="account-overview__section-header website-builder-page__header">
        <div>
          <p className="account-overview__eyebrow">Website building</p>
          <h1>Website Builder</h1>
          <p className="account-overview__subtitle">
            Select Promo, Gallery, Hero page, or Social settings from one place. Each section keeps its existing design so stores can update website content without hunting through the main navigation.
          </p>
        </div>
      </header>

      <section className="account-overview__card website-builder-page__switcher" aria-labelledby="website-builder-section-label">
        <label htmlFor="website-builder-section">
          <span id="website-builder-section-label">Choose website section to update</span>
          <select
            id="website-builder-section"
            value={selectedSection.id}
            onChange={event => selectSection(event.target.value as BuilderSectionId)}
          >
            {BUILDER_SECTIONS.map(section => (
              <option key={section.id} value={section.id}>{section.label}</option>
            ))}
          </select>
        </label>
        <p className="account-overview__hint">{selectedSection.description}</p>
      </section>

      <div className="website-builder-page__section" aria-live="polite">
        <SelectedComponent />
      </div>
    </div>
  )
}
