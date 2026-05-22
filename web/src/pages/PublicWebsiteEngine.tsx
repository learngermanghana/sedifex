import React, { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore'
import { Link, useParams } from 'react-router-dom'
import { db } from '../firebase'

type WebsiteSettings = {
  storeId: string
  businessName: string
  slug: string
  websiteType: string
  theme: string
  pages: string[]
  status: 'draft' | 'published'
}

type StoreProfile = {
  name: string
  logoUrl: string
  phone: string
  email: string
  address: string
}

type PublicItem = {
  id: string
  name: string
  price: number
  type: 'PRODUCT' | 'SERVICE' | 'COURSE'
  description: string
  imageUrl: string
}

function clean(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function numberValue(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function getPrice(record: Record<string, unknown>) {
  const minor = numberValue(record.priceMinor ?? record.amountMinor)
  if (minor !== null && minor >= 0) return minor / 100
  const major = numberValue(record.price ?? record.sellingPrice ?? record.salePrice ?? record.amount ?? record.fee)
  return major !== null && major >= 0 ? major : 0
}

function mapItem(id: string, record: Record<string, unknown>, fallbackType: PublicItem['type']): PublicItem | null {
  const name = clean(record.name ?? record.productName ?? record.serviceName ?? record.courseName ?? record.title, 220)
  if (!name) return null
  const rawType = clean(record.type ?? record.item_type ?? record.itemType, 40).toUpperCase()
  const type: PublicItem['type'] = rawType === 'SERVICE' || rawType === 'COURSE' || rawType === 'PRODUCT' ? rawType : fallbackType
  return {
    id,
    name,
    type,
    price: getPrice(record),
    description: clean(record.description ?? record.shortDescription, 260),
    imageUrl: clean(record.imageUrl ?? record.image_url ?? record.image ?? record.photoUrl ?? record.coverImageUrl, 900),
  }
}

function money(value: number) {
  return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(value)
}

function themeClasses(theme: string) {
  if (theme === 'luxury') return 'from-stone-950 via-amber-950 to-slate-950'
  if (theme === 'bold') return 'from-indigo-950 via-fuchsia-950 to-slate-950'
  if (theme === 'clean') return 'from-slate-900 via-slate-800 to-slate-950'
  return 'from-slate-950 via-indigo-950 to-slate-900'
}

export default function PublicWebsiteEngine() {
  const { slug = '' } = useParams()
  const [settings, setSettings] = useState<WebsiteSettings | null>(null)
  const [profile, setProfile] = useState<StoreProfile | null>(null)
  const [items, setItems] = useState<PublicItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const hasPage = useMemo(() => {
    const pageSet = new Set((settings?.pages ?? []).map(page => page.toLowerCase()))
    return (page: string) => pageSet.has(page.toLowerCase())
  }, [settings?.pages])

  useEffect(() => {
    let mounted = true

    async function loadWebsite() {
      try {
        setLoading(true)
        setError(null)

        const websiteSnap = await getDocs(
          query(
            collection(db, 'storeSettings'),
            where('websiteBuilder.slug', '==', slug),
            where('websiteBuilder.status', '==', 'published'),
            limit(1),
          ),
        )

        if (websiteSnap.empty) {
          if (mounted) setError('This website is not published yet.')
          return
        }

        const settingsDoc = websiteSnap.docs[0]
        const website = (settingsDoc.data().websiteBuilder ?? {}) as Partial<WebsiteSettings>
        const storeId = clean(website.storeId, 180) || settingsDoc.id

        const storeSnap = await getDoc(doc(db, 'stores', storeId))
        const storeData = storeSnap.exists() ? (storeSnap.data() as Record<string, unknown>) : {}
        const profileData: StoreProfile = {
          name: clean(storeData.businessName ?? storeData.storeName ?? storeData.name ?? website.businessName, 220) || clean(website.businessName, 220) || slug,
          logoUrl: clean(storeData.logoUrl ?? storeData.logo ?? storeData.photoUrl, 900),
          phone: clean(storeData.phone ?? storeData.businessPhone ?? storeData.whatsapp ?? storeData.whatsappNumber, 80),
          email: clean(storeData.email ?? storeData.businessEmail, 220),
          address: clean(storeData.address ?? storeData.addressLine1 ?? storeData.town ?? storeData.city, 260),
        }

        const specs: Array<{ path: string; type: PublicItem['type'] }> = [
          { path: `stores/${storeId}/products`, type: 'PRODUCT' },
          { path: `stores/${storeId}/services`, type: 'SERVICE' },
          { path: `stores/${storeId}/courses`, type: 'COURSE' },
        ]

        const itemGroups = await Promise.all(specs.map(async spec => {
          const snap = await getDocs(query(collection(db, spec.path), limit(8)))
          return snap.docs.map(itemDoc => mapItem(itemDoc.id, itemDoc.data() as Record<string, unknown>, spec.type)).filter((item): item is PublicItem => Boolean(item))
        }))

        if (!mounted) return
        setSettings({
          storeId,
          businessName: profileData.name,
          slug,
          websiteType: website.websiteType || 'shop',
          theme: website.theme || 'modern',
          pages: Array.isArray(website.pages) ? website.pages : ['Home', 'Products', 'Services', 'Gallery', 'Contact', 'Quick Pay'],
          status: 'published',
        })
        setProfile(profileData)
        setItems(itemGroups.flat())
      } catch (loadError) {
        console.error('[public-website] Unable to load website', loadError)
        if (mounted) setError('Unable to load this website.')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void loadWebsite()
    return () => {
      mounted = false
    }
  }, [slug])

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">Loading website…</main>
  }

  if (error || !settings || !profile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-center text-white">
        <div className="max-w-lg rounded-3xl border border-white/10 bg-white/10 p-8">
          <h1 className="text-3xl font-black">Website unavailable</h1>
          <p className="mt-3 text-slate-300">{error ?? 'This Sedifex website could not be found.'}</p>
          <Link className="mt-6 inline-block rounded-2xl bg-white px-5 py-3 font-semibold text-slate-950" to="/">
            Go home
          </Link>
        </div>
      </main>
    )
  }

  const productItems = items.filter(item => item.type === 'PRODUCT')
  const serviceItems = items.filter(item => item.type !== 'PRODUCT')
  const quickPayUrl = `https://pay.sedifex.com/s/${encodeURIComponent(settings.storeId)}?mode=store`

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/90 text-white backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            {profile.logoUrl ? <img src={profile.logoUrl} alt={`${profile.name} logo`} className="h-11 w-11 rounded-2xl object-cover" /> : <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 font-black">{profile.name.slice(0, 1)}</div>}
            <span className="font-black">{profile.name}</span>
          </div>
          <a className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-950" href={quickPayUrl}>Pay now</a>
        </div>
      </header>

      <section className={`bg-gradient-to-br ${themeClasses(settings.theme)} px-4 py-20 text-white sm:px-6 lg:px-8`}>
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-200">{settings.websiteType} website</p>
            <h1 className="mt-5 text-5xl font-black tracking-tight sm:text-6xl">{profile.name}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-200">
              Discover our products, services, bookings, and secure payments — powered by Sedifex.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a className="rounded-2xl bg-white px-6 py-3 font-semibold text-slate-950" href={quickPayUrl}>Quick Pay</a>
              {hasPage('Contact') ? <a className="rounded-2xl border border-white/20 px-6 py-3 font-semibold text-white" href="#contact">Contact us</a> : null}
            </div>
          </div>
          <div className="rounded-[2rem] border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur">
            <h2 className="text-2xl font-black">What you can do here</h2>
            <div className="mt-5 grid gap-3 text-sm text-slate-200">
              {settings.pages.map(page => <div key={page} className="rounded-2xl bg-white/10 p-4 font-semibold">{page}</div>)}
            </div>
          </div>
        </div>
      </section>

      {hasPage('Products') && productItems.length ? (
        <section className="px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-indigo-600">Products</p>
            <h2 className="mt-3 text-4xl font-black">Shop featured items</h2>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {productItems.map(item => <ItemCard key={item.id} item={item} quickPayUrl={quickPayUrl} />)}
            </div>
          </div>
        </section>
      ) : null}

      {(hasPage('Services') || hasPage('Courses')) && serviceItems.length ? (
        <section className="bg-slate-50 px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-indigo-600">Services & courses</p>
            <h2 className="mt-3 text-4xl font-black">Book or pay for services</h2>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {serviceItems.map(item => <ItemCard key={item.id} item={item} quickPayUrl={quickPayUrl} />)}
            </div>
          </div>
        </section>
      ) : null}

      {hasPage('Quick Pay') ? (
        <section className="px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-5xl flex-col items-center rounded-[2rem] bg-slate-950 p-8 text-center text-white shadow-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-200">Quick Pay</p>
            <h2 className="mt-3 text-4xl font-black">Scan, search, and pay securely</h2>
            <p className="mt-4 max-w-2xl text-slate-300">Use Sedifex Quick Pay to pay for any product, service, course, or custom request.</p>
            <a className="mt-6 rounded-2xl bg-white px-6 py-3 font-semibold text-slate-950" href={quickPayUrl}>Open Quick Pay</a>
          </div>
        </section>
      ) : null}

      {hasPage('Contact') ? (
        <section id="contact" className="bg-slate-100 px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl rounded-[2rem] bg-white p-8 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-indigo-600">Contact</p>
            <h2 className="mt-3 text-4xl font-black">Reach {profile.name}</h2>
            <div className="mt-6 grid gap-4 text-slate-700 sm:grid-cols-3">
              <p><strong>Phone</strong><br />{profile.phone || 'Not added yet'}</p>
              <p><strong>Email</strong><br />{profile.email || 'Not added yet'}</p>
              <p><strong>Location</strong><br />{profile.address || 'Not added yet'}</p>
            </div>
          </div>
        </section>
      ) : null}

      <footer className="bg-slate-950 px-4 py-8 text-center text-sm text-slate-400">
        Powered by Sedifex Website Builder
      </footer>
    </main>
  )
}

function ItemCard({ item, quickPayUrl }: { item: PublicItem; quickPayUrl: string }) {
  return (
    <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="h-48 w-full object-cover" /> : <div className="flex h-48 items-center justify-center bg-slate-100 text-4xl font-black text-slate-300">{item.name.slice(0, 1)}</div>}
      <div className="p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">{item.type}</p>
        <h3 className="mt-2 text-lg font-black">{item.name}</h3>
        {item.description ? <p className="mt-2 text-sm text-slate-600">{item.description}</p> : null}
        <div className="mt-4 flex items-center justify-between gap-3">
          <strong>{item.price > 0 ? money(item.price) : 'Enquire'}</strong>
          <a className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white" href={quickPayUrl}>Pay</a>
        </div>
      </div>
    </article>
  )
}
