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

type IntegrationSocialSettingsProfile = {
  displayName: string | null
  tagline: string | null
  businessDescription: string | null
  openingHours: string | null
  brandColor: string | null
  logoUrl: string | null
  coverImageUrl: string | null
  socialShareImage: string | null
  publicPhone: string | null
  whatsappNumber: string | null
  telegramNumber: string | null
  publicEmail: string | null
  addressLine1: string | null
  city: string | null
  country: string | null
  websiteUrl: string | null
  instagramHandle: string | null
  facebookUrl: string | null
  tiktokHandle: string | null
  youtubeUrl: string | null
  xHandle: string | null
  linkedinUrl: string | null
  updatedAt: string | null
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

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function textOrNull(value: unknown, max = 2000) {
  return cleanIntegrationText(value, max) || null
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const normalized = textOrNull(value)
    if (normalized) return normalized
  }
  return null
}

function buildSocialSettingsProfile(storeData: Record<string, unknown>, settingsData: Record<string, unknown>): IntegrationSocialSettingsProfile {
  const publicProfile = getRecord(storeData.publicProfile)
  const settingsPublicProfile = getRecord(settingsData.publicProfile)
  const socialLinks = getRecord(storeData.socialLinks)
  const settingsSocialLinks = getRecord(settingsData.socialLinks)
  const website = getRecord(settingsData.websiteBuilder)
  const websiteSocialLinks = getRecord(website.socialLinks)
  const businessIdentity = getRecord(website.businessIdentity)
  const businessIdentitySocialLinks = getRecord(businessIdentity.socialLinks)
  const seoSettings = getRecord(website.seoSettings)

  return {
    displayName: firstText(publicProfile.displayName, settingsPublicProfile.displayName, website.businessName, businessIdentity.businessName, storeData.displayName, storeData.name, storeData.businessName),
    tagline: firstText(publicProfile.tagline, settingsPublicProfile.tagline, website.tagline, businessIdentity.tagline, storeData.tagline),
    businessDescription: firstText(publicProfile.businessDescription, settingsPublicProfile.businessDescription, website.description, businessIdentity.description, storeData.description),
    openingHours: firstText(publicProfile.openingHours, settingsPublicProfile.openingHours, website.openingHours, businessIdentity.openingHours, storeData.openingHours),
    brandColor: firstText(publicProfile.brandColor, settingsPublicProfile.brandColor, website.brandColor, businessIdentity.brandColor, storeData.brandColor, storeData.accentColor),
    logoUrl: firstText(publicProfile.logoUrl, settingsPublicProfile.logoUrl, website.businessLogoUrl, businessIdentity.businessLogoUrl, socialLinks.logoUrl, settingsSocialLinks.logoUrl, storeData.logoUrl, storeData.storeLogoUrl, storeData.businessLogoUrl),
    coverImageUrl: firstText(publicProfile.coverImageUrl, settingsPublicProfile.coverImageUrl, website.coverImageUrl, businessIdentity.coverImageUrl, socialLinks.coverImageUrl, settingsSocialLinks.coverImageUrl, storeData.coverImageUrl, storeData.bannerImageUrl),
    socialShareImage: firstText(publicProfile.socialShareImage, settingsPublicProfile.socialShareImage, seoSettings.socialShareImage, socialLinks.socialShareImage, settingsSocialLinks.socialShareImage, storeData.socialShareImage),
    publicPhone: firstText(publicProfile.publicPhone, settingsPublicProfile.publicPhone, website.phone, businessIdentity.phone, socialLinks.publicPhone, settingsSocialLinks.publicPhone, storeData.publicPhone, storeData.phone, storeData.phoneNumber, storeData.storePhone, storeData.contactPhone),
    whatsappNumber: firstText(publicProfile.whatsappNumber, settingsPublicProfile.whatsappNumber, website.whatsapp, businessIdentity.whatsapp, socialLinks.whatsappNumber, settingsSocialLinks.whatsappNumber, storeData.whatsappNumber, storeData.whatsapp, storeData.waLink),
    telegramNumber: firstText(publicProfile.telegramNumber, settingsPublicProfile.telegramNumber, socialLinks.telegramNumber, settingsSocialLinks.telegramNumber, storeData.telegramNumber),
    publicEmail: firstText(publicProfile.publicEmail, settingsPublicProfile.publicEmail, website.email, businessIdentity.email, socialLinks.publicEmail, settingsSocialLinks.publicEmail, storeData.publicEmail, storeData.email, storeData.businessEmail, storeData.ownerEmail),
    addressLine1: firstText(publicProfile.addressLine1, settingsPublicProfile.addressLine1, website.location, businessIdentity.location, storeData.addressLine1, storeData.address, storeData.location),
    city: firstText(publicProfile.city, settingsPublicProfile.city, storeData.city, storeData.storeCity, storeData.town),
    country: firstText(publicProfile.country, settingsPublicProfile.country, storeData.country, storeData.storeCountry),
    websiteUrl: firstText(publicProfile.websiteUrl, settingsPublicProfile.websiteUrl, websiteSocialLinks.website, businessIdentitySocialLinks.website, socialLinks.websiteUrl, socialLinks.website, settingsSocialLinks.websiteUrl, settingsSocialLinks.website, storeData.websiteUrl, storeData.websiteLink, storeData.promoWebsiteUrl, storeData.storeWebsiteUrl),
    instagramHandle: firstText(publicProfile.instagramHandle, settingsPublicProfile.instagramHandle, websiteSocialLinks.instagram, businessIdentitySocialLinks.instagram, socialLinks.instagramHandle, socialLinks.instagram, settingsSocialLinks.instagramHandle, settingsSocialLinks.instagram, storeData.instagramHandle, storeData.instagramUrl),
    facebookUrl: firstText(publicProfile.facebookUrl, settingsPublicProfile.facebookUrl, websiteSocialLinks.facebook, businessIdentitySocialLinks.facebook, socialLinks.facebookUrl, socialLinks.facebook, settingsSocialLinks.facebookUrl, settingsSocialLinks.facebook, storeData.facebookUrl),
    tiktokHandle: firstText(publicProfile.tiktokHandle, settingsPublicProfile.tiktokHandle, websiteSocialLinks.tiktok, businessIdentitySocialLinks.tiktok, socialLinks.tiktokHandle, socialLinks.tiktok, settingsSocialLinks.tiktokHandle, settingsSocialLinks.tiktok, storeData.tiktokHandle, storeData.tiktokUrl),
    youtubeUrl: firstText(publicProfile.youtubeUrl, settingsPublicProfile.youtubeUrl, websiteSocialLinks.youtube, businessIdentitySocialLinks.youtube, socialLinks.youtubeUrl, socialLinks.youtube, settingsSocialLinks.youtubeUrl, settingsSocialLinks.youtube, storeData.youtubeUrl),
    xHandle: firstText(publicProfile.xHandle, settingsPublicProfile.xHandle, websiteSocialLinks.x, businessIdentitySocialLinks.x, socialLinks.xHandle, socialLinks.x, settingsSocialLinks.xHandle, settingsSocialLinks.x, storeData.xHandle, storeData.twitterUrl, storeData.xUrl),
    linkedinUrl: firstText(publicProfile.linkedinUrl, settingsPublicProfile.linkedinUrl, websiteSocialLinks.linkedin, businessIdentitySocialLinks.linkedin, socialLinks.linkedinUrl, socialLinks.linkedin, settingsSocialLinks.linkedinUrl, settingsSocialLinks.linkedin, storeData.linkedinUrl),
    updatedAt: toDateIso(publicProfile.updatedAt ?? settingsPublicProfile.updatedAt ?? storeData.publicProfileUpdatedAt ?? website.updatedAt ?? settingsData.updatedAt ?? storeData.updatedAt),
  }
}

export const v1IntegrationSocialSettings = functions.https.onRequest(async (req, res): Promise<void> => {
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

  try {
    const [storeSnapshot, settingsSnapshot] = await Promise.all([
      defaultDb.collection('stores').doc(storeId).get(),
      defaultDb.collection('storeSettings').doc(storeId).get(),
    ])
    const storeData = (storeSnapshot.data() ?? {}) as Record<string, unknown>
    const settingsData = (settingsSnapshot.data() ?? {}) as Record<string, unknown>
    const profile = buildSocialSettingsProfile(storeData, settingsData)

    res.status(200).json({
      ok: true,
      storeId,
      profile,
      socialLinks: {
        website: profile.websiteUrl,
        instagram: profile.instagramHandle,
        facebook: profile.facebookUrl,
        tiktok: profile.tiktokHandle,
        youtube: profile.youtubeUrl,
        x: profile.xHandle,
        linkedin: profile.linkedinUrl,
      },
    })
  } catch (error) {
    functions.logger.error('v1IntegrationSocialSettings failed', { storeId, error })
    res.status(500).json({ error: 'integration-social-settings-failed' })
  }
})
