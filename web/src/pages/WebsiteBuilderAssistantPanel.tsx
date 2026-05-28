import React, { useCallback, useState } from 'react'

type SmartWebsiteCopy = {
  seoTitle: string
  homepage: string
  about: string
  serviceDescriptions: string
}

type BusinessProfile = {
  businessName: string
  location: string
  businessType: 'language_school' | 'school' | 'beauty' | 'travel' | 'ngo' | 'restaurant' | 'shop' | 'service'
}

function findButtonByText(text: string) {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
  return buttons.find(button => button.textContent?.toLowerCase().includes(text.toLowerCase())) ?? null
}

function normalizeText(value: string) { return value.replace(/\s+/g, ' ').trim() }
function pageText() { return normalizeText(document.body.innerText || '') }

function findFirstUsefulMatch(patterns: RegExp[]) {
  const text = pageText()
  for (const pattern of patterns) {
    const match = text.match(pattern)
    const value = normalizeText(match?.[1] || '')
    if (value && value.length <= 120) return value
  }
  return ''
}

function getInputValueNearLabel(labelText: string) {
  const labels = Array.from(document.querySelectorAll<HTMLLabelElement>('label'))
  const label = labels.find(item => item.textContent?.toLowerCase().includes(labelText.toLowerCase()))
  const input = label?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')
  return normalizeText(input?.value || '')
}

function inferBusinessProfile(): BusinessProfile {
  const body = pageText().toLowerCase()
  const businessName = getInputValueNearLabel('Business name') || 'This business'
  const location = getInputValueNearLabel('Location') || findFirstUsefulMatch([/Location\s+([^\n]{2,80})/i])
  const combined = `${businessName} ${body}`.toLowerCase()
  let businessType: BusinessProfile['businessType'] = 'service'
  if (/learn|language|german|deutsch|academy|education|school|course|class|student|training/.test(combined)) businessType = /language|german|deutsch/.test(combined) ? 'language_school' : 'school'
  else if (/beauty|spa|salon|makeup|nail|hair|lash|facial|massage/.test(combined)) businessType = 'beauty'
  else if (/travel|visa|tour|relocation|consultancy|admission|document review/.test(combined)) businessType = 'travel'
  else if (/foundation|ngo|donation|volunteer|impact|charity/.test(combined)) businessType = 'ngo'
  else if (/restaurant|food|menu|ordering|reservation/.test(combined)) businessType = 'restaurant'
  else if (/shop|store|products|checkout|inventory|market/.test(combined)) businessType = 'shop'
  return { businessName, location, businessType }
}

function buildSmartCopy(profile: BusinessProfile): SmartWebsiteCopy {
  const name = profile.businessName || 'This business'
  const where = profile.location ? ` in ${profile.location}` : ''
  return {
    seoTitle: `${name} | Services, Bookings, Enquiries and Payments`,
    homepage: `${name} helps customers understand available services, request support, book appointments, and make payments with ease${where}.`,
    about: `${name} is built around reliable service, clear communication, and a smoother customer experience.`,
    serviceDescriptions: 'Services: Clear descriptions of what customers can request and how each service helps.\n\nBookings and Enquiries: Simple ways for visitors to contact the business or request support.'
  }
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

function setFieldByLabel(labelText: string, value: string) {
  const labels = Array.from(document.querySelectorAll<HTMLLabelElement>('label'))
  const label = labels.find(item => item.textContent?.toLowerCase().includes(labelText.toLowerCase()))
  const field = label?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')
  if (!field) return false
  setNativeValue(field, value)
  return true
}

function applySmartCopy(copy: SmartWebsiteCopy) {
  setFieldByLabel('SEO title', copy.seoTitle)
  setFieldByLabel('Homepage content', copy.homepage)
  setFieldByLabel('About section', copy.about)
  setFieldByLabel('Service / product / program descriptions', copy.serviceDescriptions)
}

export default function WebsiteBuilderAssistantPanel() {
  const [statusMessage, setStatusMessage] = useState('')

  const generateAiText = useCallback(() => {
    setStatusMessage('Opening smarter content generator…')
    findButtonByText('Content')?.click()
    window.setTimeout(() => {
      findButtonByText('Generate all content')?.click()
      const smartCopy = buildSmartCopy(inferBusinessProfile())
      applySmartCopy(smartCopy)
      setStatusMessage('Smarter website text generated.')
      window.setTimeout(() => setStatusMessage(''), 3000)
    }, 220)
  }, [])

  return (
    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={generateAiText} className="rounded-2xl bg-gradient-to-r from-indigo-600 via-blue-600 to-emerald-500 px-4 py-3 text-sm font-bold text-white">
          ✨ Generate AI text
        </button>
        {statusMessage ? <p className="text-sm font-semibold text-indigo-700">{statusMessage}</p> : null}
      </div>
    </div>
  )
}
