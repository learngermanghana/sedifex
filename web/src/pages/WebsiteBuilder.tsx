import React, { FormEvent, useEffect, useMemo, useState } from 'react'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import PageSection from '../layout/PageSection'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'

type WebsiteType = 'shop' | 'beauty' | 'school' | 'travel' | 'ngo' | 'restaurant' | 'service'
type WebsiteTheme = 'modern' | 'luxury' | 'clean' | 'bold'
type StoredWebsiteStatus = 'draft' | 'published'
type DisplayWebsiteStatus = StoredWebsiteStatus | 'needs-setup'

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
}

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
    buttonClassName: 'bg-slate-950',
  },
  {
    id: 'luxury',
    label: 'Luxury',
    description: 'Premium spacing, darker accents, and elegant visuals.',
    previewClassName: 'from-slate-950 via-stone-800 to-amber-600',
    headingClassName: 'bg-amber-100/90',
    buttonClassName: 'bg-amber-400',
  },
  {
    id: 'clean',
    label: 'Clean',
    description: 'Simple, bright, and easy for small businesses.',
    previewClassName: 'from-slate-100 via-white to-blue-100',
    headingClassName: 'bg-slate-900',
    buttonClassName: 'bg-blue-500',
  },
  {
    id: 'bold',
    label: 'Bold',
    description: 'High contrast design for sales and promotions.',
    previewClassName: 'from-rose-500 via-orange-400 to-yellow-300',
    headingClassName: 'bg-white',
    buttonClassName: 'bg-rose-700',
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

  const previewUrl = useMemo(() => {
    const slug = settings.slug || 'your-business'
    return `https://sites.sedifex.com/${slug}`
  }, [settings.slug])

  const displayStatus = getDisplayStatus(settings, storeId)
  const statusConfig = STATUS_CONFIG[displayStatus]
  const selectedType = WEBSITE_TYPES.find(type => type.id === settings.websiteType) ?? WEBSITE_TYPES[0]
  const selectedTheme = THEMES.find(theme => theme.id === settings.theme) ?? THEMES[0]
  const canPublish = Boolean(storeId && settings.slug && settings.pages.length > 0 && !isLoading && !isSaving)

  const completionItems = [
    { label: 'Website slug', complete: Boolean(settings.slug) },
    { label: 'Business type', complete: Boolean(settings.websiteType) },
    { label: 'Theme selected', complete: Boolean(settings.theme) },
    { label: 'Pages selected', complete: settings.pages.length > 0 },
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
      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1.12fr)_minmax(330px,0.88fr)]">
        <div className="space-y-6">
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-6 text-white shadow-sm">
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-200">Business website control center</p>
                <h3 className="mt-3 text-2xl font-bold tracking-tight md:text-3xl">Build and publish a website from your Sedifex data</h3>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">
                  Choose the business type, select pages, pick a theme, then publish. Your products, services, gallery, bookings, and Quick Pay can all come from Sedifex.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm shadow-xl backdrop-blur">
                <p className="text-slate-300">Current website</p>
                <p className="mt-1 font-semibold text-white">{businessName || 'Loading business…'}</p>
                <p className="mt-3 break-all rounded-xl bg-white/10 px-3 py-2 text-cyan-100">{previewUrl}</p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Website identity</p>
                <h3 className="mt-1 text-xl font-semibold text-slate-950">Set the public link</h3>
                <p className="mt-1 text-sm text-slate-500">This is the address customers will use before you add a custom domain.</p>
              </div>
              <span className="inline-flex w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Step 1</span>
            </div>

            <label className="mt-5 block text-sm font-semibold text-slate-700">
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
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Website type</p>
                <h3 className="mt-1 text-xl font-semibold text-slate-950">Choose the website structure</h3>
                <p className="mt-1 text-sm text-slate-500">These cards replace the old grey buttons and make the choice easier to understand.</p>
              </div>
              <span className="inline-flex w-fit rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">{selectedType.label}</span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Website pages</p>
                <h3 className="mt-1 text-xl font-semibold text-slate-950">Select what the website should show</h3>
                <p className="mt-1 text-sm text-slate-500">Each checkbox now has enough spacing and a clean card-style touch area.</p>
              </div>
              <span className="inline-flex w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{settings.pages.length} selected</span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm md:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-cyan-200">Theme</p>
                <h3 className="mt-1 text-xl font-semibold">Beautiful preview cards</h3>
              </div>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-cyan-100">{selectedTheme.label}</span>
            </div>

            <div className="mt-5 grid gap-3">
              {THEMES.map(theme => {
                const isSelected = settings.theme === theme.id
                return (
                  <button
                    key={theme.id}
                    type="button"
                    className={`rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 ${
                      isSelected
                        ? 'border-cyan-300 bg-white/15 shadow-lg ring-4 ring-cyan-300/10'
                        : 'border-white/10 bg-white/5 hover:bg-white/10'
                    }`}
                    onClick={() => setSettings(previous => ({ ...previous, theme: theme.id }))}
                  >
                    <div className={`rounded-2xl bg-gradient-to-br ${theme.previewClassName} p-4`}>
                      <div className={`h-3 w-20 rounded-full ${theme.headingClassName}`} />
                      <div className="mt-4 space-y-2">
                        <div className="h-2 rounded-full bg-white/80" />
                        <div className="h-2 w-2/3 rounded-full bg-white/60" />
                      </div>
                      <div className={`mt-4 h-7 w-24 rounded-full ${theme.buttonClassName}`} />
                    </div>
                    <div className="mt-3 flex items-start justify-between gap-3">
                      <div>
                        <span className="block font-semibold text-white">{theme.label}</span>
                        <span className="mt-1 block text-sm leading-5 text-slate-300">{theme.description}</span>
                      </div>
                      {isSelected ? <span className="rounded-full bg-cyan-300 px-2 py-1 text-xs font-bold text-slate-950">Active</span> : null}
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Publish status</p>
                <h3 className="mt-1 text-xl font-semibold text-slate-950">Ready to go live?</h3>
              </div>
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${statusConfig.className}`}>
                <span className={`h-2 w-2 rounded-full ${statusConfig.dotClassName}`} />
                {statusConfig.label}
              </span>
            </div>

            <div className="mt-5 space-y-3">
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

            <div className="mt-5 grid gap-3">
              <button
                className="w-full rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 px-5 py-4 text-base font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:from-slate-400 disabled:to-slate-400 disabled:shadow-none"
                type="button"
                disabled={!canPublish}
                onClick={() => void saveSettings('published')}
              >
                {isSaving ? 'Publishing…' : 'Publish website'}
              </button>
              <button
                className="w-full rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                type="submit"
                disabled={isSaving || isLoading}
              >
                Save draft
              </button>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <h3 className="text-lg font-semibold text-slate-950">Website summary</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Business</dt><dd className="text-right font-semibold text-slate-900">{businessName || 'Loading…'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Type</dt><dd className="text-right font-semibold text-slate-900">{selectedType.label}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Theme</dt><dd className="text-right font-semibold text-slate-900">{selectedTheme.label}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Pages</dt><dd className="text-right font-semibold text-slate-900">{settings.pages.length}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Status</dt><dd className="text-right font-semibold text-slate-900">{statusConfig.label}</dd></div>
            </dl>
            <a className="mt-5 flex rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50" href={previewUrl} target="_blank" rel="noreferrer">
              Open preview →
            </a>
          </section>
        </aside>
      </form>
    </PageSection>
  )
}
