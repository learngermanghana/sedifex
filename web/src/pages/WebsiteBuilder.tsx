import React, { FormEvent, useEffect, useMemo, useState } from 'react'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import PageSection from '../layout/PageSection'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'

type WebsiteType = 'shop' | 'beauty' | 'school' | 'travel' | 'ngo' | 'restaurant' | 'service'
type WebsiteTheme = 'modern' | 'luxury' | 'clean' | 'bold'

type WebsiteBuilderSettings = {
  slug: string
  websiteType: WebsiteType
  theme: WebsiteTheme
  pages: string[]
  status: 'draft' | 'published'
}

const WEBSITE_TYPES: Array<{ id: WebsiteType; label: string; description: string }> = [
  { id: 'shop', label: 'Shop website', description: 'Products, categories, checkout, and Quick Pay.' },
  { id: 'beauty', label: 'Beauty / salon website', description: 'Services, bookings, gallery, and client payments.' },
  { id: 'school', label: 'School website', description: 'Courses, registrations, classes, and student payments.' },
  { id: 'travel', label: 'Travel agency website', description: 'Trips, bookings, leads, and enquiry payments.' },
  { id: 'ngo', label: 'NGO website', description: 'Programs, donations, volunteers, and impact gallery.' },
  { id: 'restaurant', label: 'Restaurant website', description: 'Menu, table QR, ordering, and payments.' },
  { id: 'service', label: 'Service business website', description: 'Services, invoices, bookings, and Quick Pay.' },
]

const THEMES: Array<{ id: WebsiteTheme; label: string; description: string }> = [
  { id: 'modern', label: 'Modern', description: 'Clean sections with strong call-to-action buttons.' },
  { id: 'luxury', label: 'Luxury', description: 'Premium spacing, darker accents, and elegant visuals.' },
  { id: 'clean', label: 'Clean', description: 'Simple, bright, and easy for small businesses.' },
  { id: 'bold', label: 'Bold', description: 'High contrast design for sales and promotions.' },
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
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const previewUrl = useMemo(() => {
    const slug = settings.slug || 'your-business'
    return `https://sites.sedifex.com/${slug}`
  }, [settings.slug])

  useEffect(() => {
    let mounted = true

    async function loadSettings() {
      if (!storeId) return
      setStatus('Loading website settings…')

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
          status: website?.status || previous.status,
        }))
        setStatus(null)
      } catch (loadError) {
        console.error('[website-builder] Unable to load settings', loadError)
        setError('Unable to load website settings.')
        setStatus(null)
      }
    }

    void loadSettings()
    return () => {
      mounted = false
    }
  }, [storeId])

  async function saveSettings(nextStatus: WebsiteBuilderSettings['status']) {
    if (!storeId) {
      setError('No active store selected.')
      return
    }

    const normalizedSlug = slugify(settings.slug || businessName || storeId)
    if (!normalizedSlug) {
      setError('Enter a website slug.')
      return
    }

    setIsSaving(true)
    setError(null)
    setStatus(nextStatus === 'published' ? 'Publishing website…' : 'Saving draft…')

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
      setStatus(nextStatus === 'published' ? 'Website published settings saved.' : 'Website draft saved.')
    } catch (saveError) {
      console.error('[website-builder] Unable to save settings', saveError)
      setError('Unable to save website settings.')
      setStatus(null)
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
      subtitle="Create a professional business website from your Sedifex data without creating a new Vercel project for every client."
      actions={
        <div className="flex flex-wrap gap-2">
          <a className="button button--ghost" href={previewUrl} target="_blank" rel="noreferrer">
            Preview website
          </a>
          <button className="button button--primary" type="button" disabled={isSaving || isLoading} onClick={() => void saveSettings('published')}>
            Publish
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Business website</p>
            <h3 className="mt-2 text-xl font-semibold text-slate-950">Set up your website identity</h3>
            <label className="mt-5 block text-sm font-semibold text-slate-700">
              Website slug
              <input
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-indigo-500"
                value={settings.slug}
                onChange={event => setSettings(previous => ({ ...previous, slug: slugify(event.target.value) }))}
                placeholder="glittering-med-spa"
              />
            </label>
            <p className="mt-2 text-sm text-slate-500">First public URL: {previewUrl}</p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Website type</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {WEBSITE_TYPES.map(type => (
                <button
                  key={type.id}
                  type="button"
                  className={`rounded-xl border p-4 text-left transition ${
                    settings.websiteType === type.id
                      ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50'
                  }`}
                  onClick={() => setSettings(previous => ({ ...previous, websiteType: type.id }))}
                >
                  <span className="block font-semibold text-slate-950">{type.label}</span>
                  <span className="mt-1 block text-sm text-slate-600">{type.description}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Pages</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {PAGE_OPTIONS.map(page => (
                <label key={page} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={settings.pages.includes(page)}
                    onChange={() => setSettings(previous => ({ ...previous, pages: togglePage(previous.pages, page) }))}
                  />
                  {page}
                </label>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-cyan-200">Theme</p>
            <div className="mt-4 grid gap-3">
              {THEMES.map(theme => (
                <button
                  key={theme.id}
                  type="button"
                  className={`rounded-xl border p-4 text-left transition ${
                    settings.theme === theme.id
                      ? 'border-cyan-300 bg-white/15'
                      : 'border-white/10 bg-white/5 hover:bg-white/10'
                  }`}
                  onClick={() => setSettings(previous => ({ ...previous, theme: theme.id }))}
                >
                  <span className="block font-semibold text-white">{theme.label}</span>
                  <span className="mt-1 block text-sm text-slate-300">{theme.description}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Website engine plan</p>
            <h3 className="mt-2 text-xl font-semibold text-slate-950">One engine, many websites</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              This saves the setup needed for a future Next.js website engine. The engine should read these settings, pull products, services, bookings, gallery, promo, social links, and Quick Pay from Sedifex, then render the full website.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-700">
              <li>• Free path: sites.sedifex.com/{settings.slug || 'your-business'}</li>
              <li>• Later: custom domains like www.business.com</li>
              <li>• No separate Vercel project per client</li>
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-950">Summary</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Business</dt><dd className="font-semibold text-slate-900">{businessName || 'Loading…'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Status</dt><dd className="font-semibold text-slate-900">{settings.status}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Theme</dt><dd className="font-semibold text-slate-900">{settings.theme}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Pages</dt><dd className="font-semibold text-slate-900">{settings.pages.length}</dd></div>
            </dl>
            {status ? <p className="mt-4 rounded-xl bg-indigo-50 p-3 text-sm text-indigo-700">{status}</p> : null}
            {error ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
            <button className="mt-5 w-full rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white disabled:bg-slate-400" type="submit" disabled={isSaving || isLoading}>
              {isSaving ? 'Saving…' : 'Save draft'}
            </button>
          </section>
        </aside>
      </form>
    </PageSection>
  )
}
