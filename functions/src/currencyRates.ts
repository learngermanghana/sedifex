import * as functions from 'firebase-functions/v1'
import { admin, defaultDb } from './firestore'

const TIME_ZONE = 'Africa/Accra'
const RATE_DOC_PATH = 'systemConfig/currencyRates'
const OPEN_RATE_URL = 'https://open.er-api.com/v6/latest/USD'

export type CurrencyRates = {
  baseCurrency: 'USD'
  quoteCurrency: 'GHS'
  usdToGhs: number
  ghsToUsd: number
  provider: string
  providerUrl: string
  providerUpdatedAt: string | null
  fetchedAt: string
  refreshCadence: 'weekly_monday'
}

function finitePositive(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function isoFromUnix(value: unknown) {
  const seconds = finitePositive(value)
  return seconds ? new Date(seconds * 1000).toISOString() : null
}

function normalizeCached(data: Record<string, unknown> | undefined): CurrencyRates | null {
  if (!data) return null
  const usdToGhs = finitePositive(data.usdToGhs)
  if (!usdToGhs) return null

  const ghsToUsd = finitePositive(data.ghsToUsd) || 1 / usdToGhs
  const fetchedAtRaw = typeof data.fetchedAtIso === 'string' ? data.fetchedAtIso : ''
  const fetchedAt = fetchedAtRaw && !Number.isNaN(Date.parse(fetchedAtRaw))
    ? fetchedAtRaw
    : new Date().toISOString()

  return {
    baseCurrency: 'USD',
    quoteCurrency: 'GHS',
    usdToGhs,
    ghsToUsd,
    provider: typeof data.provider === 'string' && data.provider.trim() ? data.provider.trim() : 'ExchangeRate-API',
    providerUrl: typeof data.providerUrl === 'string' && data.providerUrl.trim()
      ? data.providerUrl.trim()
      : 'https://www.exchangerate-api.com',
    providerUpdatedAt: typeof data.providerUpdatedAt === 'string' && data.providerUpdatedAt.trim()
      ? data.providerUpdatedAt.trim()
      : null,
    fetchedAt,
    refreshCadence: 'weekly_monday',
  }
}

export async function refreshUsdGhsRates(reason = 'scheduled'): Promise<CurrencyRates> {
  const response = await fetch(OPEN_RATE_URL, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Sedifex/1.0 currency-rate-refresh',
    },
  })
  if (!response.ok) {
    throw new Error(`FX rate request failed (${response.status})`)
  }

  const data = await response.json() as {
    result?: unknown
    provider?: unknown
    time_last_update_unix?: unknown
    rates?: Record<string, unknown>
  }

  if (data.result !== 'success') {
    throw new Error('FX rate provider did not return a successful response')
  }

  const usdToGhs = finitePositive(data.rates?.GHS)
  if (!usdToGhs) {
    throw new Error('FX rate provider response did not contain a valid USD/GHS rate')
  }

  const nowIso = new Date().toISOString()
  const rates: CurrencyRates = {
    baseCurrency: 'USD',
    quoteCurrency: 'GHS',
    usdToGhs,
    ghsToUsd: 1 / usdToGhs,
    provider: 'ExchangeRate-API',
    providerUrl: 'https://www.exchangerate-api.com',
    providerUpdatedAt: isoFromUnix(data.time_last_update_unix),
    fetchedAt: nowIso,
    refreshCadence: 'weekly_monday',
  }

  await defaultDb.doc(RATE_DOC_PATH).set({
    ...rates,
    fetchedAtIso: nowIso,
    fetchedAtServer: admin.firestore.FieldValue.serverTimestamp(),
    refreshReason: reason,
    sourceEndpoint: OPEN_RATE_URL,
  }, { merge: true })

  functions.logger.info('USD/GHS currency rate refreshed', {
    reason,
    usdToGhs: rates.usdToGhs,
    providerUpdatedAt: rates.providerUpdatedAt,
  })

  return rates
}

export async function getUsdGhsRates(options: { refreshIfMissing?: boolean } = {}): Promise<CurrencyRates> {
  const snapshot = await defaultDb.doc(RATE_DOC_PATH).get()
  const cached = normalizeCached(snapshot.data() as Record<string, unknown> | undefined)
  if (cached) return cached
  if (options.refreshIfMissing === false) {
    throw new Error('USD/GHS currency rate is not available yet')
  }
  return refreshUsdGhsRates('cache-miss')
}

export function convertListedPrice(amount: number, currency: string, rates: CurrencyRates) {
  const normalizedCurrency = currency.trim().toUpperCase()
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Price amount must be a valid positive number')
  }
  if (normalizedCurrency === 'GHS') {
    return {
      listedAmount: amount,
      listedCurrency: 'GHS' as const,
      priceGhs: amount,
      priceUsd: amount * rates.ghsToUsd,
    }
  }
  if (normalizedCurrency === 'USD') {
    return {
      listedAmount: amount,
      listedCurrency: 'USD' as const,
      priceGhs: amount * rates.usdToGhs,
      priceUsd: amount,
    }
  }
  throw new Error('Only GHS and USD pricing are supported')
}

export const getCurrencyRates = functions.https.onCall(async () => {
  return getUsdGhsRates({ refreshIfMissing: true })
})

export const refreshWeeklyCurrencyRates = functions.pubsub
  .schedule('0 6 * * 1')
  .timeZone(TIME_ZONE)
  .onRun(async () => {
    await refreshUsdGhsRates('weekly-monday')
    return null
  })
