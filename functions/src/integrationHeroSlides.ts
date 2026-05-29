import * as functions from 'firebase-functions/v1'
import { defineString } from 'firebase-functions/params'
import { defaultDb } from './firestore'
import {
  cleanIntegrationText,
  isIntegrationRequestAuthorized,
  redactIntegrationApiKey,
  resolveIntegrationApiKey,
} from './integrationAuth'

const INTEGRATION_CONTRACT_VERSION = defineString('INTEGRATION_CONTRACT_VERSION', {
  default: '2026-04-13',
})

const DEFAULT_PLACEMENT = 'home_hero'
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 25

type HeroSlideStatus = 'active' | 'draft' | 'paused' | 'expired'
type HeroSlideTextColor = 'light' | 'dark'
type HeroSlideOverlayStyle = 'none' | 'dark' | 'light' | 'gradient'
type HeroSlideLayout = 'left_text' | 'center_text' | 'right_text'

type PublicHeroSlide = {
  id: string
  storeId: string
  title: string
  eyebrow: string | null
  subtitle: string | null
  ctaLabel: string | null
  ctaHref: string | null
  secondaryCtaLabel: string | null
  secondaryCtaHref: string | null
  imageUrl: string | null
  mobileImageUrl: string | null
  accent: string | null
  textColor: HeroSlideTextColor | null
  overlayStyle: HeroSlideOverlayStyle | null
  layout: HeroSlideLayout | null
  priority: number | null
  updatedAt: string | null
}

type NormalizedHeroSlide = PublicHeroSlide & {
  placement: string
  status: HeroSlideStatus
  startsAt: string | null
  endsAt: string | null
  deleted: boolean
}

function setCors(res: functions.Response) {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, x-sedifex-api-key, api-key, X-Sedifex-Contract-Version')
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
}

function assertContract(req: functions.https.Request, res: functions.Response) {
  const expected = INTEGRATION_CONTRACT_VERSION.value() || '2026-04-13'
  const received = cleanIntegrationText(req.get('x-sedifex-contract-version'), 80)
  res.set('x-sedifex-contract-version', expected)
  res.set('x-sedifex-request-id', `${Date.now()}-${Math.random().toString(36).slice(2)}`)

  if (received && received !== expected) {
    res.status(400).json({ error: 'contract-version-mismatch', expectedVersion: expected, receivedVersion: received })
    return false
  }

  return true
}

function numberValue(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function textOrNull(value: unknown, max = 2000) {
  return cleanIntegrationText(value, max) || null
}

function toDateIso(value: unknown) {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString()
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = new Date(trimmed)
    return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString()
  }
  if (typeof (value as { toDate?: unknown }).toDate === 'function') {
    const parsed = (value as { toDate: () => Date }).toDate()
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }
  if (typeof value === 'object') {
    const seconds = numberValue((value as Record<string, unknown>)._seconds ?? (value as Record<string, unknown>).seconds)
    if (seconds !== null) return new Date(seconds * 1000).toISOString()
  }
  return null
}

function normalizeStatus(value: unknown): HeroSlideStatus {
  const status = cleanIntegrationText(value, 30).toLowerCase()
  if (status === 'active' || status === 'paused' || status === 'expired' || status === 'draft') return status
  return 'draft'
}

function normalizeTextColor(value: unknown): HeroSlideTextColor | null {
  const color = cleanIntegrationText(value, 20).toLowerCase()
  if (color === 'light' || color === 'dark') return color
  return null
}

function normalizeOverlayStyle(value: unknown): HeroSlideOverlayStyle | null {
  const style = cleanIntegrationText(value, 30).toLowerCase()
  if (style === 'none' || style === 'dark' || style === 'light' || style === 'gradient') return style
  return null
}

function normalizeLayout(value: unknown): HeroSlideLayout | null {
  const layout = cleanIntegrationText(value, 30).toLowerCase()
  if (layout === 'left_text' || layout === 'center_text' || layout === 'right_text') return layout
  return null
}

function normalizeSlide(id: string, storeId: string, record: Record<string, unknown>): NormalizedHeroSlide | null {
  const title = cleanIntegrationText(record.title, 240)
  if (!title) return null

  return {
    id,
    storeId,
    title,
    eyebrow: textOrNull(record.eyebrow, 180),
    subtitle: textOrNull(record.subtitle, 800),
    ctaLabel: textOrNull(record.ctaLabel, 120),
    ctaHref: textOrNull(record.ctaHref, 1000),
    secondaryCtaLabel: textOrNull(record.secondaryCtaLabel, 120),
    secondaryCtaHref: textOrNull(record.secondaryCtaHref, 1000),
    imageUrl: textOrNull(record.imageUrl, 2000),
    mobileImageUrl: textOrNull(record.mobileImageUrl, 2000),
    accent: textOrNull(record.accent, 80),
    textColor: normalizeTextColor(record.textColor),
    overlayStyle: normalizeOverlayStyle(record.overlayStyle),
    layout: normalizeLayout(record.layout),
    priority: numberValue(record.priority),
    updatedAt: toDateIso(record.updatedAt),
    placement: cleanIntegrationText(record.placement, 80) || DEFAULT_PLACEMENT,
    status: normalizeStatus(record.status),
    startsAt: toDateIso(record.startsAt),
    endsAt: toDateIso(record.endsAt),
    deleted: record.deleted === true,
  }
}

function isPublicActive(slide: NormalizedHeroSlide, placement: string, now: number) {
  if (slide.deleted) return false
  if (slide.placement !== placement) return false
  if (slide.status !== 'active') return false
  const startsAt = slide.startsAt ? Date.parse(slide.startsAt) : null
  const endsAt = slide.endsAt ? Date.parse(slide.endsAt) : null
  if (startsAt && Number.isFinite(startsAt) && startsAt > now) return false
  if (endsAt && Number.isFinite(endsAt) && endsAt < now) return false
  return true
}

function sortSlides(slides: NormalizedHeroSlide[]) {
  return [...slides].sort((a, b) => {
    const aPriority = a.priority ?? Number.POSITIVE_INFINITY
    const bPriority = b.priority ?? Number.POSITIVE_INFINITY
    if (aPriority !== bPriority) return aPriority - bPriority
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
  })
}

function publicSlide(slide: NormalizedHeroSlide): PublicHeroSlide {
  return {
    id: slide.id,
    storeId: slide.storeId,
    title: slide.title,
    eyebrow: slide.eyebrow,
    subtitle: slide.subtitle,
    ctaLabel: slide.ctaLabel,
    ctaHref: slide.ctaHref,
    secondaryCtaLabel: slide.secondaryCtaLabel,
    secondaryCtaHref: slide.secondaryCtaHref,
    imageUrl: slide.imageUrl,
    mobileImageUrl: slide.mobileImageUrl,
    accent: slide.accent,
    textColor: slide.textColor,
    overlayStyle: slide.overlayStyle,
    layout: slide.layout,
    priority: slide.priority,
    updatedAt: slide.updatedAt,
  }
}

function resolveLimit(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.floor(parsed))
}

export const v1IntegrationHeroSlides = functions.https.onRequest(async (req, res): Promise<void> => {
  setCors(res)

  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }

  if (!assertContract(req, res)) return

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method-not-allowed' })
    return
  }

  const storeId = cleanIntegrationText(req.query.storeId, 180)
  if (!storeId) {
    res.status(400).json({ error: 'missing-store-id' })
    return
  }

  if (!(await isIntegrationRequestAuthorized(req, storeId))) {
    const requestKey = resolveIntegrationApiKey(req)
    res.status(401).json({
      error: 'invalid-api-key',
      message: 'Invalid API key for storeId or missing credentials.',
      debug: {
        storeId,
        hasApiKey: Boolean(requestKey),
        apiKeyHint: requestKey ? redactIntegrationApiKey(requestKey) : null,
      },
    })
    return
  }

  const placement = cleanIntegrationText(req.query.placement, 80) || DEFAULT_PLACEMENT
  const limit = resolveLimit(req.query.limit)

  try {
    const snapshot = await defaultDb
      .collection('stores')
      .doc(storeId)
      .collection('websiteHeroSlides')
      .limit(100)
      .get()
    const now = Date.now()
    const slides = sortSlides(
      snapshot.docs
        .map(slideDoc => normalizeSlide(slideDoc.id, storeId, slideDoc.data() as Record<string, unknown>))
        .filter((slide): slide is NormalizedHeroSlide => slide !== null)
        .filter(slide => isPublicActive(slide, placement, now)),
    ).slice(0, limit).map(publicSlide)

    res.status(200).json({
      ok: true,
      storeId,
      placement,
      slides,
    })
  } catch (error) {
    functions.logger.error('v1IntegrationHeroSlides failed', { storeId, placement, error })
    res.status(500).json({ error: 'integration-hero-slides-failed' })
  }
})
