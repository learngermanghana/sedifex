import React, { FormEvent, Suspense, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, where } from 'firebase/firestore'

const WebsiteBuilderAssistantPanel = React.lazy(() => import('./WebsiteBuilderAssistantPanel'))
import PageSection from '../layout/PageSection'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'

type WebsiteType = 'shop' | 'beauty' | 'school' | 'travel' | 'ngo' | 'restaurant' | 'service'
type WebsiteTheme = 'modern' | 'luxury' | 'clean' | 'bold'
type StoredWebsiteStatus = 'draft' | 'published'
type DisplayWebsiteStatus = StoredWebsiteStatus | 'needs-setup'
type PreviewMode = 'mobile' | 'desktop'
type BuilderStepId = 'identity' | 'type' | 'pages' | 'theme' | 'content' | 'seo' | 'payments' | 'domain' | 'publish'
type ContentDraftKey = 'homepage' | 'about' | 'serviceDescriptions' | 'seoTitle'
type DomainConnectionStatus = 'not-connected' | 'pending' | 'connected' | 'needs-attention'
type SslStatus = 'not-started' | 'pending' | 'active' | 'failed'

type SocialLinks = { facebook: string; instagram: string; tiktok: string; youtube: string; linkedin: string; x: string; website: string }
type ContentDrafts = { homepage: string; about: string; serviceDescriptions: string; seoTitle: string }
type SeoSettings = { title: string; metaDescription: string; keywords: string; socialShareImage: string }
type DomainSettings = { customDomain: string; connectionStatus: DomainConnectionStatus; sslStatus: SslStatus; dnsTarget: string; verificationToken: string }
type PublishChecklistItem = { id: string; label: string; complete: boolean; helper: string }

type WebsiteBuilderSettings = {
  slug: string
  websiteType: WebsiteType
  theme: WebsiteTheme
  pages: string[]
  status: StoredWebsiteStatus
  businessName: string
  tagline: string
  description: string
  phone: string
  whatsapp: string
  email: string
  location: string
  openingHours: string
  businessLogoUrl: string
  coverImageUrl: string
  brandColor: string
  socialLinks: SocialLinks
  contentDrafts: ContentDrafts
  seoSettings: SeoSettings
  domainSettings: DomainSettings
}

type WebsiteTypeOption = { id: WebsiteType; label: string; description: string; icon: string; accentClassName: string }
type WebsiteThemeOption = { id: WebsiteTheme; label: string; description: string; previewClassName: string; headingClassName: string; buttonClassName: string; textClassName: string; surfaceClassName: string; mutedSurfaceClassName: string }
type PreviewContent = { eyebrow: string; headline: string; body: string; cta: string; cards: string[] }
type ContentGeneratorProfile = { noun: string; offerPlural: string; audience: string; promise: string; action: string; seoLabel: string; tagline: string; serviceIntro: string; keywords: string[] }

const BUILDER_STEPS: Array<{ id: BuilderStepId; label: string; description: string }> = [
  { id: 'identity', label: 'Business identity', description: 'Name, logo, contact details, social links, and brand assets.' },
  { id: 'type', label: 'Website type', description: 'Choose the right structure for the business.' },
  { id: 'pages', label: 'Pages', description: 'Select smart pages based on the website type.' },
  { id: 'theme', label: 'Theme', description: 'Pick the visual style and feel.' },
  { id: 'content', label: 'Content', description: 'Generate first-draft website copy from business data.' },
  { id: 'seo', label: 'SEO settings', description: 'Control Google and social share previews.' },
  { id: 'payments', label: 'Payments / Quick Pay', description: 'Prepare checkout and payment pages.' },
  { id: 'domain', label: 'Domain', description: 'Set free URL, custom domain, DNS, and SSL.' },
  { id: 'publish', label: 'Publish', description: 'Review checklist, publish, and share the site.' },
]

const DEFAULT_SOCIAL_LINKS: SocialLinks = { facebook: '', instagram: '', tiktok: '', youtube: '', linkedin: '', x: '', website: '' }
const DEFAULT_CONTENT_DRAFTS: ContentDrafts = { homepage: '', about: '', serviceDescriptions: '', seoTitle: '' }
const DEFAULT_SEO_SETTINGS: SeoSettings = { title: '', metaDescription: '', keywords: '', socialShareImage: '' }
const DEFAULT_DOMAIN_SETTINGS: DomainSettings = { customDomain: '', connectionStatus: 'not-connected', sslStatus: 'not-started', dnsTarget: 'sites.sedifex.com', verificationToken: '' }

const SOCIAL_LINK_FIELDS: Array<{ id: keyof SocialLinks; label: string; placeholder: string }> = [
  { id: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/yourbusiness' },
  { id: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/yourbusiness' },
  { id: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@yourbusiness' },
  { id: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@yourbusiness' },
  { id: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/company/yourbusiness' },
  { id: 'x', label: 'X / Twitter', placeholder: 'https://x.com/yourbusiness' },
  { id: 'website', label: 'Existing website', placeholder: 'https://www.yourbusiness.com' },
]

const WEBSITE_TYPES: WebsiteTypeOption[] = [
  { id: 'shop', label: 'Shop website', description: 'Products, categories, checkout, cart, and Quick Pay.', icon: '🛍️', accentClassName: 'bg-indigo-50 text-indigo-700 ring-indigo-100' },
  { id: 'beauty', label: 'Beauty / salon website', description: 'Services, bookings, gallery, client reviews, and Quick Pay.', icon: '✨', accentClassName: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-100' },
  { id: 'school', label: 'School website', description: 'Courses, registration, classes, and student payments.', icon: '🎓', accentClassName: 'bg-blue-50 text-blue-700 ring-blue-100' },
  { id: 'travel', label: 'Travel agency website', description: 'Packages, destinations, enquiries, consultations, and bookings.', icon: '✈️', accentClassName: 'bg-sky-50 text-sky-700 ring-sky-100' },
  { id: 'ngo', label: 'NGO website', description: 'Programs, donations, volunteers, blog, and impact gallery.', icon: '🤝', accentClassName: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  { id: 'restaurant', label: 'Restaurant website', description: 'Menu, ordering, reservations, table QR, and payments.', icon: '🍽️', accentClassName: 'bg-orange-50 text-orange-700 ring-orange-100' },
  { id: 'service', label: 'Service business website', description: 'Services, bookings, invoices, testimonials, and Quick Pay.', icon: '🧰', accentClassName: 'bg-slate-100 text-slate-700 ring-slate-200' },
]

const PAGE_OPTIONS_BY_TYPE: Record<WebsiteType, string[]> = {
  ngo: ['Home', 'About', 'Programs', 'Donate', 'Volunteers', 'Gallery', 'Blog', 'Contact'],
  shop: ['Home', 'Products', 'Categories', 'Cart / Checkout', 'Quick Pay', 'Contact'],
  beauty: ['Home', 'Services', 'Bookings', 'Gallery', 'Client reviews', 'Quick Pay', 'Contact'],
  school: ['Home', 'Courses', 'Registration', 'Classes', 'Student payments', 'Contact'],
  travel: ['Home', 'Packages', 'Destinations', 'Consultation / Enquiry', 'Bookings', 'Gallery', 'Blog', 'Contact'],
  restaurant: ['Home', 'Menu', 'Online ordering', 'Table QR', 'Reservations', 'Gallery', 'Contact'],
  service: ['Home', 'Services', 'Bookings', 'Invoices', 'Testimonials', 'Quick Pay', 'Contact'],
}

const PAYMENT_PAGES_BY_TYPE: Record<WebsiteType, string[]> = {
  shop: ['Cart / Checkout', 'Quick Pay'],
  beauty: ['Quick Pay', 'Bookings'],
  school: ['Student payments', 'Registration'],
  travel: ['Consultation / Enquiry', 'Bookings'],
  ngo: ['Donate'],
  restaurant: ['Online ordering', 'Table QR'],
  service: ['Quick Pay', 'Invoices'],
}

const OFFERING_COLLECTIONS = ['products', 'services', 'programs', 'courses', 'packages', 'menuItems', 'inventory']

const CONTENT_GENERATOR_PROFILE: Record<WebsiteType, ContentGeneratorProfile> = {
  ngo: { noun: 'foundation', offerPlural: 'programs, donations, volunteer work, and impact-driven projects', audience: 'communities and supporters', promise: 'create lasting impact where support is needed most', action: 'Support the mission', seoLabel: 'Programs, Donations & Volunteer Support', tagline: 'Supporting communities through action and impact', serviceIntro: 'Our programs are designed to support communities, mobilize volunteers, and turn donations into measurable impact.', keywords: ['community programs', 'donations', 'volunteer support', 'foundation', 'impact projects'] },
  shop: { noun: 'shop', offerPlural: 'products, categories, checkout, and Quick Pay', audience: 'customers looking for trusted products', promise: 'make shopping simple, fast, and reliable', action: 'Start shopping', seoLabel: 'Products, Categories & Online Checkout', tagline: 'Shop quality products with easy online payment', serviceIntro: 'Our product range is organized to help customers find what they need, compare options, and complete checkout with confidence.', keywords: ['online shop', 'products', 'categories', 'checkout', 'quick pay'] },
  beauty: { noun: 'beauty studio', offerPlural: 'services, bookings, gallery, client reviews, and Quick Pay', audience: 'clients who want professional beauty and wellness services', promise: 'help every client look confident and feel cared for', action: 'Book an appointment', seoLabel: 'Beauty Services, Salon Bookings & Client Reviews', tagline: 'Beauty services designed around confidence and care', serviceIntro: 'Our services are created to help clients look good, feel confident, and book professional beauty treatments with ease.', keywords: ['beauty services', 'salon booking', 'client reviews', 'beauty gallery', 'quick pay'] },
  school: { noun: 'school', offerPlural: 'courses, registration, classes, and student payments', audience: 'students and parents', promise: 'make learning, registration, and payments easier to manage', action: 'Register today', seoLabel: 'Courses, Registration, Classes & Student Payments', tagline: 'Learn, register, and manage classes with ease', serviceIntro: 'Our courses and classes are organized to help students learn clearly, register easily, and stay connected to school updates.', keywords: ['courses', 'registration', 'classes', 'student payments', 'school'] },
  travel: { noun: 'travel agency', offerPlural: 'packages, destinations, consultations, bookings, and travel enquiries', audience: 'travelers planning their next journey', promise: 'make travel planning clearer, safer, and easier', action: 'Send an enquiry', seoLabel: 'Travel Packages, Destinations & Bookings', tagline: 'Clear travel planning from enquiry to booking', serviceIntro: 'Our travel support helps customers explore packages, compare destinations, request consultation, and move from enquiry to booking.', keywords: ['travel packages', 'destinations', 'bookings', 'travel consultation', 'travel agency'] },
  restaurant: { noun: 'restaurant', offerPlural: 'menu items, online ordering, reservations, table QR, and payments', audience: 'customers who want great food and easy ordering', promise: 'make dining and ordering more convenient', action: 'View the menu', seoLabel: 'Menu, Online Ordering & Reservations', tagline: 'Great food with simple ordering and reservations', serviceIntro: 'Our menu and ordering options help customers browse meals, place orders, reserve tables, and pay with less stress.', keywords: ['restaurant menu', 'online ordering', 'reservations', 'table QR', 'food ordering'] },
  service: { noun: 'service business', offerPlural: 'services, bookings, invoices, testimonials, and Quick Pay', audience: 'customers who need reliable service support', promise: 'make service requests, bookings, and payments simple', action: 'Request a service', seoLabel: 'Services, Bookings, Invoices & Quick Pay', tagline: 'Reliable services with simple booking and payment', serviceIntro: 'Our service packages are built to help customers understand what we offer, request support, book appointments, and pay easily.', keywords: ['services', 'bookings', 'invoices', 'quick pay', 'service business'] },
}

const THEMES: WebsiteThemeOption[] = [
  { id: 'modern', label: 'Modern', description: 'Clean sections with strong call-to-action buttons.', previewClassName: 'from-indigo-500 via-blue-500 to-cyan-400', headingClassName: 'bg-white/95', buttonClassName: 'bg-slate-950 text-white', textClassName: 'text-white', surfaceClassName: 'bg-white text-slate-950', mutedSurfaceClassName: 'bg-white/15 text-white' },
  { id: 'luxury', label: 'Luxury', description: 'Premium spacing, darker accents, and elegant visuals.', previewClassName: 'from-slate-950 via-stone-800 to-amber-600', headingClassName: 'bg-amber-100/90', buttonClassName: 'bg-amber-400 text-slate-950', textClassName: 'text-amber-50', surfaceClassName: 'bg-stone-950 text-amber-50', mutedSurfaceClassName: 'bg-amber-100/15 text-amber-50' },
  { id: 'clean', label: 'Clean', description: 'Simple, bright, and easy for small businesses.', previewClassName: 'from-slate-100 via-white to-blue-100', headingClassName: 'bg-slate-900', buttonClassName: 'bg-blue-500 text-white', textClassName: 'text-slate-950', surfaceClassName: 'bg-white text-slate-950', mutedSurfaceClassName: 'bg-slate-900/5 text-slate-700' },
  { id: 'bold', label: 'Bold', description: 'High contrast design for sales and promotions.', previewClassName: 'from-rose-500 via-orange-400 to-yellow-300', headingClassName: 'bg-white', buttonClassName: 'bg-rose-700 text-white', textClassName: 'text-white', surfaceClassName: 'bg-white text-slate-950', mutedSurfaceClassName: 'bg-white/20 text-white' },
]

const PREVIEW_CONTENT: Record<WebsiteType, PreviewContent> = {
  shop: { eyebrow: 'Online shop', headline: 'Shop products and pay safely online.', body: 'Show products, categories, checkout, and Quick Pay from one public website.', cta: 'Shop now', cards: ['Products', 'Categories', 'Checkout'] },
  beauty: { eyebrow: 'Beauty studio', headline: 'Book beauty services with confidence.', body: 'Display services, gallery, bookings, client reviews, and payments in one place.', cta: 'Book appointment', cards: ['Services', 'Gallery', 'Reviews'] },
  school: { eyebrow: 'School website', headline: 'Courses, registration, and student payments.', body: 'Promote classes, accept registrations, and connect student payments to Sedifex.', cta: 'Register now', cards: ['Courses', 'Classes', 'Payments'] },
  travel: { eyebrow: 'Travel agency', headline: 'Turn travel enquiries into bookings.', body: 'Show packages, destinations, consultation requests, bookings, and travel content.', cta: 'Send enquiry', cards: ['Packages', 'Destinations', 'Bookings'] },
  ngo: { eyebrow: 'Impact website', headline: 'Share your mission and collect support.', body: 'Highlight programs, donations, volunteer forms, blog posts, and impact stories.', cta: 'Donate now', cards: ['Programs', 'Donate', 'Volunteers'] },
  restaurant: { eyebrow: 'Restaurant website', headline: 'Show your menu and receive orders.', body: 'Publish menu items, online ordering, reservations, table QR, and customer payments.', cta: 'View menu', cards: ['Menu', 'Ordering', 'Reservations'] },
  service: { eyebrow: 'Service business', headline: 'Sell services and receive bookings online.', body: 'Show service packages, accept bookings, issue invoices, and collect Quick Pay.', cta: 'Request service', cards: ['Services', 'Bookings', 'Invoices'] },
}

const STATUS_CONFIG: Record<DisplayWebsiteStatus, { label: string; className: string; dotClassName: string }> = {
  draft: { label: 'Draft', className: 'border-amber-200 bg-amber-50 text-amber-700', dotClassName: 'bg-amber-500' },
  published: { label: 'Published', className: 'border-emerald-200 bg-emerald-50 text-emerald-700', dotClassName: 'bg-emerald-500' },
  'needs-setup': { label: 'Needs setup', className: 'border-rose-200 bg-rose-50 text-rose-700', dotClassName: 'bg-rose-500' },
}

const DOMAIN_STATUS_CONFIG: Record<DomainConnectionStatus, { label: string; className: string }> = {
  'not-connected': { label: 'Not connected', className: 'border-slate-200 bg-slate-100 text-slate-600' },
  pending: { label: 'Pending DNS', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  connected: { label: 'Connected', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  'needs-attention': { label: 'Needs attention', className: 'border-rose-200 bg-rose-50 text-rose-700' },
}

const SSL_STATUS_CONFIG: Record<SslStatus, { label: string; className: string }> = {
  'not-started': { label: 'Not started', className: 'border-slate-200 bg-slate-100 text-slate-600' },
  pending: { label: 'Pending SSL', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  active: { label: 'SSL active', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  failed: { label: 'SSL failed', className: 'border-rose-200 bg-rose-50 text-rose-700' },
}

function createDefaultSettings(): WebsiteBuilderSettings {
  return {
    slug: '', websiteType: 'shop', theme: 'modern', pages: [...PAGE_OPTIONS_BY_TYPE.shop], status: 'draft',
    businessName: '', tagline: '', description: '', phone: '', whatsapp: '', email: '', location: '', openingHours: '', businessLogoUrl: '', coverImageUrl: '', brandColor: '#4f46e5',
    socialLinks: { ...DEFAULT_SOCIAL_LINKS }, contentDrafts: { ...DEFAULT_CONTENT_DRAFTS }, seoSettings: { ...DEFAULT_SEO_SETTINGS }, domainSettings: { ...DEFAULT_DOMAIN_SETTINGS },
  }
}

function slugify(value: string) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) }
function togglePage(pages: string[], page: string) { return pages.includes(page) ? pages.filter(item => item !== page) : [...pages, page] }
function getDisplayStatus(settings: WebsiteBuilderSettings, storeId: string | null): DisplayWebsiteStatus { if (!storeId || !settings.slug || settings.pages.length === 0) return 'needs-setup'; return settings.status }
function getRecord(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function readString(record: Record<string, unknown>, key: string, fallback = '') { const value = record[key]; return typeof value === 'string' && value.trim() ? value.trim() : fallback }
function normalizeBrandColor(value: unknown) { return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '#4f46e5' }
function normalizeDomain(value: string) { return value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '') }
function isWebsiteType(value: unknown): value is WebsiteType { return WEBSITE_TYPES.some(type => type.id === value) }
function isWebsiteTheme(value: unknown): value is WebsiteTheme { return THEMES.some(theme => theme.id === value) }
function isDomainStatus(value: unknown): value is DomainConnectionStatus { return ['not-connected', 'pending', 'connected', 'needs-attention'].includes(String(value)) }
function isSslStatus(value: unknown): value is SslStatus { return ['not-started', 'pending', 'active', 'failed'].includes(String(value)) }
function getSmartPagesForType(type: WebsiteType) { return PAGE_OPTIONS_BY_TYPE[type] }
function getPaymentPagesForType(type: WebsiteType) { return PAYMENT_PAGES_BY_TYPE[type] }
function filterPagesForType(type: WebsiteType, pages: string[]) { const allowedPages = getSmartPagesForType(type); const filtered = pages.filter(page => allowedPages.includes(page)); return filtered.length ? filtered : [...allowedPages] }
function getPreviewText(value: string, fallback: string) { const cleanValue = value.trim(); if (!cleanValue) return fallback; return cleanValue.length > 180 ? `${cleanValue.slice(0, 177)}…` : cleanValue }
function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\'': '&#39;', '"': '&quot;' }[char] || char)) }

function mergeSocialLinks(...sources: unknown[]): SocialLinks {
  const merged: SocialLinks = { ...DEFAULT_SOCIAL_LINKS }
  sources.forEach(source => { const record = getRecord(source); SOCIAL_LINK_FIELDS.forEach(field => { const value = record[field.id]; if (typeof value === 'string' && value.trim()) merged[field.id] = value.trim() }) })
  return merged
}
function mergeContentDrafts(...sources: unknown[]): ContentDrafts {
  const merged: ContentDrafts = { ...DEFAULT_CONTENT_DRAFTS }
  sources.forEach(source => { const record = getRecord(source); (['homepage', 'about', 'serviceDescriptions', 'seoTitle'] as ContentDraftKey[]).forEach(key => { const value = record[key]; if (typeof value === 'string' && value.trim()) merged[key] = value.trim() }) })
  return merged
}
function mergeSeoSettings(...sources: unknown[]): SeoSettings {
  const merged: SeoSettings = { ...DEFAULT_SEO_SETTINGS }
  sources.forEach(source => { const record = getRecord(source); (['title', 'metaDescription', 'keywords', 'socialShareImage'] as Array<keyof SeoSettings>).forEach(key => { const value = record[key]; if (typeof value === 'string' && value.trim()) merged[key] = value.trim() }) })
  return merged
}
function mergeDomainSettings(...sources: unknown[]): DomainSettings {
  const merged: DomainSettings = { ...DEFAULT_DOMAIN_SETTINGS }
  sources.forEach(source => {
    const record = getRecord(source)
    const customDomain = readString(record, 'customDomain')
    const dnsTarget = readString(record, 'dnsTarget')
    const verificationToken = readString(record, 'verificationToken')
    if (customDomain) merged.customDomain = normalizeDomain(customDomain)
    if (dnsTarget) merged.dnsTarget = dnsTarget
    if (verificationToken) merged.verificationToken = verificationToken
    if (isDomainStatus(record.connectionStatus)) merged.connectionStatus = record.connectionStatus
    if (isSslStatus(record.sslStatus)) merged.sslStatus = record.sslStatus
  })
  return merged
}

function buildSeoTitle(settings: WebsiteBuilderSettings) { const profile = CONTENT_GENERATOR_PROFILE[settings.websiteType]; const businessName = settings.businessName.trim() || 'Business website'; return `${businessName} | ${profile.seoLabel}` }
function buildSeoDescription(settings: WebsiteBuilderSettings) { const profile = CONTENT_GENERATOR_PROFILE[settings.websiteType]; const businessName = settings.businessName.trim() || 'This business'; const location = settings.location.trim(); const locationPhrase = location ? ` in ${location}` : ''; if (settings.websiteType === 'ngo') return `Support ${businessName} through donations, volunteer programs, and community impact projects${locationPhrase}.`; return `${businessName} helps ${profile.audience}${locationPhrase} through ${profile.offerPlural}. ${profile.action} and connect with us online.` }
function buildSeoKeywords(settings: WebsiteBuilderSettings) { const profile = CONTENT_GENERATOR_PROFILE[settings.websiteType]; return [settings.businessName.trim(), ...profile.keywords, ...settings.pages, settings.location.trim()].filter(Boolean).join(', ') }
function buildVerificationToken(storeId: string | null, slug: string) { return `sedifex-site-verification=${storeId || slug || 'your-site'}` }
function buildQrCodeUrl(url: string, size = 260) { return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&format=png&data=${encodeURIComponent(url)}` }
function buildShareText(settings: WebsiteBuilderSettings, publicUrl: string) { const name = settings.businessName.trim() || 'Our business'; return `Visit ${name} online: ${publicUrl}` }

function buildGeneratedContent(settings: WebsiteBuilderSettings, key: ContentDraftKey | 'tagline') {
  const profile = CONTENT_GENERATOR_PROFILE[settings.websiteType]
  const businessName = settings.businessName.trim() || 'This business'
  const location = settings.location.trim()
  const locationPhrase = location ? ` in ${location}` : ''
  const selectedPages = settings.pages.length ? settings.pages.join(', ') : PAGE_OPTIONS_BY_TYPE[settings.websiteType].join(', ')
  const previewCards = PREVIEW_CONTENT[settings.websiteType].cards
  if (key === 'tagline') return profile.tagline
  if (key === 'homepage') {
    if (settings.websiteType === 'ngo') return `${businessName} supports communities through ${profile.offerPlural}. We make it easier for supporters, partners, and volunteers to learn about our work, join programs, donate, and follow the impact we are creating${locationPhrase}.`
    return `${businessName} is a ${profile.noun}${locationPhrase} helping ${profile.audience}. Our website makes it easy to explore ${profile.offerPlural}, contact us, and take the next step online. ${profile.action} today and experience how we ${profile.promise}.`
  }
  if (key === 'about') return `${businessName} exists to serve ${profile.audience}${locationPhrase}. We focus on clear communication, reliable service, and a simple online experience where visitors can learn about us, explore ${selectedPages}, and connect with the business directly. ${settings.description.trim() || `Our goal is to ${profile.promise}.`}`
  if (key === 'serviceDescriptions') return `${profile.serviceIntro}\n\nKey website sections to describe first: ${selectedPages}.\n\nSuggested descriptions:\n• ${previewCards[0] || 'Main offer'}: Give visitors a clear overview of what is available and how it helps them.\n• ${previewCards[1] || 'Customer action'}: Explain how customers, students, donors, or clients can take action.\n• Contact / support: Make it easy for visitors to call, WhatsApp, email, book, donate, or pay.`
  return buildSeoTitle(settings)
}

export default function WebsiteBuilder() {
  const { storeId, isLoading } = useActiveStore()
  const [settings, setSettings] = useState<WebsiteBuilderSettings>(() => createDefaultSettings())
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [previewMode, setPreviewMode] = useState<PreviewMode>('desktop')
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)
  const [domainFeedback, setDomainFeedback] = useState<string | null>(null)
  const [shareFeedback, setShareFeedback] = useState<string | null>(null)
  const [offeringDataAvailable, setOfferingDataAvailable] = useState(false)
  const [isCheckingOfferings, setIsCheckingOfferings] = useState(false)
  const [activeStep, setActiveStep] = useState<BuilderStepId>('identity')
  const [showAssistant, setShowAssistant] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [selectedTemplateName, setSelectedTemplateName] = useState<string | null>(null)
  const navigate = useNavigate()

  const freeUrl = useMemo(() => `https://sites.sedifex.com/${settings.slug || 'your-business'}`, [settings.slug])
  const publicWebsiteUrl = settings.domainSettings.connectionStatus === 'connected' && settings.domainSettings.customDomain ? `https://${settings.domainSettings.customDomain}` : freeUrl
  const displayStatus = getDisplayStatus(settings, storeId)
  const statusConfig = STATUS_CONFIG[displayStatus]
  const selectedType = WEBSITE_TYPES.find(type => type.id === settings.websiteType) ?? WEBSITE_TYPES[0]
  const selectedTheme = THEMES.find(theme => theme.id === settings.theme) ?? THEMES[0]
  const previewContent = PREVIEW_CONTENT[settings.websiteType]
  const smartPageOptions = getSmartPagesForType(settings.websiteType)
  const paymentPages = getPaymentPagesForType(settings.websiteType)
  const primaryPaymentPage = paymentPages[0]
  const previewPages = settings.pages.length ? settings.pages.slice(0, 5) : ['Home']
  const activeSocialLinks = SOCIAL_LINK_FIELDS.filter(field => settings.socialLinks[field.id]).slice(0, 4)
  const hasPaymentPage = paymentPages.some(page => settings.pages.includes(page))
  const seoTitlePreview = settings.seoSettings.title || settings.contentDrafts.seoTitle || buildSeoTitle(settings)
  const seoDescriptionPreview = settings.seoSettings.metaDescription || buildSeoDescription(settings)
  const seoShareImage = settings.seoSettings.socialShareImage || settings.coverImageUrl || settings.businessLogoUrl
  const domainStatusConfig = DOMAIN_STATUS_CONFIG[settings.domainSettings.connectionStatus]
  const sslStatusConfig = SSL_STATUS_CONFIG[settings.domainSettings.sslStatus]
  const customDomain = settings.domainSettings.customDomain
  const verificationToken = settings.domainSettings.verificationToken || buildVerificationToken(storeId, settings.slug)
  const qrCodeUrl = buildQrCodeUrl(publicWebsiteUrl)
  const shareText = buildShareText(settings, publicWebsiteUrl)
  const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`
  const facebookShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publicWebsiteUrl)}`
  const instagramCaption = `${settings.businessName || 'Our business'} is now online. Visit ${publicWebsiteUrl} to explore our ${settings.websiteType === 'ngo' ? 'programs and impact work' : 'services and offers'}. #Sedifex #SmallBusiness #GhanaBusiness`
  const dnsRecords = [
    { type: 'CNAME', host: customDomain.startsWith('www.') ? 'www' : '@ or www', value: settings.domainSettings.dnsTarget, note: 'Points the custom domain to Sedifex Sites.' },
    { type: 'TXT', host: '_sedifex', value: verificationToken, note: 'Verifies that this business owns the domain.' },
  ]
  const publishChecklist: PublishChecklistItem[] = [
    { id: 'businessName', label: 'Business name added', complete: Boolean(settings.businessName.trim()), helper: 'Add the official business name in Business identity.' },
    { id: 'phone', label: 'Phone or WhatsApp added', complete: Boolean(settings.phone.trim() || settings.whatsapp.trim()), helper: 'Add at least one contact number so customers can reach the business.' },
    { id: 'pages', label: 'At least one page selected', complete: settings.pages.length > 0, helper: 'Select pages for the public website.' },
    { id: 'brandAssets', label: 'Logo or banner added', complete: Boolean(settings.businessLogoUrl.trim() || settings.coverImageUrl.trim()), helper: 'Add a logo or cover/banner image for stronger branding.' },
    { id: 'payment', label: 'Payment / Quick Pay configured if enabled', complete: hasPaymentPage, helper: `Enable at least one recommended action page: ${paymentPages.join(', ')}.` },
    { id: 'offerings', label: 'Products/services/programs available', complete: offeringDataAvailable || Boolean(settings.contentDrafts.serviceDescriptions.trim()), helper: isCheckingOfferings ? 'Checking Sedifex data…' : 'Add products/services/programs in Sedifex or generate descriptions as a starter.' },
    { id: 'domain', label: 'Domain ready or free URL ready', complete: Boolean(settings.slug.trim()) || settings.domainSettings.connectionStatus === 'connected', helper: 'The free Sedifex URL is enough to publish. Custom domain can be connected later.' },
  ]
  const missingPublishItems = publishChecklist.filter(item => !item.complete)
  const publishSummary = missingPublishItems.length === 0 ? 'Ready to publish' : `${missingPublishItems.length} things missing before publishing`
  const canPreview = true
  const canPublish = Boolean(storeId && !isLoading && !isSaving && missingPublishItems.length === 0)
  const currentStepIndex = BUILDER_STEPS.findIndex(step => step.id === activeStep)
  const safeStepIndex = currentStepIndex >= 0 ? currentStepIndex : 0
  const currentStep = BUILDER_STEPS[safeStepIndex]
  const progressPercent = Math.round(((safeStepIndex + 1) / BUILDER_STEPS.length) * 100)
  const isPublished = settings.status === 'published'

  const stepCompletion: Record<BuilderStepId, boolean> = {
    identity: Boolean(settings.businessName.trim() && settings.slug && (settings.phone || settings.whatsapp || settings.email)),
    type: Boolean(settings.websiteType),
    pages: settings.pages.length > 0,
    theme: Boolean(settings.theme),
    content: Boolean(settings.contentDrafts.homepage || settings.contentDrafts.about || settings.contentDrafts.seoTitle || settings.tagline),
    seo: Boolean(settings.seoSettings.title && settings.seoSettings.metaDescription),
    payments: hasPaymentPage,
    domain: Boolean(settings.slug),
    publish: isPublished,
  }

  useEffect(() => {
    let mounted = true
    async function checkOfferingData() {
      if (!storeId) return
      setIsCheckingOfferings(true)
      try {
        const checks = await Promise.all(OFFERING_COLLECTIONS.map(async name => {
          try {
            const topLevelSnap = await getDocs(query(collection(db, name), where('storeId', '==', storeId), limit(1)))
            if (!topLevelSnap.empty) return true
          } catch (topLevelError) {
            console.info(`[website-builder] Top-level ${name} check unavailable`, topLevelError)
          }
          try {
            const nestedSnap = await getDocs(query(collection(db, 'stores', storeId, name), limit(1)))
            return !nestedSnap.empty
          } catch (nestedError) {
            console.info(`[website-builder] Nested ${name} check unavailable`, nestedError)
            return false
          }
        }))
        if (mounted) setOfferingDataAvailable(checks.some(Boolean))
      } finally {
        if (mounted) setIsCheckingOfferings(false)
      }
    }
    void checkOfferingData()
    return () => { mounted = false }
  }, [storeId])

  useEffect(() => {
    let mounted = true
    async function loadSettings() {
      if (!storeId) return
      setFeedback('Loading website settings…')
      try {
        const [storeSnap, settingsSnap] = await Promise.all([getDoc(doc(db, 'stores', storeId)), getDoc(doc(db, 'storeSettings', storeId))])
        if (!mounted) return
        const storeData = storeSnap.exists() ? (storeSnap.data() as Record<string, unknown>) : {}
        const data = settingsSnap.exists() ? (settingsSnap.data() as Record<string, unknown>) : {}
        const website = getRecord(data.websiteBuilder)
        const fallbackBusinessName = readString(storeData, 'businessName') || readString(storeData, 'storeName') || readString(storeData, 'name') || 'My business'
        setSettings(previous => {
          const businessName = readString(website, 'businessName', fallbackBusinessName)
          const websiteType = isWebsiteType(website.websiteType) ? website.websiteType : previous.websiteType
          const loadedPages = Array.isArray(website.pages) ? website.pages.filter((page): page is string => typeof page === 'string') : []
          const pages = loadedPages.length ? filterPagesForType(websiteType, loadedPages) : [...PAGE_OPTIONS_BY_TYPE[websiteType]]
          const contentDrafts = mergeContentDrafts(website.contentDrafts)
          const seoSettings = mergeSeoSettings(website.seoSettings, { title: readString(website, 'seoTitle', contentDrafts.seoTitle), socialShareImage: readString(website, 'socialShareImage') })
          const domainSettings = mergeDomainSettings(website.domainSettings, { customDomain: readString(website, 'customDomain') })
          return {
            ...previous,
            slug: readString(website, 'slug') || slugify(businessName),
            websiteType,
            theme: isWebsiteTheme(website.theme) ? website.theme : previous.theme,
            pages,
            status: website.status === 'published' ? 'published' : 'draft',
            businessName,
            tagline: readString(website, 'tagline', readString(storeData, 'tagline')),
            description: readString(website, 'description', readString(storeData, 'description')),
            phone: readString(website, 'phone', readString(storeData, 'phone', readString(storeData, 'phoneNumber'))),
            whatsapp: readString(website, 'whatsapp', readString(storeData, 'whatsapp', readString(storeData, 'whatsappNumber'))),
            email: readString(website, 'email', readString(storeData, 'email', readString(storeData, 'businessEmail'))),
            location: readString(website, 'location', readString(storeData, 'location', readString(storeData, 'address'))),
            openingHours: readString(website, 'openingHours', readString(storeData, 'openingHours')),
            businessLogoUrl: readString(website, 'businessLogoUrl', readString(storeData, 'businessLogoUrl', readString(storeData, 'logoUrl'))),
            coverImageUrl: readString(website, 'coverImageUrl', readString(storeData, 'coverImageUrl', readString(storeData, 'bannerImageUrl'))),
            brandColor: normalizeBrandColor(website.brandColor || storeData.brandColor),
            socialLinks: mergeSocialLinks(storeData.socialLinks, storeData.socialMediaLinks, website.socialLinks),
            contentDrafts,
            seoSettings,
            domainSettings,
          }
        })
        setFeedback(null)
      } catch (loadError) {
        console.error('[website-builder] Unable to load settings', loadError)
        setError('Unable to load website settings.')
        setFeedback(null)
      }
    }
    void loadSettings()
    return () => { mounted = false }
  }, [storeId])

  function updateSetting<K extends keyof WebsiteBuilderSettings>(key: K, value: WebsiteBuilderSettings[K]) { setSettings(previous => ({ ...previous, [key]: value })) }
  function updateContentDraft(key: ContentDraftKey, value: string) { setSettings(previous => ({ ...previous, contentDrafts: { ...previous.contentDrafts, [key]: value } })) }
  function updateSeoSetting(key: keyof SeoSettings, value: string) { setSettings(previous => ({ ...previous, seoSettings: { ...previous.seoSettings, [key]: value } })) }
  function updateDomainSetting<K extends keyof DomainSettings>(key: K, value: DomainSettings[K]) { setSettings(previous => ({ ...previous, domainSettings: { ...previous.domainSettings, [key]: key === 'customDomain' ? normalizeDomain(String(value)) : value } })) }
  function selectWebsiteType(websiteType: WebsiteType) { setSettings(previous => ({ ...previous, websiteType, pages: [...PAGE_OPTIONS_BY_TYPE[websiteType]] })) }
  function updateSocialLink(key: keyof SocialLinks, value: string) { setSettings(previous => ({ ...previous, socialLinks: { ...previous.socialLinks, [key]: value } })) }

  function generateContent(key: ContentDraftKey | 'tagline') {
    const generated = buildGeneratedContent(settings, key)
    if (key === 'tagline') { updateSetting('tagline', generated); setFeedback('Website tagline generated.'); return }
    updateContentDraft(key, generated)
    if (key === 'seoTitle') updateSeoSetting('title', generated)
    if (key === 'homepage' && !settings.description.trim()) updateSetting('description', generated)
    if (key === 'serviceDescriptions') setOfferingDataAvailable(true)
    setFeedback(`${key === 'serviceDescriptions' ? 'Service descriptions' : key} generated.`)
  }

  function generateSeoSettings() {
    const title = buildSeoTitle(settings)
    const metaDescription = buildSeoDescription(settings)
    const keywords = buildSeoKeywords(settings)
    const socialShareImage = settings.seoSettings.socialShareImage || settings.coverImageUrl || settings.businessLogoUrl
    setSettings(previous => ({ ...previous, contentDrafts: { ...previous.contentDrafts, seoTitle: title }, seoSettings: { ...previous.seoSettings, title, metaDescription, keywords, socialShareImage } }))
    setFeedback('SEO settings generated.')
  }

  function generateAllContent() {
    const homepage = buildGeneratedContent(settings, 'homepage')
    const about = buildGeneratedContent(settings, 'about')
    const serviceDescriptions = buildGeneratedContent(settings, 'serviceDescriptions')
    const seoTitle = buildGeneratedContent(settings, 'seoTitle')
    const tagline = buildGeneratedContent(settings, 'tagline')
    const metaDescription = buildSeoDescription(settings)
    const keywords = buildSeoKeywords(settings)
    setSettings(previous => ({ ...previous, tagline: previous.tagline.trim() ? previous.tagline : tagline, description: previous.description.trim() ? previous.description : homepage, contentDrafts: { ...previous.contentDrafts, homepage, about, serviceDescriptions, seoTitle }, seoSettings: { ...previous.seoSettings, title: previous.seoSettings.title.trim() ? previous.seoSettings.title : seoTitle, metaDescription: previous.seoSettings.metaDescription.trim() ? previous.seoSettings.metaDescription : metaDescription, keywords: previous.seoSettings.keywords.trim() ? previous.seoSettings.keywords : keywords, socialShareImage: previous.seoSettings.socialShareImage || previous.coverImageUrl || previous.businessLogoUrl } }))
    setOfferingDataAvailable(true)
    setFeedback('Website content and SEO generated from business data.')
  }

  async function copyText(text: string, message: string, setMessage: (value: string | null) => void) {
    try { await navigator.clipboard.writeText(text); setMessage(message) } catch (copyError) { console.error('[website-builder] Unable to copy text', copyError); setMessage('Could not copy. Please copy manually.') }
    window.setTimeout(() => setMessage(null), 2500)
  }

  async function copyDnsRecords() { await copyText(dnsRecords.map(record => `${record.type}\t${record.host}\t${record.value}`).join('\n'), 'DNS records copied.', setDomainFeedback) }
  async function copyWebsiteLink() { await copyText(publicWebsiteUrl, 'Website link copied.', setCopyFeedback) }
  async function copyInstagramCaption() { await copyText(instagramCaption, 'Instagram caption copied.', setShareFeedback) }

  function downloadQrPoster() {
    const title = escapeHtml(settings.businessName || 'Business website')
    const tagline = escapeHtml(settings.tagline || 'Scan to visit our website')
    const url = escapeHtml(publicWebsiteUrl)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"><rect width="1080" height="1350" rx="56" fill="#ffffff"/><rect x="60" y="60" width="960" height="1230" rx="48" fill="#f8fafc" stroke="#e2e8f0" stroke-width="4"/><text x="540" y="210" text-anchor="middle" font-family="Arial, sans-serif" font-size="64" font-weight="800" fill="#0f172a">${title}</text><text x="540" y="285" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" fill="#475569">${tagline}</text><rect x="330" y="390" width="420" height="420" rx="32" fill="#ffffff" stroke="#e2e8f0" stroke-width="4"/><image x="370" y="430" width="340" height="340" href="${buildQrCodeUrl(publicWebsiteUrl, 340)}"/><text x="540" y="900" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="#0f172a">Scan to visit our website</text><text x="540" y="970" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" fill="#334155">${url}</text><rect x="280" y="1080" width="520" height="86" rx="43" fill="${settings.brandColor}"/><text x="540" y="1136" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="800" fill="#ffffff">Powered by Sedifex</text></svg>`
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(blob)
    anchor.download = `${slugify(settings.businessName || 'website')}-qr-poster.svg`
    anchor.click()
    URL.revokeObjectURL(anchor.href)
  }

  function printSmallFlyer() {
    const printWindow = window.open('', '_blank', 'width=420,height=720')
    if (!printWindow) return
    printWindow.document.write(`<!doctype html><html><head><title>${escapeHtml(settings.businessName || 'Website flyer')}</title><style>@page{size:A5;margin:12mm}body{font-family:Arial,sans-serif;margin:0;color:#0f172a}.flyer{border:1px solid #e2e8f0;border-radius:24px;padding:24px;text-align:center}.qr{width:180px;height:180px;margin:20px auto}.brand{font-size:28px;font-weight:800}.tagline{font-size:15px;color:#475569;margin-top:8px}.url{font-size:13px;color:#334155;word-break:break-all}.button{display:inline-block;background:${settings.brandColor};color:#fff;border-radius:999px;padding:12px 22px;font-weight:800;margin-top:18px}</style></head><body><div class="flyer"><div class="brand">${escapeHtml(settings.businessName || 'Our website')}</div><div class="tagline">${escapeHtml(settings.tagline || 'Scan to visit our website')}</div><img class="qr" src="${qrCodeUrl}" alt="Website QR code"/><div class="url">${escapeHtml(publicWebsiteUrl)}</div><div class="button">Scan & Visit</div><p style="font-size:11px;color:#64748b;margin-top:20px">Powered by Sedifex</p></div><script>window.onload=()=>{window.print()}</script></body></html>`)
    printWindow.document.close()
  }

  async function saveSettings(nextStatus: StoredWebsiteStatus) {
    if (!storeId) { setError('No active store selected.'); return }
    if (nextStatus === 'published' && missingPublishItems.length > 0) { setError(publishSummary); setActiveStep('publish'); return }
    const normalizedSlug = slugify(settings.slug || settings.businessName || storeId)
    if (!normalizedSlug) { setError('Enter a website slug.'); return }
    const normalizedPages = filterPagesForType(settings.websiteType, settings.pages)
    setIsSaving(true); setError(null); setFeedback(nextStatus === 'published' ? 'Publishing website…' : 'Saving draft…')
    try {
      const normalizedDomain = mergeDomainSettings(settings.domainSettings)
      const finalPublicUrl = normalizedDomain.connectionStatus === 'connected' && normalizedDomain.customDomain ? `https://${normalizedDomain.customDomain}` : `https://sites.sedifex.com/${normalizedSlug}`
      const payload: WebsiteBuilderSettings = {
        ...settings,
        slug: normalizedSlug,
        pages: normalizedPages,
        businessName: settings.businessName.trim() || 'My business',
        tagline: settings.tagline.trim(), description: settings.description.trim(), phone: settings.phone.trim(), whatsapp: settings.whatsapp.trim(), email: settings.email.trim(), location: settings.location.trim(), openingHours: settings.openingHours.trim(), businessLogoUrl: settings.businessLogoUrl.trim(), coverImageUrl: settings.coverImageUrl.trim(), brandColor: normalizeBrandColor(settings.brandColor),
        socialLinks: mergeSocialLinks(settings.socialLinks), contentDrafts: mergeContentDrafts(settings.contentDrafts), seoSettings: mergeSeoSettings(settings.seoSettings), domainSettings: { ...normalizedDomain, verificationToken }, status: nextStatus,
      }
      const businessIdentity = { businessName: payload.businessName, tagline: payload.tagline, description: payload.description, phone: payload.phone, whatsapp: payload.whatsapp, email: payload.email, location: payload.location, openingHours: payload.openingHours, businessLogoUrl: payload.businessLogoUrl, coverImageUrl: payload.coverImageUrl, brandColor: payload.brandColor, socialLinks: payload.socialLinks }
      const marketingTools = { qrCodeUrl: buildQrCodeUrl(finalPublicUrl), shareText: buildShareText(payload, finalPublicUrl), whatsappShareUrl: `https://wa.me/?text=${encodeURIComponent(buildShareText(payload, finalPublicUrl))}`, facebookShareUrl: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(finalPublicUrl)}`, instagramCaption }
      await setDoc(doc(db, 'storeSettings', storeId), { websiteBuilder: { ...payload, businessIdentity, contentDrafts: payload.contentDrafts, seoSettings: payload.seoSettings, domainSettings: payload.domainSettings, freeUrl: `https://sites.sedifex.com/${normalizedSlug}`, customDomain: payload.domainSettings.customDomain, domainConnectionStatus: payload.domainSettings.connectionStatus, sslStatus: payload.domainSettings.sslStatus, dnsRecords, publishChecklist, publishChecklistMissing: missingPublishItems.length, marketingTools, smartPages: PAGE_OPTIONS_BY_TYPE[payload.websiteType], paymentPages: PAYMENT_PAGES_BY_TYPE[payload.websiteType], storeId, publicUrl: finalPublicUrl, updatedAt: serverTimestamp(), publishedAt: nextStatus === 'published' ? serverTimestamp() : null } }, { merge: true })
      setSettings(payload)
      setFeedback(nextStatus === 'published' ? 'Website published successfully. QR and sharing tools are ready.' : 'Website draft saved.')
    } catch (saveError) {
      console.error('[website-builder] Unable to save settings', saveError)
      setError('Unable to save website settings.')
      setFeedback(null)
    } finally { setIsSaving(false) }
  }

  
  function applyTemplate(template: { id: string; name: string; websiteType: WebsiteType; theme: WebsiteTheme; pages: string[]; tagline: string }) {
    setSettings(previous => ({
      ...previous,
      websiteType: template.websiteType,
      theme: template.theme,
      pages: filterPagesForType(template.websiteType, template.pages),
      tagline: previous.tagline.trim() || template.tagline,
      seoSettings: { ...previous.seoSettings, title: previous.seoSettings.title.trim() || buildSeoTitle({ ...previous, websiteType: template.websiteType }) },
    }))
    setSelectedTemplateId(template.id)
    setSelectedTemplateName(template.name)
    setFeedback(`Now using ${template.name} template.`)
  }

  function previewWithMyData() {
    setShowAssistant(false)
    navigate('/website-builder/preview')
  }

  function goToStep(offset: number) { const nextIndex = Math.min(Math.max(safeStepIndex + offset, 0), BUILDER_STEPS.length - 1); setActiveStep(BUILDER_STEPS[nextIndex].id) }
  function handleSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void saveSettings('draft') }

  return (
    <PageSection title="Website Builder" subtitle="Control your business website from Sedifex: setup, pages, theme, preview, SEO, domain, publishing, QR code, and sharing from one place." className="pt-8 md:pt-10" actions={<div className="flex flex-wrap items-center gap-3"><span className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold ${statusConfig.className}`}><span className={`h-2.5 w-2.5 rounded-full ${statusConfig.dotClassName}`} />{statusConfig.label}</span><a className="button button--ghost" href={publicWebsiteUrl} target="_blank" rel="noreferrer" aria-disabled={!canPreview}>Open preview</a><button type="button" className="button button--primary" onClick={() => setShowAssistant(true)}>Open AI / Templates</button></div>}>
      <form onSubmit={handleSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.72fr)]">
        <div className="space-y-6">
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-6 text-white shadow-sm"><div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between"><div><p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-200">Business website control center</p><h3 className="mt-3 text-2xl font-bold tracking-tight md:text-3xl">Publish only when the website is ready</h3><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">Sedifex now checks the essentials before publishing, then gives every business QR and sharing tools for quick marketing.</p></div><div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm shadow-xl backdrop-blur"><p className="text-slate-300">Current website</p><p className="mt-1 font-semibold text-white">{settings.businessName || 'Loading business…'}</p><p className="mt-3 break-all rounded-xl bg-white/10 px-3 py-2 text-cyan-100">{publicWebsiteUrl}</p></div></div></section>

          {showAssistant ? <Suspense fallback={null}><WebsiteBuilderAssistantPanel selectedTemplateId={selectedTemplateId} selectedTemplateName={selectedTemplateName} onSelectTemplate={applyTemplate} onPreviewWithMyData={previewWithMyData} /></Suspense> : null}

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-5"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Setup wizard</p><h3 className="mt-1 text-xl font-semibold text-slate-950">{currentStep.label}</h3><p className="mt-1 text-sm text-slate-500">Step {safeStepIndex + 1} of {BUILDER_STEPS.length}: {currentStep.description}</p></div><span className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-bold text-indigo-700">{progressPercent}% complete</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${progressPercent}%` }} /></div><div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{BUILDER_STEPS.map((step, index) => { const isActive = activeStep === step.id; const isComplete = stepCompletion[step.id]; return <button key={step.id} type="button" className={`rounded-2xl border p-3 text-left transition ${isActive ? 'border-indigo-500 bg-indigo-50 shadow-sm ring-2 ring-indigo-100' : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50'}`} onClick={() => setActiveStep(step.id)}><span className="flex items-center justify-between gap-2"><span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${isActive ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{index + 1}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isComplete ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{isComplete ? 'Done' : 'Open'}</span></span><span className="mt-2 block text-sm font-bold text-slate-900">{step.label}</span></button> })}</div></section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            {activeStep === 'identity' ? <div><p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Business identity</p><h3 className="mt-1 text-2xl font-semibold text-slate-950">Collect all website identity data</h3><p className="mt-2 text-sm text-slate-500">These fields let Sedifex generate a complete website, contact section, footer, social links, and branded preview from one profile.</p><div className="mt-6 grid gap-5 lg:grid-cols-2"><label className="block text-sm font-semibold text-slate-700">Business name<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50" value={settings.businessName} onChange={event => updateSetting('businessName', event.target.value)} placeholder="Wesoamo Foundation" /></label><label className="block text-sm font-semibold text-slate-700">Short tagline<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50" value={settings.tagline} onChange={event => updateSetting('tagline', event.target.value)} placeholder="Supporting communities through action and impact" /></label><label className="block text-sm font-semibold text-slate-700 lg:col-span-2">Business description<textarea className="mt-2 min-h-28 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50" value={settings.description} onChange={event => updateSetting('description', event.target.value)} placeholder="Tell customers what the business does, who it serves, and why they should choose it." /></label><label className="block text-sm font-semibold text-slate-700">Business logo<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50" value={settings.businessLogoUrl} onChange={event => updateSetting('businessLogoUrl', event.target.value)} placeholder="https://.../logo.png" /></label><label className="block text-sm font-semibold text-slate-700">Cover / banner image<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50" value={settings.coverImageUrl} onChange={event => updateSetting('coverImageUrl', event.target.value)} placeholder="https://.../banner.jpg" /></label><label className="block text-sm font-semibold text-slate-700">Brand color<div className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-300 px-4 py-3 focus-within:border-indigo-500 focus-within:ring-4 focus:ring-indigo-50"><input type="color" className="h-10 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white" value={settings.brandColor} onChange={event => updateSetting('brandColor', event.target.value)} /><input className="min-w-0 flex-1 outline-none" value={settings.brandColor} onChange={event => updateSetting('brandColor', normalizeBrandColor(event.target.value))} placeholder="#4f46e5" /></div></label><label className="block text-sm font-semibold text-slate-700">Website slug<div className="mt-2 flex flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-50 sm:flex-row"><span className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-slate-500 sm:border-b-0 sm:border-r">sites.sedifex.com/</span><input className="min-w-0 flex-1 px-4 py-3 outline-none" value={settings.slug} onChange={event => updateSetting('slug', slugify(event.target.value))} placeholder="wesoamo-foundation" /></div></label></div><div className="mt-8"><h4 className="text-lg font-semibold text-slate-950">Contact details</h4><div className="mt-4 grid gap-5 lg:grid-cols-2"><label className="block text-sm font-semibold text-slate-700">Phone number<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50" value={settings.phone} onChange={event => updateSetting('phone', event.target.value)} placeholder="+233 24 000 0000" /></label><label className="block text-sm font-semibold text-slate-700">WhatsApp number<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50" value={settings.whatsapp} onChange={event => updateSetting('whatsapp', event.target.value)} placeholder="+233 24 000 0000" /></label><label className="block text-sm font-semibold text-slate-700">Email<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50" value={settings.email} onChange={event => updateSetting('email', event.target.value)} placeholder="hello@business.com" /></label><label className="block text-sm font-semibold text-slate-700">Location<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50" value={settings.location} onChange={event => updateSetting('location', event.target.value)} placeholder="Accra, Ghana" /></label><label className="block text-sm font-semibold text-slate-700 lg:col-span-2">Opening hours<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50" value={settings.openingHours} onChange={event => updateSetting('openingHours', event.target.value)} placeholder="Mon - Sat, 9:00 AM - 6:00 PM" /></label></div></div><div className="mt-8"><div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between"><div><h4 className="text-lg font-semibold text-slate-950">Social media links</h4><p className="mt-1 text-sm text-slate-500">Expanded socialLinks data can be reused across header, footer, contact page, and social buttons.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{activeSocialLinks.length} filled</span></div><div className="mt-4 grid gap-5 lg:grid-cols-2">{SOCIAL_LINK_FIELDS.map(field => <label key={field.id} className="block text-sm font-semibold text-slate-700">{field.label}<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50" value={settings.socialLinks[field.id]} onChange={event => updateSocialLink(field.id, event.target.value)} placeholder={field.placeholder} /></label>)}</div></div></div> : null}

            {activeStep === 'type' ? <div><p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Website type</p><h3 className="mt-1 text-2xl font-semibold text-slate-950">Choose the website structure</h3><p className="mt-2 text-sm text-slate-500">When you choose a type, Sedifex automatically loads the best page list and generator style for that industry.</p><div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{WEBSITE_TYPES.map(type => { const isSelected = settings.websiteType === type.id; return <button key={type.id} type="button" className={`group rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg ${isSelected ? 'border-indigo-500 bg-indigo-50 shadow-md ring-4 ring-indigo-100' : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50'}`} onClick={() => selectWebsiteType(type.id)}><span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl text-xl ring-1 ${type.accentClassName}`}>{type.icon}</span><span className="mt-4 block font-semibold text-slate-950">{type.label}</span><span className="mt-1 block text-sm leading-5 text-slate-600">{type.description}</span><span className="mt-3 flex flex-wrap gap-1.5">{PAGE_OPTIONS_BY_TYPE[type.id].slice(0, 4).map(page => <span key={page} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{page}</span>)}</span>{isSelected ? <span className="mt-3 inline-flex text-xs font-semibold text-indigo-700">Selected smart page set</span> : null}</button> })}</div></div> : null}

            {activeStep === 'pages' ? <div><div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between"><div><p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Smart pages</p><h3 className="mt-1 text-2xl font-semibold text-slate-950">{selectedType.label} pages</h3><p className="mt-2 text-sm text-slate-500">These page options are based on the selected website type. Change the type to get a different page list.</p></div><span className="inline-flex w-fit rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">{settings.pages.length} of {smartPageOptions.length} selected</span></div><div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm leading-6 text-indigo-800">Smart page set for <span className="font-bold">{selectedType.label}</span>: {smartPageOptions.join(', ')}</div><div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{smartPageOptions.map(page => { const isChecked = settings.pages.includes(page); const isPaymentPage = paymentPages.includes(page); return <label key={page} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm font-semibold transition ${isChecked ? 'border-indigo-300 bg-indigo-50 text-indigo-800 ring-2 ring-indigo-100' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}`}><input type="checkbox" className="mt-0.5 h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" checked={isChecked} onChange={() => updateSetting('pages', togglePage(settings.pages, page))} /><span><span className="block">{page}</span>{isPaymentPage ? <span className="mt-1 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Payment / action page</span> : null}</span></label> })}</div></div> : null}

            {activeStep === 'theme' ? <div><p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Theme</p><h3 className="mt-1 text-2xl font-semibold text-slate-950">Pick the design style</h3><p className="mt-2 text-sm text-slate-500">The live preview changes immediately when a theme is selected.</p><div className="mt-6 grid gap-4 md:grid-cols-2">{THEMES.map(theme => { const isSelected = settings.theme === theme.id; return <button key={theme.id} type="button" className={`rounded-3xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg ${isSelected ? 'border-indigo-500 bg-indigo-50 shadow-md ring-4 ring-indigo-100' : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50'}`} onClick={() => updateSetting('theme', theme.id)}><div className={`rounded-2xl bg-gradient-to-br ${theme.previewClassName} p-5`}><div className={`h-3 w-24 rounded-full ${theme.headingClassName}`} /><div className="mt-5 space-y-2"><div className="h-2.5 rounded-full bg-white/80" /><div className="h-2.5 w-2/3 rounded-full bg-white/60" /></div><div className={`mt-5 h-8 w-28 rounded-full ${theme.buttonClassName}`} /></div><div className="mt-4 flex items-start justify-between gap-3"><div><span className="block font-semibold text-slate-950">{theme.label}</span><span className="mt-1 block text-sm leading-5 text-slate-600">{theme.description}</span></div>{isSelected ? <span className="rounded-full bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white">Active</span> : null}</div></button> })}</div></div> : null}

            {activeStep === 'content' ? <div><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Content generator</p><h3 className="mt-1 text-2xl font-semibold text-slate-950">Generate first-draft website copy</h3><p className="mt-2 text-sm text-slate-500">Sedifex can use the business name, type, selected pages, products, services, and gallery to generate a first version automatically.</p></div><button type="button" className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5" onClick={generateAllContent}>Generate all content</button></div><div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm leading-6 text-indigo-800">Example style: <span className="font-bold">{settings.businessName || 'Wesoamo Foundation'}</span> {settings.websiteType === 'ngo' ? 'supports communities through programs, donations, volunteer work, and impact-driven projects.' : `helps ${CONTENT_GENERATOR_PROFILE[settings.websiteType].audience} through ${CONTENT_GENERATOR_PROFILE[settings.websiteType].offerPlural}.`}</div><div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3"><button type="button" className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-indigo-50" onClick={() => generateContent('homepage')}><span className="font-bold text-slate-950">Generate homepage content</span><span className="mt-1 block text-sm text-slate-600">Hero copy and homepage introduction.</span></button><button type="button" className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-indigo-50" onClick={() => generateContent('about')}><span className="font-bold text-slate-950">Generate About section</span><span className="mt-1 block text-sm text-slate-600">Business story and purpose.</span></button><button type="button" className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-indigo-50" onClick={() => generateContent('serviceDescriptions')}><span className="font-bold text-slate-950">Generate service descriptions</span><span className="mt-1 block text-sm text-slate-600">Services, products, programs, or offers.</span></button><button type="button" className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-indigo-50" onClick={() => generateContent('seoTitle')}><span className="font-bold text-slate-950">Generate SEO title</span><span className="mt-1 block text-sm text-slate-600">Search-friendly page title.</span></button><button type="button" className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-indigo-50" onClick={() => generateContent('tagline')}><span className="font-bold text-slate-950">Generate website tagline</span><span className="mt-1 block text-sm text-slate-600">Short brand message for the hero.</span></button></div><div className="mt-8 grid gap-5"><label className="block text-sm font-semibold text-slate-700">SEO title<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50" value={settings.contentDrafts.seoTitle} onChange={event => updateContentDraft('seoTitle', event.target.value)} placeholder="Business name | Service keywords and location" /></label><label className="block text-sm font-semibold text-slate-700">Homepage content<textarea className="mt-2 min-h-32 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50" value={settings.contentDrafts.homepage} onChange={event => updateContentDraft('homepage', event.target.value)} placeholder="Generated homepage content will appear here." /></label><label className="block text-sm font-semibold text-slate-700">About section<textarea className="mt-2 min-h-32 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50" value={settings.contentDrafts.about} onChange={event => updateContentDraft('about', event.target.value)} placeholder="Generated About content will appear here." /></label><label className="block text-sm font-semibold text-slate-700">Service / product / program descriptions<textarea className="mt-2 min-h-36 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50" value={settings.contentDrafts.serviceDescriptions} onChange={event => updateContentDraft('serviceDescriptions', event.target.value)} placeholder="Generated service descriptions will appear here." /></label></div></div> : null}

            {activeStep === 'seo' ? <div><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">SEO settings</p><h3 className="mt-1 text-2xl font-semibold text-slate-950">Control how the website appears online</h3><p className="mt-2 text-sm text-slate-500">Set the website title, meta description, keywords, and social share image for Google, Facebook, and WhatsApp.</p></div><button type="button" className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5" onClick={generateSeoSettings}>Generate SEO settings</button></div><div className="mt-6 grid gap-5"><label className="block text-sm font-semibold text-slate-700">Website title<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50" value={settings.seoSettings.title} onChange={event => updateSeoSetting('title', event.target.value)} placeholder="Wesoamo Foundation | Programs, Donations & Volunteer Support" /></label><label className="block text-sm font-semibold text-slate-700">Meta description<textarea className="mt-2 min-h-24 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50" value={settings.seoSettings.metaDescription} onChange={event => updateSeoSetting('metaDescription', event.target.value)} placeholder="Support Wesoamo Foundation through donations, volunteer programs, and community impact projects." /></label><label className="block text-sm font-semibold text-slate-700">Keywords<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50" value={settings.seoSettings.keywords} onChange={event => updateSeoSetting('keywords', event.target.value)} placeholder="donations, volunteers, programs, community impact" /></label><label className="block text-sm font-semibold text-slate-700">Social share image<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50" value={settings.seoSettings.socialShareImage} onChange={event => updateSeoSetting('socialShareImage', event.target.value)} placeholder="https://.../share-image.jpg" /></label></div><div className="mt-8 grid gap-5 lg:grid-cols-2"><div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-bold uppercase tracking-wide text-slate-500">Google preview</p><div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4"><p className="truncate text-sm text-slate-600">{publicWebsiteUrl}</p><h4 className="mt-1 text-lg font-semibold leading-snug text-blue-700">{seoTitlePreview}</h4><p className="mt-1 text-sm leading-6 text-slate-700">{seoDescriptionPreview}</p></div></div><div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-bold uppercase tracking-wide text-slate-500">Facebook / WhatsApp preview</p><div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">{seoShareImage ? <img src={seoShareImage} alt="Social share preview" className="h-40 w-full object-cover" /> : <div className="flex h-40 items-center justify-center bg-slate-100 text-sm font-semibold text-slate-400">Social share image</div>}<div className="p-4"><p className="truncate text-xs uppercase tracking-wide text-slate-500">{customDomain || 'sites.sedifex.com'}</p><h4 className="mt-1 text-base font-bold text-slate-950">{seoTitlePreview}</h4><p className="mt-1 text-sm text-slate-600">{seoDescriptionPreview}</p></div></div></div></div></div> : null}

            {activeStep === 'payments' ? <div><p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Payments / Quick Pay</p><h3 className="mt-1 text-2xl font-semibold text-slate-950">Prepare the website for payments</h3><p className="mt-2 text-sm text-slate-500">Payment pages now follow the selected website type.</p><div className="mt-6 grid gap-4 lg:grid-cols-2"><div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-950">Recommended payment pages</p><p className="mt-1 text-sm leading-6 text-slate-600">{paymentPages.join(', ')}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${hasPaymentPage ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{hasPaymentPage ? 'Enabled' : 'Off'}</span></div><button type="button" className="mt-5 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white" onClick={() => updateSetting('pages', togglePage(settings.pages, primaryPaymentPage))}>{settings.pages.includes(primaryPaymentPage) ? `Remove ${primaryPaymentPage}` : `Enable ${primaryPaymentPage}`}</button></div><div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5"><p className="font-semibold text-slate-950">Payment setup checklist</p><ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600"><li>• Confirm store payout account.</li><li>• Connect checkout fees and split rules.</li><li>• Show the right payment page for the website type.</li></ul></div></div></div> : null}

            {activeStep === 'domain' ? <div><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Custom domain setup</p><h3 className="mt-1 text-2xl font-semibold text-slate-950">Connect a domain after using the free Sedifex URL</h3><p className="mt-2 text-sm text-slate-500">Every website starts at sites.sedifex.com/slug. Businesses can later connect their own domain with DNS and SSL tracking.</p></div><button type="button" className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5" onClick={() => void copyDnsRecords()}>Copy DNS records</button></div><div className="mt-6 grid gap-4 lg:grid-cols-2"><div className="rounded-3xl border border-indigo-200 bg-indigo-50 p-5"><p className="text-sm font-bold uppercase tracking-wide text-indigo-700">Free Sedifex URL</p><p className="mt-3 break-all rounded-2xl bg-white px-4 py-3 text-sm font-bold text-indigo-700">{freeUrl}</p><p className="mt-3 text-sm leading-6 text-indigo-800">This free URL works first and remains available even after a custom domain is connected.</p></div><div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-bold uppercase tracking-wide text-slate-500">Custom domain</p><input className="mt-3 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50" value={settings.domainSettings.customDomain} onChange={event => updateDomainSetting('customDomain', event.target.value)} placeholder="www.wesoamofoundation.org" /><div className="mt-4 flex flex-wrap gap-2"><span className={`rounded-full border px-3 py-1 text-xs font-bold ${domainStatusConfig.className}`}>Status: {domainStatusConfig.label}</span><span className={`rounded-full border px-3 py-1 text-xs font-bold ${sslStatusConfig.className}`}>SSL: {sslStatusConfig.label}</span></div></div></div><div className="mt-5 grid gap-4 lg:grid-cols-3"><label className="block rounded-3xl border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-700 shadow-sm">Domain connection status<select className="mt-3 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50" value={settings.domainSettings.connectionStatus} onChange={event => updateDomainSetting('connectionStatus', event.target.value as DomainConnectionStatus)}><option value="not-connected">Not connected</option><option value="pending">Pending DNS</option><option value="connected">Connected</option><option value="needs-attention">Needs attention</option></select></label><label className="block rounded-3xl border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-700 shadow-sm">SSL status<select className="mt-3 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50" value={settings.domainSettings.sslStatus} onChange={event => updateDomainSetting('sslStatus', event.target.value as SslStatus)}><option value="not-started">Not started</option><option value="pending">Pending SSL</option><option value="active">SSL active</option><option value="failed">SSL failed</option></select></label><label className="block rounded-3xl border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-700 shadow-sm">DNS target<input className="mt-3 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50" value={settings.domainSettings.dnsTarget} onChange={event => updateDomainSetting('dnsTarget', event.target.value)} placeholder="sites.sedifex.com" /></label></div><div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-lg font-semibold text-slate-950">DNS instructions</p><p className="mt-1 text-sm text-slate-500">Add these records inside the domain provider dashboard, then return to Sedifex to check connection and SSL.</p><div className="mt-4 overflow-hidden rounded-2xl border border-slate-200"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Type</th><th className="px-4 py-3">Host / Name</th><th className="px-4 py-3">Value</th><th className="px-4 py-3">Purpose</th></tr></thead><tbody className="divide-y divide-slate-200">{dnsRecords.map(record => <tr key={`${record.type}-${record.host}`}><td className="px-4 py-3 font-bold text-slate-900">{record.type}</td><td className="px-4 py-3 font-medium text-slate-700">{record.host}</td><td className="px-4 py-3 font-mono text-xs text-slate-700">{record.value}</td><td className="px-4 py-3 text-slate-600">{record.note}</td></tr>)}</tbody></table></div>{domainFeedback ? <p className="mt-4 rounded-2xl bg-indigo-50 p-3 text-sm font-medium text-indigo-700">{domainFeedback}</p> : null}</div></div> : null}

            {activeStep === 'publish' ? <div><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Publish checklist</p><h3 className="mt-1 text-2xl font-semibold text-slate-950">{publishSummary}</h3><p className="mt-2 text-sm text-slate-500">Sedifex checks the essentials before a business website goes live.</p></div><span className={`rounded-full px-4 py-2 text-sm font-bold ${missingPublishItems.length === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{missingPublishItems.length === 0 ? 'Ready to publish' : `${missingPublishItems.length} missing`}</span></div><div className="mt-6 grid gap-3 md:grid-cols-2">{publishChecklist.map(item => <div key={item.id} className={`rounded-2xl border p-4 ${item.complete ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-950">{item.label}</p><p className="mt-1 text-sm leading-5 text-slate-600">{item.helper}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${item.complete ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'}`}>{item.complete ? 'Done' : 'Missing'}</span></div></div>)}</div>{missingPublishItems.length > 0 ? <p className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50 p-3 text-sm font-medium text-indigo-700">You can preview now, but complete the missing items before publishing.</p> : null}{feedback ? <p className="mt-4 rounded-2xl bg-indigo-50 p-3 text-sm font-medium text-indigo-700">{feedback}</p> : null}{error ? <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p> : null}<div className="mt-6 grid gap-3 sm:grid-cols-2"><button className="rounded-2xl px-5 py-4 text-base font-bold text-white shadow-lg transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:shadow-none" type="button" style={{ backgroundColor: canPublish ? settings.brandColor : undefined }} disabled={!canPublish} onClick={() => void saveSettings('published')}>{isSaving ? 'Publishing…' : isPublished ? 'Update published website' : 'Publish website'}</button>{!canPublish ? <p className="sm:col-span-2 -mt-1 text-sm font-medium text-amber-700">Complete the missing checklist items before publishing.</p> : null}<button className="rounded-2xl border border-slate-300 bg-white px-5 py-4 text-base font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={isSaving || isLoading}>Save draft</button></div><div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-5"><div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><div><p className="text-lg font-semibold text-slate-950">QR code and sharing tools</p><p className="mt-1 text-sm text-slate-600">These tools appear after publishing so businesses can market the website quickly.</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${isPublished ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{isPublished ? 'Published tools ready' : 'Publish first'}</span></div>{isPublished ? <div className="mt-5 grid gap-5 lg:grid-cols-[220px_1fr]"><div className="rounded-3xl bg-white p-5 text-center shadow-sm"><img src={qrCodeUrl} alt="Website QR code" className="mx-auto h-44 w-44 rounded-2xl" /><p className="mt-3 break-all text-xs font-semibold text-slate-600">{publicWebsiteUrl}</p></div><div className="grid gap-3 sm:grid-cols-2"><button type="button" className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white" onClick={downloadQrPoster}>Download QR poster</button><button type="button" className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700" onClick={() => void copyWebsiteLink()}>Copy link</button><a className="rounded-2xl bg-emerald-600 px-4 py-3 text-center text-sm font-bold text-white" href={whatsappShareUrl} target="_blank" rel="noreferrer">Share to WhatsApp</a><a className="rounded-2xl bg-blue-600 px-4 py-3 text-center text-sm font-bold text-white" href={facebookShareUrl} target="_blank" rel="noreferrer">Share to Facebook</a><button type="button" className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700" onClick={() => void copyInstagramCaption()}>Copy Instagram caption</button><button type="button" className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700" onClick={printSmallFlyer}>Print small flyer</button></div></div> : <div className="mt-5 rounded-2xl bg-white p-4 text-sm font-semibold text-slate-500">Publish the website to unlock QR code, poster download, WhatsApp sharing, Facebook sharing, Instagram caption, and small flyer printing.</div>}{shareFeedback ? <p className="mt-4 rounded-2xl bg-indigo-50 p-3 text-sm font-medium text-indigo-700">{shareFeedback}</p> : null}</div></div> : null}

            {activeStep !== 'publish' ? <div className="mt-8 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between"><button type="button" className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" disabled={safeStepIndex === 0} onClick={() => goToStep(-1)}>Previous step</button><div className="flex flex-col gap-3 sm:flex-row"><button type="submit" className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60" disabled={isSaving || isLoading}>Save draft</button><button type="button" className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5" onClick={() => goToStep(1)}>Next step</button></div></div> : null}
          </section>
        </div>

        <aside className="space-y-6"><section className="sticky top-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/70 md:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Preview</p><h3 className="mt-1 text-xl font-semibold text-slate-950">Home page preview</h3><p className="mt-1 text-sm text-slate-500">Live preview updates from type, generated content, smart pages, identity, SEO, domain, and brand color.</p></div><span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${statusConfig.className}`}><span className={`h-2 w-2 rounded-full ${statusConfig.dotClassName}`} />{statusConfig.label}</span></div><div className="mt-5 grid grid-cols-2 rounded-2xl bg-slate-100 p-1 text-sm font-semibold"><button type="button" className={`rounded-xl px-3 py-2 transition ${previewMode === 'mobile' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`} onClick={() => setPreviewMode('mobile')}>Mobile preview</button><button type="button" className={`rounded-xl px-3 py-2 transition ${previewMode === 'desktop' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`} onClick={() => setPreviewMode('desktop')}>Desktop preview</button></div><div className="mt-5 rounded-[2rem] border border-slate-200 bg-slate-100 p-3"><div className={`${previewMode === 'mobile' ? 'mx-auto max-w-[285px] rounded-[1.75rem]' : 'rounded-[1.75rem]'} overflow-hidden border border-slate-900/10 bg-white shadow-sm`}><div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-4 py-2"><span className="h-2.5 w-2.5 rounded-full bg-red-300" /><span className="h-2.5 w-2.5 rounded-full bg-amber-300" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-300" /><span className="ml-2 truncate rounded-full bg-white px-3 py-1 text-[10px] font-medium text-slate-500">{publicWebsiteUrl}</span></div><div className={`bg-gradient-to-br ${selectedTheme.previewClassName} p-4 ${selectedTheme.textClassName}`} style={settings.coverImageUrl ? { backgroundImage: `linear-gradient(135deg, rgba(15, 23, 42, 0.62), rgba(15, 23, 42, 0.2)), url(${settings.coverImageUrl})`, backgroundPosition: 'center', backgroundSize: 'cover' } : undefined}><div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2">{settings.businessLogoUrl ? <img src={settings.businessLogoUrl} alt="Business logo" className="h-9 w-9 shrink-0 rounded-2xl object-cover ring-1 ring-white/40" /> : <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-lg ring-1 ${selectedType.accentClassName}`}>{selectedType.icon}</span>}<div className="min-w-0"><p className="truncate text-sm font-bold">{settings.businessName || 'My business'}</p><p className="truncate text-[11px] opacity-75">{settings.tagline || selectedType.label}</p></div></div><span className="rounded-full px-3 py-1 text-[11px] font-bold text-white" style={{ backgroundColor: settings.brandColor }}>Pay</span></div><div className={`mt-4 flex gap-2 overflow-hidden text-[11px] ${previewMode === 'mobile' ? 'flex-wrap' : 'flex-nowrap'}`}>{previewPages.map(page => <span key={page} className={`rounded-full px-2.5 py-1 ${selectedTheme.mutedSurfaceClassName}`}>{page}</span>)}</div><div className={`${previewMode === 'mobile' ? 'grid gap-4' : 'grid grid-cols-[1.2fr_0.8fr] gap-4'} mt-6 items-center`}><div><p className="text-xs font-bold uppercase tracking-[0.2em] opacity-80">{previewContent.eyebrow}</p><h4 className={`${previewMode === 'mobile' ? 'text-2xl' : 'text-3xl'} mt-2 font-black leading-tight tracking-tight`}>{settings.tagline || previewContent.headline}</h4><p className="mt-3 text-sm leading-6 opacity-85">{getPreviewText(settings.contentDrafts.homepage || settings.description, previewContent.body)}</p><button type="button" className="mt-4 rounded-full px-4 py-2 text-sm font-bold text-white shadow-sm" style={{ backgroundColor: settings.brandColor }}>{previewContent.cta}</button></div><div className={`rounded-3xl p-3 shadow-sm ${selectedTheme.surfaceClassName}`}><div className="h-24 rounded-2xl bg-slate-200/80" /><div className="mt-3 space-y-2 text-xs"><p className="font-bold">Contact</p><p className="truncate opacity-70">{settings.phone || settings.whatsapp || 'Phone / WhatsApp'}</p><p className="truncate opacity-70">{settings.location || 'Business location'}</p></div></div></div></div><div className="grid gap-3 bg-white p-4 sm:grid-cols-3">{previewContent.cards.map(card => <div key={card} className="rounded-2xl border border-slate-200 bg-slate-50 p-3"><div className="h-8 w-8 rounded-xl" style={{ backgroundColor: `${settings.brandColor}22` }} /><p className="mt-3 text-xs font-bold text-slate-900">{card}</p><div className="mt-2 h-1.5 w-16 rounded-full bg-slate-200" /></div>)}</div><div className="border-t border-slate-200 bg-slate-50 p-4"><div className="flex flex-wrap gap-2">{settings.openingHours ? <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">{settings.openingHours}</span> : null}{activeSocialLinks.map(field => <span key={field.id} className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">{field.label}</span>)}{settings.seoSettings.title || settings.contentDrafts.seoTitle ? <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">SEO ready</span> : null}{customDomain ? <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">Domain: {DOMAIN_STATUS_CONFIG[settings.domainSettings.connectionStatus].label}</span> : null}{isPublished ? <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">QR ready</span> : null}{!settings.openingHours && activeSocialLinks.length === 0 && !settings.seoSettings.title && !settings.contentDrafts.seoTitle && !customDomain && !isPublished ? <span className="text-[11px] font-semibold text-slate-400">Opening hours, SEO, domain, and social links will show here.</span> : null}</div></div></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><a className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5" href={publicWebsiteUrl} target="_blank" rel="noreferrer">Open public site</a><button type="button" className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50" onClick={() => void copyWebsiteLink()}>Copy website link</button></div>{copyFeedback ? <p className="mt-3 rounded-2xl bg-indigo-50 p-3 text-sm font-medium text-indigo-700">{copyFeedback}</p> : null}</section></aside>
      </form>
    </PageSection>
  )
}
