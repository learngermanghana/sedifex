import React, { FormEvent, useEffect, useMemo, useState } from 'react'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import PageSection from '../layout/PageSection'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'

type WebsiteType = 'shop' | 'beauty' | 'school' | 'travel' | 'ngo' | 'restaurant' | 'service'
type WebsiteTheme = 'modern' | 'luxury' | 'clean' | 'bold'
type StoredWebsiteStatus = 'draft' | 'published'
type DisplayWebsiteStatus = StoredWebsiteStatus | 'needs-setup'
type PreviewMode = 'mobile' | 'desktop'
type BuilderStepId = 'identity' | 'type' | 'pages' | 'theme' | 'content' | 'payments' | 'domain' | 'publish'

type WebsiteBuilderSettings = {
  slug: string
  websiteType: WebsiteType
  theme: WebsiteTheme
  pages: string[]
  status: StoredWebsiteStatus
}

type WebsiteTypeOption = {
  id: WebsiteType
  label: string
  description: string
  icon: string
  accentClassName: string
}

type WebsiteThemeOption = {
  id: WebsiteTheme
  label: string
  description: string
  previewClassName: string
  headingClassName: string
  buttonClassName: string
  textClassName: string
  surfaceClassName: string
  mutedSurfaceClassName: string
}

type PreviewContent = {
  eyebrow: string
  headline: string
  body: string
  cta: string
  cards: string[]
}

const BUILDER_STEPS: Array<{ id: BuilderStepId; label: string; description: string }> = [
  { id: 'identity', label: 'Business identity', description: 'Name, logo direction, and public link.' },
  { id: 'type', label: 'Website type', description: 'Choose the right structure for the business.' },
  { id: 'pages', label: 'Pages', description: 'Select the pages customers should see.' },
  { id: 'theme', label: 'Theme', description: 'Pick the visual style and feel.' },
  { id: 'content', label: 'Content', description: 'Connect website sections to Sedifex data.' },
  { id: 'payments', label: 'Payments / Quick Pay', description: 'Prepare checkout and payment pages.' },
  { id: 'domain', label: 'Domain', description: 'Use Sedifex subdomain or custom domain.' },
  { id: 'publish', label: 'Publish', description: 'Review and send the website live.' },
]

const WEBSITE_TYPES: WebsiteTypeOption[] = [
  {
    id: 'shop',
    label: 'Shop website',
    description: 'Products, categories, checkout, and Quick Pay.',
    icon: '🛍️',
    accentClassName: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
  },
  {
    id: 'beauty',
    label: 'Beauty / salon website',
    description: 'Services, bookings, gallery, and client payments.',
    icon: '✨',
    accentClassName: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-100',
  },
  {
    id: 'school',
    label: 'School website',
    description: 'Courses, registrations, classes, and student payments.',
    icon: '🎓',
    accentClassName: 'bg-blue-50 text-blue-700 ring-blue-100',
  },
  {
    id: 'travel',
    label: 'Travel agency website',
    description: 'Trips, bookings, leads, and enquiry payments.',
    icon: '✈️',
    accentClassName: 'bg-sky-50 text-sky-700 ring-sky-100',
  },
  {
    id: 'ngo',
    label: 'NGO website',
    description: 'Programs, donations, volunteers, and impact gallery.',
    icon: '🤝',
    accentClassName: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  },
  {
    id: 'restaurant',
    label: 'Restaurant website',
    description: 'Menu, table QR, ordering, and payments.',
    icon: '🍽️',
    accentClassName: 'bg-orange-50 text-orange-700 ring-orange-100',
  },
  {
    id: 'service',
    label: 'Service business website',
    description: 'Services, invoices, bookings, and Quick Pay.',
    icon: '🧰',
    accentClassName: 'bg-slate-100 text-slate-700 ring-slate-200',
  },
]

const THEMES: WebsiteThemeOption[] = [
  {
    id: 'modern',
    label: 'Modern',
    description: 'Clean sections with strong call-to-action buttons.',
    previewClassName: 'from-indigo-500 via-blue-500 to-cyan-400',
    headingClassName: 'bg-white/95',
    buttonClassName: 'bg-slate-950 text-white',
    textClassName: 'text-white',
    surfaceClassName: 'bg-white text-slate-950',
    mutedSurfaceClassName: 'bg-white/15 text-white',
  },
  {
    id: 'luxury',
    label: 'Luxury',
    description: 'Premium spacing, darker accents, and elegant visuals.',
    previewClassName: 'from-slate-950 via-stone-800 to-amber-600',
    headingClassName: 'bg-amber-100/90',
    buttonClassName: 'bg-amber-400 text-slate-950',
    textClassName: 'text-amber-50',
    surfaceClassName: 'bg-stone-950 text-amber-50',
    mutedSurfaceClassName: 'bg-amber-100/15 text-amber-50',
  },
  {
    id: 'clean',
    label: 'Clean',
    description: 'Simple, bright, and easy for small businesses.',
    previewClassName: 'from-slate-100 via-white to-blue-100',
    headingClassName: 'bg-slate-900',
    buttonClassName: 'bg-blue-500 text-white',
    textClassName: 'text-slate-950',
    surfaceClassName: 'bg-white text-slate-950',
    mutedSurfaceClassName: 'bg-slate-900/5 text-slate-700',
  },
  {
    id: 'bold',
    label: 'Bold',
    description: 'High contrast design for sales and promotions.',
    previewClassName: 'from-rose-500 via-orange-400 to-yellow-300',
    headingClassName: 'bg-white',
    buttonClassName: 'bg-rose-700 text-white',
    textClassName: 'text-white',
    surfaceClassName: 'bg-white text-slate-950',
    mutedSurfaceClassName: 'bg-white/20 text-white',
  },
]

const PAGE_OPTIONS = [
  'Home',
  'About',
  'Products',
  'Services',
  'Courses',
  'Bookings',
  'Gallery',
  'Blog',
  'Contact',
  'Quick Pay',
]

const CONTENT_MODULES = [
  { label: 'Products / Services', description: 'Pull items directly from Sedifex inventory and service records.' },
  { label: 'Gallery', description: 'Show business photos, work samples, or treatment/course images.' },
  { label: 'Promotions', description: 'Highlight offers, featured products, and seasonal campaigns.' },
  { label: 'Contact details', description: 'Use store profile details so customers can call, WhatsApp, or visit.' },
]

const PREVIEW_CONTENT: Record<WebsiteType, PreviewContent> = {
  shop: {
    eyebrow: 'Online shop',
    headline: 'Shop products and pay safely online.',
    body: 'Show products, promotions, checkout, and Quick Pay from one public website.',
    cta: 'Shop now',
    cards: ['Featured products', 'New arrivals', 'Quick Pay'],
  },
  beauty: {
    eyebrow: 'Beauty studio',
    headline: 'Book beauty services with confidence.',
    body: 'Display services, gallery, bookings, reviews, and client payments in one place.',
    cta: 'Book appointment',
    cards: ['Popular services', 'Gallery', 'Client booking'],
  },
  school: {
    eyebrow: 'School website',
    headline: 'Courses, registration, and student payments.',
    body: 'Promote classes, accept enquiries, and connect course registration to Sedifex.',
    cta: 'Register now',
    cards: ['Courses', 'Class schedule', 'Student payments'],
  },
  travel: {
    eyebrow: 'Travel agency',
    headline: 'Turn travel enquiries into bookings.',
    body: 'Show packages, collect leads, receive booking requests, and track payments.',
    cta: 'Send enquiry',
    cards: ['Travel packages', 'Visa support', 'Consultation'],
  },
  ngo: {
    eyebrow: 'Impact website',
    headline: 'Share your mission and collect support.',
    body: 'Highlight programs, donations, volunteer forms, and impact stories.',
    cta: 'Support us',
    cards: ['Programs', 'Donations', 'Impact gallery'],
  },
  restaurant: {
    eyebrow: 'Restaurant website',
    headline: 'Show your menu and receive orders.',
    body: 'Publish menu items, ordering links, table QR, and customer payments.',
    cta: 'View menu',
    cards: ['Menu', 'Table QR', 'Order online'],
  },
  service: {
    eyebrow: 'Service business',
    headline: 'Sell services and receive bookings online.',
    body: 'Show service packages, accept bookings, issue invoices, and collect Quick Pay.',
    cta: 'Request service',
    cards: ['Services', 'Bookings', 'Invoices'],
  },
}

const STATUS_CONFIG: Record<DisplayWebsiteStatus, { label: string; className: string; dotClassName: string }> = {
  draft: {
    label: 'Draft',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
    dotClassName: 'bg-amber-500',
  },
  published: {
    label: 'Published',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    dotClassName: 'bg-emerald-500',
  },
  'needs-setup': {
    label: 'Needs setup',
    className: 'border-rose-200 bg-rose-50 text-rose-700',
    dotClassName: 'bg-rose-500',
  },
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function togglePage(pages: string[], page: string) {
  return pages.includes(page) ? pages.filter(item => item !== page) : [...pages, page]
}

function getDisplayStatus(settings: WebsiteBuilderSettings, storeId: string | null): DisplayWebsiteStatus {
  if (!storeId || !settings.slug || settings.pages.length === 0) return 'needs-setup'
  return settings.status
}

export default function WebsiteBuilder() {
  const { storeId, isLoading } = useActiveStore()
  const [businessName, setBusinessName] = useState('')
  const [settings, setSettings] = useState<WebsiteBuilderSettings>({
    slug: '',
    websiteType: 'shop',
    theme: 'modern',
    pages: ['Home', 'Products', 'Services', 'Gallery', 'Contact', 'Quick Pay'],
    status: 'draft',
  })
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [previewMode, setPreviewMode] = useState<PreviewMode>('desktop')
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)
  const [activeStep, setActiveStep] = useState<BuilderStepId>('identity')

  const previewUrl = useMemo(() => {
    const slug = settings.slug || 'your-business'
    return `https://sites.sedifex.com/${slug}`
  }, [settings.slug])

  const displayStatus = getDisplayStatus(settings, storeId)
  const statusConfig = STATUS_CONFIG[displayStatus]
  const selectedType = WEBSITE_TYPES.find(type => type.id === settings.websiteType) ?? WEBSITE_TYPES[0]
  const selectedTheme = THEMES.find(theme => theme.id === settings.theme) ?? THEMES[0]
  const previewContent = PREVIEW_CONTENT[settings.websiteType]
  const previewPages = settings.pages.length ? settings.pages.slice(0, 5) : ['Home']
  const canPublish = Boolean(storeId && settings.slug && settings.pages.length > 0 && !isLoading && !isSaving)
  const currentStepIndex = BUILDER_STEPS.findIndex(step => step.id === activeStep)
  const safeStepIndex = currentStepIndex >= 0 ? currentStepIndex : 0
  const currentStep = BUILDER_STEPS[safeStepIndex]
  const progressPercent = Math.round(((safeStepIndex + 1) / BUILDER_STEPS.length) * 100)

  const stepCompletion: Record<BuilderStepId, boolean> = {
    identity: Boolean(businessName.trim() && settings.slug),
    type: Boolean(settings.websiteType),
    pages: settings.pages.length > 0,
    theme: Boolean(settings.theme),
    content: settings.pages.length > 0,
    payments: settings.pages.includes('Quick Pay'),
    domain: Boolean(settings.slug),
    publish: settings.status === 'published',
  }

  const completionItems = [
    { label: 'Business identity', complete: stepCompletion.identity },
    { label: 'Website type', complete: stepCompletion.type },
    { label: 'Pages selected', complete: stepCompletion.pages },
    { label: 'Theme selected', complete: stepCompletion.theme },
    { label: 'Quick Pay page', complete: stepCompletion.payments },
    { label: 'Domain slug', complete: stepCompletion.domain },
  ]

  useEffect(() => {
    let mounted = true

    async function loadSettings() {
      if (!storeId) return
      setFeedback('Loading website settings…')

      try {
        const [storeSnap, settingsSnap] = await Promise.all([
          getDoc(doc(db, 'stores', storeId)),
          getDoc(doc(db, 'storeSettings', storeId)),
        ])

        if (!mounted) return

        const storeData = storeSnap.exists() ? (storeSnap.data() as Record<string, unknown>) : {}
        const name =
          typeof storeData.businessName === 'string' && storeData.businessName.trim()
            ? storeData.businessName.trim()
            : typeof storeData.storeName === 'string' && storeData.storeName.trim()
              ? storeData.storeName.trim()
              : typeof storeData.name === 'string' && storeData.name.trim()
                ? storeData.name.trim()
                : 'My business'
        setBusinessName(name)

        const data = settingsSnap.exists() ? (settingsSnap.data() as Record<string, unknown>) : {}
        const website = data.websiteBuilder && typeof data.websiteBuilder === 'object'
          ? data.websiteBuilder as Partial<WebsiteBuilderSettings>
          : null

        setSettings(previous => ({
          ...previous,
          slug: website?.slug || slugify(name),
          websiteType: website?.websiteType || previous.websiteType,
          theme: website?.theme || previous.theme,
          pages: Array.isArray(website?.pages) && website.pages.length ? website.pages : previous.pages,
          status: website?.status === 'published' ? 'published' : 'draft',
        }))
        setFeedback(null)
      } catch (loadError) {
        console.error('[website-builder] Unable to load settings', loadError)
        setError('Unable to load website settings.')
        setFeedback(null)
      }
    }

    void loadSettings()
    return () => {
      mounted = false
    }
  }, [storeId])

  async function saveSettings(nextStatus: StoredWebsiteStatus) {
    if (!storeId) {
      setError('No active store selected.')
      return
    }

    const normalizedSlug = slugify(settings.slug || businessName || storeId)
    if (!normalizedSlug) {
      setError('Enter a website slug.')
      return
    }

    if (nextStatus === 'published' && settings.pages.length === 0) {
      setError('Select at least one page before publishing.')
      return
    }

    setIsSaving(true)
    setError(null)
    setFeedback(nextStatus === 'published' ? 'Publishing website…' : 'Saving draft…')

    try {
      const payload: WebsiteBuilderSettings = {
        ...settings,
        slug: normalizedSlug,
        status: nextStatus,
      }

      await setDoc(
        doc(db, 'storeSettings', storeId),
        {
          websiteBuilder: {
            ...payload,
            storeId,
            businessName,
            publicUrl: `https://sites.sedifex.com/${normalizedSlug}`,
            updatedAt: serverTimestamp(),
            publishedAt: nextStatus === 'published' ? serverTimestamp() : null,
          },
        },
        { merge: true },
      )

      setSettings(payload)
      setFeedback(nextStatus === 'published' ? 'Website published successfully.' : 'Website draft saved.')
    } catch (saveError) {
      console.error('[website-builder] Unable to save settings', saveError)
      setError('Unable to save website settings.')
      setFeedback(null)
    } finally {
      setIsSaving(false)
    }
  }

  async function copyWebsiteLink() {
    try {
      await navigator.clipboard.writeText(previewUrl)
      setCopyFeedback('Website link copied.')
    } catch (copyError) {
      console.error('[website-builder] Unable to copy website link', copyError)
      setCopyFeedback('Could not copy link. You can copy it from the preview URL.')
    }

    window.setTimeout(() => setCopyFeedback(null), 2500)
  }

  function goToStep(offset: number) {
    const nextIndex = Math.min(Math.max(safeStepIndex + offset, 0), BUILDER_STEPS.length - 1)
    setActiveStep(BUILDER_STEPS[nextIndex].id)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void saveSettings('draft')
  }

  return (
    <PageSection
      title="Website Builder"
      subtitle="Control your business website from Sedifex: setup, pages, theme, preview, and publishing from one place."
      className="pt-8 md:pt-10"
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold ${statusConfig.className}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${statusConfig.dotClassName}`} />
            {statusConfig.label}
          </span>
          <a className="button button--ghost" href={previewUrl} target="_blank" rel="noreferrer">
            Preview website
          </a>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.72fr)]">
        <div className="space-y-6">
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-6 text-white shadow-sm">
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-200">Business website control center</p>
                <h3 className="mt-3 text-2xl font-bold tracking-tight md:text-3xl">Build and publish a website step by step</h3>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">
                  A guided setup helps normal business owners finish their website without facing one long form.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm shadow-xl backdrop-blur">
                <p className="text-slate-300">Current website</p>
                <p className="mt-1 font-semibold text-white">{businessName || 'Loading business…'}</p>
                <p className="mt-3 break-all rounded-xl bg-white/10 px-3 py-2 text-cyan-100">{previewUrl}</p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Setup wizard</p>
                <h3 className="mt-1 text-xl font-semibold text-slate-950">{currentStep.label}</h3>
                <p className="mt-1 text-sm text-slate-500">Step {safeStepIndex + 1} of {BUILDER_STEPS.length}: {currentStep.description}</p>
              </div>
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-bold text-indigo-700">{progressPercent}% complete</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {BUILDER_STEPS.map((step, index) => {
                const isActive = activeStep === step.id
                const isComplete = stepCompletion[step.id]
                return (
                  <button
                    key={step.id}
                    type="button"
                    className={`rounded-2xl border p-3 text-left transition ${
                      isActive
                        ? 'border-indigo-500 bg-indigo-50 shadow-sm ring-2 ring-indigo-100'
                        : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50'
                    }`}
                    onClick={() => setActiveStep(step.id)}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${isActive ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{index + 1}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isComplete ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{isComplete ? 'Done' : 'Open'}</span>
                    </span>
                    <span className="mt-2 block text-sm font-bold text-slate-900">{step.label}</span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            {activeStep === 'identity' ? (
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Business identity</p>
                <h3 className="mt-1 text-2xl font-semibold text-slate-950">Start with the business details</h3>
                <p className="mt-2 text-sm text-slate-500">This controls the website name, preview header, and public Sedifex link.</p>

                <div className="mt-6 grid gap-5 lg:grid-cols-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    Business name
                    <input
                      className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50"
                      value={businessName}
                      onChange={event => setBusinessName(event.target.value)}
                      placeholder="Glittering Med Spa"
                    />
                  </label>
                  <label className="block text-sm font-semibold text-slate-700">
                    Website slug
                    <div className="mt-2 flex flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-50 sm:flex-row">
                      <span className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-slate-500 sm:border-b-0 sm:border-r">sites.sedifex.com/</span>
                      <input
                        className="min-w-0 flex-1 px-4 py-3 outline-none"
                        value={settings.slug}
                        onChange={event => setSettings(previous => ({ ...previous, slug: slugify(event.target.value) }))}
                        placeholder="glittering-med-spa"
                      />
                    </div>
                  </label>
                </div>

                <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
                  <p className="font-semibold text-slate-900">Logo and brand image</p>
                  <p className="mt-1 text-sm text-slate-600">Next, this area can connect to the store logo uploader. For now, the preview uses the business type icon as the logo placeholder.</p>
                </div>
              </div>
            ) : null}

            {activeStep === 'type' ? (
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Website type</p>
                <h3 className="mt-1 text-2xl font-semibold text-slate-950">Choose the website structure</h3>
                <p className="mt-2 text-sm text-slate-500">Sedifex will use this to show the right layout, call-to-action, and connected modules.</p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {WEBSITE_TYPES.map(type => {
                    const isSelected = settings.websiteType === type.id
                    return (
                      <button
                        key={type.id}
                        type="button"
                        className={`group rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg ${
                          isSelected
                            ? 'border-indigo-500 bg-indigo-50 shadow-md ring-4 ring-indigo-100'
                            : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50'
                        }`}
                        onClick={() => setSettings(previous => ({ ...previous, websiteType: type.id }))}
                      >
                        <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl text-xl ring-1 ${type.accentClassName}`}>{type.icon}</span>
                        <span className="mt-4 block font-semibold text-slate-950">{type.label}</span>
                        <span className="mt-1 block text-sm leading-5 text-slate-600">{type.description}</span>
                        {isSelected ? <span className="mt-3 inline-flex text-xs font-semibold text-indigo-700">Selected</span> : null}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}

            {activeStep === 'pages' ? (
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Pages</p>
                <h3 className="mt-1 text-2xl font-semibold text-slate-950">Select what customers should see</h3>
                <p className="mt-2 text-sm text-slate-500">Choose only the pages the business needs. The preview navigation updates immediately.</p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {PAGE_OPTIONS.map(page => {
                    const isChecked = settings.pages.includes(page)
                    return (
                      <label
                        key={page}
                        className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 text-sm font-semibold transition ${
                          isChecked
                            ? 'border-indigo-300 bg-indigo-50 text-indigo-800 ring-2 ring-indigo-100'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          checked={isChecked}
                          onChange={() => setSettings(previous => ({ ...previous, pages: togglePage(previous.pages, page) }))}
                        />
                        <span>{page}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            ) : null}

            {activeStep === 'theme' ? (
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Theme</p>
                <h3 className="mt-1 text-2xl font-semibold text-slate-950">Pick the design style</h3>
                <p className="mt-2 text-sm text-slate-500">The live preview changes immediately when a theme is selected.</p>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {THEMES.map(theme => {
                    const isSelected = settings.theme === theme.id
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        className={`rounded-3xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg ${
                          isSelected
                            ? 'border-indigo-500 bg-indigo-50 shadow-md ring-4 ring-indigo-100'
                            : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50'
                        }`}
                        onClick={() => setSettings(previous => ({ ...previous, theme: theme.id }))}
                      >
                        <div className={`rounded-2xl bg-gradient-to-br ${theme.previewClassName} p-5`}>
                          <div className={`h-3 w-24 rounded-full ${theme.headingClassName}`} />
                          <div className="mt-5 space-y-2">
                            <div className="h-2.5 rounded-full bg-white/80" />
                            <div className="h-2.5 w-2/3 rounded-full bg-white/60" />
                          </div>
                          <div className={`mt-5 h-8 w-28 rounded-full ${theme.buttonClassName}`} />
                        </div>
                        <div className="mt-4 flex items-start justify-between gap-3">
                          <div>
                            <span className="block font-semibold text-slate-950">{theme.label}</span>
                            <span className="mt-1 block text-sm leading-5 text-slate-600">{theme.description}</span>
                          </div>
                          {isSelected ? <span className="rounded-full bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white">Active</span> : null}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}

            {activeStep === 'content' ? (
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Content</p>
                <h3 className="mt-1 text-2xl font-semibold text-slate-950">Connect website content to Sedifex</h3>
                <p className="mt-2 text-sm text-slate-500">This step explains what data the public website should pull from the business workspace.</p>

                <div className="mt-6 grid gap-3 md:grid-cols-2">
                  {CONTENT_MODULES.map(module => (
                    <div key={module.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="font-semibold text-slate-950">{module.label}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{module.description}</p>
                      <span className="mt-3 inline-flex rounded-full bg-white px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-100">Auto from Sedifex</span>
                    </div>
                  ))}
                </div>

                <div className="mt-5 rounded-2xl bg-indigo-50 p-4 text-sm text-indigo-800">
                  Selected pages: <span className="font-bold">{settings.pages.join(', ') || 'No pages selected yet'}</span>
                </div>
              </div>
            ) : null}

            {activeStep === 'payments' ? (
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Payments / Quick Pay</p>
                <h3 className="mt-1 text-2xl font-semibold text-slate-950">Prepare the website for payments</h3>
                <p className="mt-2 text-sm text-slate-500">Quick Pay gives customers a simple way to pay from the public website.</p>

                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950">Quick Pay page</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">Add a payment page for invoices, service payments, deposits, and customer balances.</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${settings.pages.includes('Quick Pay') ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {settings.pages.includes('Quick Pay') ? 'Enabled' : 'Off'}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="mt-5 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white"
                      onClick={() => setSettings(previous => ({ ...previous, pages: togglePage(previous.pages, 'Quick Pay') }))}
                    >
                      {settings.pages.includes('Quick Pay') ? 'Remove Quick Pay' : 'Enable Quick Pay'}
                    </button>
                  </div>

                  <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5">
                    <p className="font-semibold text-slate-950">Payment setup checklist</p>
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                      <li>• Confirm store payout account.</li>
                      <li>• Connect checkout fees and split rules.</li>
                      <li>• Allow customers to pay from products, services, or Quick Pay.</li>
                    </ul>
                  </div>
                </div>
              </div>
            ) : null}

            {activeStep === 'domain' ? (
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Domain</p>
                <h3 className="mt-1 text-2xl font-semibold text-slate-950">Choose the website address</h3>
                <p className="mt-2 text-sm text-slate-500">Start with a Sedifex subdomain, then connect a custom domain when the business is ready.</p>

                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-3xl border border-indigo-200 bg-indigo-50 p-5">
                    <p className="font-semibold text-indigo-950">Sedifex subdomain</p>
                    <p className="mt-2 break-all rounded-2xl bg-white px-4 py-3 text-sm font-bold text-indigo-700">{previewUrl}</p>
                    <p className="mt-3 text-sm leading-6 text-indigo-800">This is ready for every business immediately after publishing.</p>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="font-semibold text-slate-950">Custom domain</p>
                    <input
                      className="mt-3 w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-500"
                      value="www.businessname.com"
                      readOnly
                    />
                    <p className="mt-3 text-sm leading-6 text-slate-600">Coming next: DNS instructions, verification status, and SSL status.</p>
                  </div>
                </div>
              </div>
            ) : null}

            {activeStep === 'publish' ? (
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Publish</p>
                <h3 className="mt-1 text-2xl font-semibold text-slate-950">Review and publish the website</h3>
                <p className="mt-2 text-sm text-slate-500">Check the setup, save a draft, or publish the public website settings.</p>

                <div className="mt-6 grid gap-3 md:grid-cols-2">
                  {completionItems.map(item => (
                    <div key={item.label} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                      <span className="font-medium text-slate-700">{item.label}</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${item.complete ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {item.complete ? 'Done' : 'Missing'}
                      </span>
                    </div>
                  ))}
                </div>

                {feedback ? <p className="mt-4 rounded-2xl bg-indigo-50 p-3 text-sm font-medium text-indigo-700">{feedback}</p> : null}
                {error ? <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p> : null}

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <button
                    className="rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 px-5 py-4 text-base font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:from-slate-400 disabled:to-slate-400 disabled:shadow-none"
                    type="button"
                    disabled={!canPublish}
                    onClick={() => void saveSettings('published')}
                  >
                    {isSaving ? 'Publishing…' : 'Publish website'}
                  </button>
                  <button
                    className="rounded-2xl border border-slate-300 bg-white px-5 py-4 text-base font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    type="submit"
                    disabled={isSaving || isLoading}
                  >
                    Save draft
                  </button>
                </div>
              </div>
            ) : null}

            {activeStep !== 'publish' ? (
              <div className="mt-8 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={safeStepIndex === 0}
                  onClick={() => goToStep(-1)}
                >
                  Previous step
                </button>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="submit"
                    className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isSaving || isLoading}
                  >
                    Save draft
                  </button>
                  <button
                    type="button"
                    className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5"
                    onClick={() => goToStep(1)}
                  >
                    Next step
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="sticky top-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/70 md:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Preview</p>
                <h3 className="mt-1 text-xl font-semibold text-slate-950">Home page preview</h3>
                <p className="mt-1 text-sm text-slate-500">Live preview updates when theme, pages, or business type changes.</p>
              </div>
              <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${statusConfig.className}`}>
                <span className={`h-2 w-2 rounded-full ${statusConfig.dotClassName}`} />
                {statusConfig.label}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 rounded-2xl bg-slate-100 p-1 text-sm font-semibold">
              <button
                type="button"
                className={`rounded-xl px-3 py-2 transition ${previewMode === 'mobile' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                onClick={() => setPreviewMode('mobile')}
              >
                Mobile preview
              </button>
              <button
                type="button"
                className={`rounded-xl px-3 py-2 transition ${previewMode === 'desktop' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                onClick={() => setPreviewMode('desktop')}
              >
                Desktop preview
              </button>
            </div>

            <div className="mt-5 rounded-[2rem] border border-slate-200 bg-slate-100 p-3">
              <div className={`${previewMode === 'mobile' ? 'mx-auto max-w-[285px] rounded-[1.75rem]' : 'rounded-[1.75rem]'} overflow-hidden border border-slate-900/10 bg-white shadow-sm`}>
                <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-4 py-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                  <span className="ml-2 truncate rounded-full bg-white px-3 py-1 text-[10px] font-medium text-slate-500">{previewUrl}</span>
                </div>

                <div className={`bg-gradient-to-br ${selectedTheme.previewClassName} p-4 ${selectedTheme.textClassName}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-lg ring-1 ${selectedType.accentClassName}`}>{selectedType.icon}</span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{businessName || 'My business'}</p>
                        <p className="truncate text-[11px] opacity-75">{selectedType.label}</p>
                      </div>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${selectedTheme.buttonClassName}`}>Pay</span>
                  </div>

                  <div className={`mt-4 flex gap-2 overflow-hidden text-[11px] ${previewMode === 'mobile' ? 'flex-wrap' : 'flex-nowrap'}`}>
                    {previewPages.map(page => (
                      <span key={page} className={`rounded-full px-2.5 py-1 ${selectedTheme.mutedSurfaceClassName}`}>{page}</span>
                    ))}
                  </div>

                  <div className={`${previewMode === 'mobile' ? 'grid gap-4' : 'grid grid-cols-[1.2fr_0.8fr] gap-4'} mt-6 items-center`}>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.2em] opacity-80">{previewContent.eyebrow}</p>
                      <h4 className={`${previewMode === 'mobile' ? 'text-2xl' : 'text-3xl'} mt-2 font-black leading-tight tracking-tight`}>
                        {previewContent.headline}
                      </h4>
                      <p className="mt-3 text-sm leading-6 opacity-85">{previewContent.body}</p>
                      <button type="button" className={`mt-4 rounded-full px-4 py-2 text-sm font-bold shadow-sm ${selectedTheme.buttonClassName}`}>
                        {previewContent.cta}
                      </button>
                    </div>

                    <div className={`rounded-3xl p-3 shadow-sm ${selectedTheme.surfaceClassName}`}>
                      <div className="h-24 rounded-2xl bg-slate-200/80" />
                      <div className="mt-3 space-y-2">
                        <div className="h-2.5 w-3/4 rounded-full bg-slate-300/80" />
                        <div className="h-2.5 w-1/2 rounded-full bg-slate-200" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 bg-white p-4 sm:grid-cols-3">
                  {previewContent.cards.map(card => (
                    <div key={card} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="h-8 w-8 rounded-xl bg-indigo-100" />
                      <p className="mt-3 text-xs font-bold text-slate-900">{card}</p>
                      <div className="mt-2 h-1.5 w-16 rounded-full bg-slate-200" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <a
                className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5"
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open public site
              </a>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                onClick={() => void copyWebsiteLink()}
              >
                Copy website link
              </button>
            </div>
            {copyFeedback ? <p className="mt-3 rounded-2xl bg-indigo-50 p-3 text-sm font-medium text-indigo-700">{copyFeedback}</p> : null}
          </section>
        </aside>
      </form>
    </PageSection>
  )
}
