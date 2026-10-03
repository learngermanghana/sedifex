import { COMMON_CURRENCIES, type CatalogPrice } from '../../../shared/catalogPrices'

export type PriceDraft = Omit<CatalogPrice, 'amount'> & { amount: string }
export const emptyPrice = (): PriceDraft => ({ ...COMMON_CURRENCIES[0], amount: '', custom: false })

export default function CatalogPricesEditor({ prices, onChange }: { prices: PriceDraft[]; onChange: (prices: PriceDraft[]) => void }) {
  function update(index: number, patch: Partial<PriceDraft>) {
    onChange(prices.map((price, i) => i === index ? { ...price, ...patch } : price))
  }
  return <fieldset className="catalog-prices">
    <legend>Prices</legend>
    <p className="field__help">Enter each price manually. No currency conversion.</p>
    {prices.map((price, index) => <div className="catalog-prices__row" key={index}>
      <div className="field">
        <label htmlFor={`price-currency-${index}`}>Currency</label>
        <select id={`price-currency-${index}`} value={price.custom ? 'custom' : price.currencyCode} onChange={event => {
          const currency = COMMON_CURRENCIES.find(item => item.currencyCode === event.target.value)
          update(index, currency ? { ...currency, custom: false } : { currencyCode: '', currencyName: '', symbol: '', custom: true })
        }}>
          {COMMON_CURRENCIES.map(currency => <option key={currency.currencyCode} value={currency.currencyCode} disabled={prices.some((p, i) => i !== index && p.currencyCode.trim().toUpperCase() === currency.currencyCode)}>{currency.currencyCode} — {currency.currencyName}</option>)}
          <option value="custom">Custom currency</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor={`price-amount-${index}`}>Price</label>
        <input id={`price-amount-${index}`} type="number" min="0" step="any" required value={price.amount} onChange={event => update(index, { amount: event.target.value })} />
      </div>
      {prices.length > 1 ? <button type="button" className="btn btn--secondary" aria-label={`Remove price ${index + 1}`} onClick={() => onChange(prices.filter((_, i) => i !== index))}>Remove</button> : null}
      {price.custom ? <div className="catalog-prices__custom">
        <label>Currency name<input required maxLength={60} value={price.currencyName} placeholder="CFA Franc" onChange={event => update(index, { currencyName: event.target.value })} /></label>
        <label>Code<input required maxLength={20} pattern="[A-Za-z][A-Za-z0-9_]{2,19}" value={price.currencyCode} placeholder="XOF" onChange={event => update(index, { currencyCode: event.target.value.toUpperCase() })} /></label>
        <label>Symbol<input required maxLength={12} value={price.symbol} placeholder="CFA" onChange={event => update(index, { symbol: event.target.value })} /></label>
      </div> : null}
    </div>)}
    <button type="button" className="btn btn--secondary" onClick={() => {
      const next = COMMON_CURRENCIES.find(currency => !prices.some(price => price.currencyCode.trim().toUpperCase() === currency.currencyCode))
      onChange([...prices, next ? { ...next, amount: '', custom: false } : { currencyCode: '', currencyName: '', symbol: '', amount: '', custom: true }])
    }}>+ Add price</button>
  </fieldset>
}
