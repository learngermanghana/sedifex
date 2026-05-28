import React, { useCallback, useMemo, useState } from 'react'
import { collection, getDocs, limit, query, where } from 'firebase/firestore'
import WebsiteBuilder from './WebsiteBuilder'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'

type WebsiteType = 'language_school' | 'school' | 'beauty' | 'travel' | 'ngo' | 'restaurant' | 'shop' | 'service'
type BuilderWebsiteType = 'school' | 'beauty' | 'travel' | 'ngo' | 'restaurant' | 'shop' | 'service'
type WebsiteTheme = 'modern' | 'luxury' | 'clean' | 'bold'

type SmartWebsiteCopy = {
  seoTitle: string
  homepage: string
  about: string
  serviceDescriptions: string
}

type BusinessProfile = {
  businessName: string
  location: string
  businessType: WebsiteType
}

type TemplateProfile = SmartWebsiteCopy & {
  id: string
  label: string
  shortLabel: string
  description: string
  businessType: BuilderWebsiteType
  theme: WebsiteTheme
  brandColor: string
  tagline: string
}

type OfferingSummary = {
  products: string[]
  services: string[]
  programs: string[]
  courses: string[]
  packages: string[]
  menuItems: string[]
  inventory: string[]
}

const BUILDER_TYPE_LABELS: Record<BuilderWebsiteType, string> = {
  shop: 'Shop website',
  beauty: 'Beauty / salon website',
  school: 'School website',
  travel: 'Travel agency website',
  ngo: 'NGO website',
  restaurant: 'Restaurant website',
  service: 'Service business website',
}

const TEMPLATE_LIBRARY: TemplateProfile[] = [
  {
    id: 'beauty-spa-premium',
    label: 'Beauty Spa Premium',
    shortLabel: 'Spa',
    description: 'For salons, spas, makeup, nails, facial, massage, and cosmetology training.',
    businessType: 'beauty',
    theme: 'luxury',
    brandColor: '#be185d',
    tagline: 'Beauty services designed around confidence and care',
    seoTitle: 'Beauty Services, Training, Bookings and Client Care',
    homepage: 'A premium beauty website for services, bookings, gallery, training programs, and easy online payments. Clients can explore treatments, book appointments, view photos, and connect quickly.',
    about: 'We provide professional beauty and wellness services with a focus on hygiene, comfort, visible results, and excellent client care. Our website makes bookings, enquiries, training registration, and payment simple.',
    serviceDescriptions: 'Beauty Services: Professional treatments for clients who want to look confident and feel cared for.\n\nBookings: Clients can request appointments and connect with the team quickly.\n\nTraining Courses: Practical beauty and cosmetology programs for students.\n\nPayments: Easy online payment and receipt support for services, courses, and bookings.',
  },
  {
    id: 'fashion-boutique',
    label: 'Fashion Boutique',
    shortLabel: 'Fashion',
    description: 'For clothing shops, wigs, bags, shoes, accessories, and boutique stores.',
    businessType: 'shop',
    theme: 'bold',
    brandColor: '#e11d48',
    tagline: 'Shop stylish products with easy online payment',
    seoTitle: 'Fashion Products, Online Orders and Secure Payments',
    homepage: 'A sales-focused online shop for products, categories, product photos, checkout, and fast customer action. Customers can browse products, contact the store, and pay online.',
    about: 'We help customers shop with confidence by showing available products, prices, photos, and quick payment options in one simple website.',
    serviceDescriptions: 'Products: Organized product listings with clear photos, pricing, and availability.\n\nOnline Checkout: Customers can order and pay without long back-and-forth conversations.\n\nReceipts: Buyers receive payment confirmation and receipts.\n\nInventory: Website sales can connect back to Sedifex records.',
  },
  {
    id: 'school-academy',
    label: 'School / Academy',
    shortLabel: 'School',
    description: 'For schools, language academies, training centres, and course registration.',
    businessType: 'school',
    theme: 'modern',
    brandColor: '#2563eb',
    tagline: 'Learn, register, and manage classes with ease',
    seoTitle: 'Courses, Registration, Classes and Student Payments',
    homepage: 'A clear education website for courses, registration, class information, student payments, and enquiries. Students can understand the program and take action quickly.',
    about: 'We provide structured learning programs with clear communication, guided registration, class support, and payment tracking.',
    serviceDescriptions: 'Courses: Clear course information, duration, fees, and learning outcomes.\n\nRegistration: A simple online registration flow for students.\n\nClasses: Class schedules and learning support information.\n\nStudent Payments: Online and manual payment support with receipts and balances.',
  },
  {
    id: 'restaurant-menu',
    label: 'Restaurant Menu',
    shortLabel: 'Food',
    description: 'For restaurants, food vendors, table QR, menu display, and ordering.',
    businessType: 'restaurant',
    theme: 'bold',
    brandColor: '#f97316',
    tagline: 'Great food with simple ordering and reservations',
    seoTitle: 'Menu, Online Ordering, Reservations and Payments',
    homepage: 'A restaurant website for menus, food photos, online ordering, table QR, reservations, and payments. Customers can see what is available and act fast.',
    about: 'We serve customers who want good food, clear menu options, and a smooth ordering experience from browsing to payment.',
    serviceDescriptions: 'Menu: Clear food and drink options for customers to browse.\n\nOnline Ordering: A simple way to send orders and enquiries.\n\nReservations: Customers can request tables or event bookings.\n\nPayments: Easy payment options for orders, bookings, and services.',
  },
  {
    id: 'travel-consultancy',
    label: 'Travel Agency',
    shortLabel: 'Travel',
    description: 'For visa support, admission, document review, travel, and relocation services.',
    businessType: 'travel',
    theme: 'clean',
    brandColor: '#0284c7',
    tagline: 'Clear travel planning from enquiry to booking',
    seoTitle: 'Travel, Visa, Study Abroad and Relocation Support',
    homepage: 'A trust-building travel website for consultations, packages, destinations, visa readiness, document review, bookings, and enquiries.',
    about: 'We support people who need trusted guidance for travel, education, documents, applications, and relocation planning.',
    serviceDescriptions: 'Consultation: One-on-one guidance to understand your goals and pathway.\n\nAdmission and Document Review: Support with applications, document preparation, and readiness checks.\n\nVisa Readiness: Guidance to help clients prepare stronger applications.\n\nTravel and Relocation Support: Practical information from enquiry to next steps.',
  },
  {
    id: 'ngo-foundation',
    label: 'NGO / Foundation',
    shortLabel: 'NGO',
    description: 'For foundations, programs, donations, volunteers, blog, and impact gallery.',
    businessType: 'ngo',
    theme: 'modern',
    brandColor: '#059669',
    tagline: 'Supporting communities through action and impact',
    seoTitle: 'Community Programs, Donations and Volunteer Support',
    homepage: 'An impact website for programs, donation pages, volunteer forms, gallery, blog, and community updates.',
    about: 'We create meaningful impact through practical community support, partnerships, volunteers, and donor contributions.',
    serviceDescriptions: 'Programs: Community initiatives designed to create practical impact.\n\nDonations: A simple way for supporters to contribute.\n\nVolunteers: Opportunities for people to offer time, skills, and support.\n\nImpact Updates: Stories and reports that show how support is being used.',
  },
]

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function builderRoot() {
  return document.querySelector('main') ?? document.body
}

function findButtonByText(text: string) {
  const buttons = Array.from(builderRoot().querySelectorAll<HTMLButtonElement>('button'))
    .filter(button => !button.closest('[data-smart-builder-panel="true"]'))
  return buttons.find(button => button.textContent?.toLowerCase().includes(text.toLowerCase())) ?? null
}

function pageText() {
  return normalizeText(document.body.innerText || '')
}

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
  const labels = Array.from(builderRoot().querySelectorAll<HTMLLabelElement>('label'))
  const label = labels.find(item => item.textContent?.toLowerCase().includes(labelText.toLowerCase()))
  const input = label?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')
  return normalizeText(input?.value || '')
}

function inferBusinessProfile(): BusinessProfile {
  const body = pageText().toLowerCase()
  const businessName =
    getInputValueNearLabel('Business name') ||
    findFirstUsefulMatch([/Current website\s+([^\n]+?)\s+https?:/i, /Preview\s+Home page preview.*?([A-Z][^\n]{3,80})/i]) ||
    'This business'
  const location = getInputValueNearLabel('Location') || findFirstUsefulMatch([/Location\s+([^\n]{2,80})/i])
  const combined = `${businessName} ${body}`.toLowerCase()

  let businessType: BusinessProfile['businessType'] = 'service'
  if (/learn|language|german|deutsch|academy|education|school|course|class|student|training/.test(combined)) businessType = /language|german|deutsch/.test(combined) ? 'language_school' : 'school'
  else if (/beauty|spa|salon|makeup|nail|hair|lash|facial|massage|skin|cosmetology/.test(combined)) businessType = 'beauty'
  else if (/travel|visa|tour|relocation|consultancy|admission|document review/.test(combined)) businessType = 'travel'
  else if (/foundation|ngo|donation|volunteer|impact|charity/.test(combined)) businessType = 'ngo'
  else if (/restaurant|food|menu|ordering|reservation|meal/.test(combined)) businessType = 'restaurant'
  else if (/shop|store|products|checkout|inventory|market|boutique/.test(combined)) businessType = 'shop'

  return { businessName, location, businessType }
}

function locationPhrase(location: string) {
  return location ? ` in ${location}` : ''
}

function buildSmartCopy(profile: BusinessProfile): SmartWebsiteCopy {
  const name = profile.businessName || 'This business'
  const where = locationPhrase(profile.location)

  if (profile.businessType === 'language_school') {
    return {
      seoTitle: `${name} | German & Language Courses, Exam Preparation and Study Support`,
      homepage: `${name} helps students build real language confidence through clear lessons, practical speaking practice, exam preparation, and guided learning support. Whether you are starting from A1 or preparing for higher-level German exams, our classes are structured to help you understand the language, speak with confidence, and stay consistent until you reach your goal.${where ? ` We support learners${where} and beyond with flexible learning options.` : ''}`,
      about: `${name} is a language education academy focused on helping students learn German and other language skills in a practical, organized, and supportive way. Our approach combines grammar, vocabulary, speaking, listening, reading, writing, assignments, and exam guidance so students learn how to communicate.`,
      serviceDescriptions: `German Language Courses: Structured A1, A2, B1, B2, and advanced learning paths.\n\nExam Preparation: Focused support for Goethe-style speaking, writing, reading, and listening tasks.\n\nSpeaking and Writing Practice: Practical exercises that help students form sentences and communicate better.\n\nStudent Registration and Payments: Students can register online and make payments easily.`,
    }
  }

  const template = TEMPLATE_LIBRARY.find(item => item.businessType === (profile.businessType === 'language_school' ? 'school' : profile.businessType as BuilderWebsiteType))
  if (template) {
    return {
      seoTitle: `${name} | ${template.seoTitle}`,
      homepage: `${name}${where} - ${template.homepage}`,
      about: template.about.replace(/^We /, `${name} `),
      serviceDescriptions: template.serviceDescriptions,
    }
  }

  return {
    seoTitle: `${name} | Services, Bookings, Enquiries and Payments`,
    homepage: `${name} helps customers understand available services, request support, book appointments, and make payments with ease. The website brings the most important business actions into one simple place${where}.`,
    about: `${name} is built around reliable service, clear communication, and a smoother customer experience.`,
    serviceDescriptions: `Services: Clear descriptions of what customers can request and how each service helps.\n\nBookings and Enquiries: Simple ways for visitors to contact the business or request support.\n\nPayments and Receipts: Easy payment options with records connected to Sedifex.`,
  }
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  valueSetter?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

function setFieldByLabel(labelText: string, value: string) {
  const labels = Array.from(builderRoot().querySelectorAll<HTMLLabelElement>('label'))
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

function readString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function unique(values: string[]) {
  return Array.from(new Set(values.map(value => normalizeText(value)).filter(Boolean)))
}

function readOfferingName(source: Record<string, unknown>) {
  return readString(source, ['name', 'productName', 'serviceName', 'courseName', 'title', 'itemName'])
}

async function fetchOfferingNames(storeId: string, collectionName: keyof OfferingSummary) {
  const names: string[] = []
  try {
    const nestedSnap = await getDocs(query(collection(db, 'stores', storeId, collectionName), limit(8)))
    nestedSnap.docs.forEach(itemDoc => {
      const name = readOfferingName(itemDoc.data() as Record<string, unknown>)
      if (name) names.push(name)
    })
  } catch (error) {
    console.info(`[website-builder] Nested ${collectionName} check unavailable`, error)
  }

  try {
    const topLevelSnap = await getDocs(query(collection(db, collectionName), where('storeId', '==', storeId), limit(8)))
    topLevelSnap.docs.forEach(itemDoc => {
      const name = readOfferingName(itemDoc.data() as Record<string, unknown>)
      if (name) names.push(name)
    })
  } catch (error) {
    console.info(`[website-builder] Top-level ${collectionName} check unavailable`, error)
  }

  return unique(names).slice(0, 8)
}

function detectTypeFromOfferings(summary: OfferingSummary): BuilderWebsiteType {
  const text = Object.values(summary).flat().join(' ').toLowerCase()
  if (summary.menuItems.length || /food|meal|restaurant|jollof|rice|pizza|drink|menu|chicken/.test(text)) return 'restaurant'
  if (summary.packages.length || /visa|travel|tour|flight|relocation|admission|document review|consultation/.test(text)) return 'travel'
  if (summary.courses.length || /course|class|academy|student|training|school|lesson|german|deutsch/.test(text)) return 'school'
  if (/beauty|spa|salon|makeup|nail|hair|lash|facial|massage|skin|wig|braid|waxing|microblading/.test(text)) return 'beauty'
  if (summary.programs.length || /ngo|foundation|donation|volunteer|charity|impact|community/.test(text)) return 'ngo'
  if (summary.products.length || summary.inventory.length) return 'shop'
  if (summary.services.length) return 'service'
  return 'shop'
}

function buildCopyFromSummary(businessName: string, location: string, template: TemplateProfile, summary: OfferingSummary): SmartWebsiteCopy {
  const allOfferings = unique(Object.values(summary).flat()).slice(0, 10)
  const offerLine = allOfferings.length ? allOfferings.join(', ') : template.description
  const where = location ? ` in ${location}` : ''
  return {
    seoTitle: `${businessName} | ${template.seoTitle}`,
    homepage: `${businessName}${where} is now easier to find online. Customers can explore ${offerLine}, contact the business, and take action through bookings, enquiries, or online payment powered by Sedifex.`,
    about: `${businessName} uses Sedifex to bring business information, customer actions, products, services, payments, and communication into one simple website. Visitors can understand what is available and connect faster.`,
    serviceDescriptions: allOfferings.length
      ? `Featured items from Sedifex:\n${allOfferings.map(item => `• ${item}: Available through the business website for enquiry, booking, or payment.`).join('\n')}\n\nCustomers can use the website to contact the business, view details, and complete the next action quickly.`
      : template.serviceDescriptions,
  }
}

export default function WebsiteBuilderWithAiText() {
  const { storeId } = useActiveStore()
  const [statusMessage, setStatusMessage] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)

  const quickTemplates = useMemo(() => TEMPLATE_LIBRARY, [])

  const clearStatusLater = useCallback((delay = 3500) => {
    window.setTimeout(() => setStatusMessage(''), delay)
  }, [])

  const openStep = useCallback((stepName: string) => {
    const stepButton = findButtonByText(stepName)
    stepButton?.click()
  }, [])

  const applyTemplate = useCallback((template: TemplateProfile, customCopy?: SmartWebsiteCopy) => {
    setStatusMessage(`Applying ${template.label} template…`)

    openStep('Website type')
    window.setTimeout(() => findButtonByText(BUILDER_TYPE_LABELS[template.businessType])?.click(), 120)

    window.setTimeout(() => {
      openStep('Theme')
      window.setTimeout(() => findButtonByText(template.theme)?.click(), 120)
    }, 260)

    window.setTimeout(() => {
      openStep('Business identity')
      window.setTimeout(() => {
        setFieldByLabel('Short tagline', template.tagline)
        setFieldByLabel('Brand color', template.brandColor)
      }, 120)
    }, 520)

    window.setTimeout(() => {
      openStep('Content')
      window.setTimeout(() => {
        applySmartCopy(customCopy ?? template)
        setStatusMessage(`${template.label} template applied.`)
        clearStatusLater()
      }, 160)
    }, 780)
  }, [clearStatusLater, openStep])

  const generateAiText = useCallback(() => {
    setStatusMessage('Opening smarter content generator…')
    openStep('Content')

    window.setTimeout(() => {
      const generateButton = findButtonByText('Generate all content')
      generateButton?.click()

      window.setTimeout(() => {
        const profile = inferBusinessProfile()
        const smartCopy = buildSmartCopy(profile)
        applySmartCopy(smartCopy)
        setStatusMessage(`Smarter ${profile.businessType.replace('_', ' ')} website text generated.`)
        clearStatusLater()
      }, 260)
    }, 220)
  }, [clearStatusLater, openStep])

  const buildFromSedifexData = useCallback(async () => {
    if (!storeId) {
      setStatusMessage('No active Sedifex store found yet.')
      clearStatusLater()
      return
    }

    setStatusMessage('Scanning products, services, courses, and business data…')
    try {
      const [products, services, programs, courses, packages, menuItems, inventory] = await Promise.all([
        fetchOfferingNames(storeId, 'products'),
        fetchOfferingNames(storeId, 'services'),
        fetchOfferingNames(storeId, 'programs'),
        fetchOfferingNames(storeId, 'courses'),
        fetchOfferingNames(storeId, 'packages'),
        fetchOfferingNames(storeId, 'menuItems'),
        fetchOfferingNames(storeId, 'inventory'),
      ])

      const summary: OfferingSummary = { products, services, programs, courses, packages, menuItems, inventory }
      const detectedType = detectTypeFromOfferings(summary)
      const template = TEMPLATE_LIBRARY.find(item => item.businessType === detectedType) ?? TEMPLATE_LIBRARY[0]
      const businessName = getInputValueNearLabel('Business name') || 'This business'
      const location = getInputValueNearLabel('Location')
      const smartCopy = buildCopyFromSummary(businessName, location, template, summary)

      applyTemplate(template, smartCopy)
      const itemCount = Object.values(summary).flat().length
      setStatusMessage(itemCount ? `Auto-built from ${itemCount} Sedifex items.` : 'Auto-built from current business profile. Add products/services for richer content.')
      clearStatusLater(4500)
    } catch (error) {
      console.error('[website-builder] Auto build failed', error)
      setStatusMessage('Could not auto-build from Sedifex data. Try again after products/services are saved.')
      clearStatusLater(4500)
    }
  }, [applyTemplate, clearStatusLater, storeId])

  return (
    <>
      <WebsiteBuilder />
      <div data-smart-builder-panel="true" className="fixed bottom-24 right-5 z-50 flex max-w-[340px] flex-col items-end gap-2 md:bottom-8">
        {statusMessage ? (
          <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-xl">
            {statusMessage}
          </div>
        ) : null}

        {panelOpen ? (
          <div className="max-h-[70vh] w-[min(340px,calc(100vw-2rem))] overflow-y-auto rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-indigo-600">Smart builder</p>
                <h3 className="mt-1 text-lg font-black text-slate-950">Templates + Sedifex data</h3>
              </div>
              <button type="button" className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600" onClick={() => setPanelOpen(false)}>Close</button>
            </div>

            <button
              type="button"
              onClick={() => void buildFromSedifexData()}
              className="mt-4 w-full rounded-2xl bg-slate-950 px-4 py-3 text-left text-sm font-extrabold text-white transition hover:-translate-y-0.5"
            >
              ⚡ Build automatically from Sedifex data
              <span className="mt-1 block text-xs font-medium text-slate-300">Uses products, services, courses, packages, menu items, and inventory.</span>
            </button>

            <button
              type="button"
              onClick={generateAiText}
              className="mt-3 w-full rounded-2xl bg-gradient-to-r from-indigo-600 via-blue-600 to-emerald-500 px-4 py-3 text-left text-sm font-extrabold text-white transition hover:-translate-y-0.5"
            >
              ✨ Generate smarter website text
              <span className="mt-1 block text-xs font-medium text-white/80">Improves homepage, About, service descriptions, and SEO title.</span>
            </button>

            <div className="mt-4 grid gap-2">
              {quickTemplates.map(template => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => applyTemplate(template)}
                  className="rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-indigo-200 hover:bg-indigo-50"
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-black text-slate-950">{template.label}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{template.shortLabel}</span>
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-600">{template.description}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setPanelOpen(previous => !previous)}
          className="rounded-full bg-slate-950 px-5 py-3 text-sm font-extrabold text-white shadow-2xl transition hover:-translate-y-0.5 hover:shadow-indigo-200 focus:outline-none focus:ring-4 focus:ring-indigo-200"
          aria-label="Open smart website builder tools"
        >
          ⚡ Smart build
        </button>
      </div>
    </>
  )
}
