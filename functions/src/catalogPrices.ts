export type CatalogPrice = {
  currencyCode: string
  currencyName: string
  symbol: string
  amount: number
  custom: boolean
}

export const COMMON_CURRENCIES = [
  { currencyCode: 'GHS', currencyName: 'Ghana Cedi', symbol: 'GH₵' },
  { currencyCode: 'USD', currencyName: 'US Dollar', symbol: '$' },
  { currencyCode: 'GBP', currencyName: 'British Pound', symbol: '£' },
  { currencyCode: 'EUR', currencyName: 'Euro', symbol: '€' },
  { currencyCode: 'NGN', currencyName: 'Nigerian Naira', symbol: '₦' },
  { currencyCode: 'ZAR', currencyName: 'South African Rand', symbol: 'R' },
] as const

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

/** Strict on writes; tolerant reads omit malformed rows without inventing prices. */
export function normalizeCatalogPrices(value: unknown, strict = false): CatalogPrice[] {
  if (!Array.isArray(value)) {
    if (strict) throw new Error('Add at least one price.')
    return []
  }
  const seen = new Set<string>()
  const prices: CatalogPrice[] = []
  for (const raw of value) {
    const row = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    const currencyCode = text(row.currencyCode).toUpperCase()
    const standard = COMMON_CURRENCIES.find(item => item.currencyCode === currencyCode)
    const currencyName = standard?.currencyName ?? text(row.currencyName)
    const symbol = standard?.symbol ?? text(row.symbol)
    const amount = typeof row.amount === 'number' || (typeof row.amount === 'string' && row.amount.trim()) ? Number(row.amount) : NaN
    let error = ''
    if (!/^[A-Z][A-Z0-9_]{2,19}$/.test(currencyCode)) error = 'Use a currency code of 3–20 letters, numbers or underscores, starting with a letter.'
    else if (seen.has(currencyCode)) error = `Only one ${currencyCode} price is allowed.`
    else if (!currencyName || currencyName.length > 60 || !symbol || symbol.length > 12) error = 'Enter a currency name (up to 60 characters) and symbol (up to 12 characters).'
    else if (!Number.isFinite(amount) || amount < 0 || amount > Number.MAX_SAFE_INTEGER / 100) error = 'Enter a valid price of zero or more.'
    if (error) {
      if (strict) throw new Error(error)
      continue
    }
    seen.add(currencyCode)
    prices.push({ currencyCode, currencyName, symbol, amount, custom: !standard })
  }
  if (strict && !prices.length) throw new Error('Add at least one price.')
  return prices
}

export function readCatalogPrices(record: { prices?: unknown; price?: unknown; currency?: unknown }): CatalogPrice[] {
  // An explicit prices array is authoritative, including an empty one.
  if (Array.isArray(record.prices)) return normalizeCatalogPrices(record.prices)
  const currencyCode = text(record.currency).toUpperCase() || 'GHS'
  return normalizeCatalogPrices([{ currencyCode, currencyName: currencyCode, symbol: currencyCode, amount: record.price }])
}

export function catalogPriceFields(record: { prices?: unknown; price?: unknown; currency?: unknown }) {
  const prices = readCatalogPrices(record)
  return {
    prices,
    pricesByCurrency: Object.fromEntries(prices.map(price => [price.currencyCode, price.amount])),
    availableCurrencies: prices.map(price => price.currencyCode),
  }
}

export function formatCatalogPrice(price: CatalogPrice): string {
  return `${price.symbol} ${price.amount.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`
}
