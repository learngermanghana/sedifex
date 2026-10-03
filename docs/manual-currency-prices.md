# Manual currency prices for connected websites

In Products → Add item / Edit, enter an amount and select its currency. Use
**Add price** for another currency. GHS, USD, GBP, EUR, NGN and ZAR are provided.
Custom currency needs a name, symbol and unique code (for example XOF). Codes
are uppercased; duplicate codes and blank, negative or non-finite prices are rejected.
Zero is a valid explicitly entered price. There are no exchange rates or conversions.

## Pull the catalogue

Call this from your website backend. Keep the Website API key in server secrets,
never in browser JavaScript or a public environment variable.

```js
const url = new URL('https://us-central1-sedifex-web.cloudfunctions.net/v1IntegrationProducts');
url.searchParams.set('storeId', process.env.SEDIFEX_STORE_ID);
const response = await fetch(url, {
  headers: { Authorization: `Bearer ${process.env.SEDIFEX_API_KEY}` },
});
if (!response.ok) throw new Error(`Sedifex catalogue request failed: ${response.status}`);
const { products } = await response.json();
// Return the catalogue data to your frontend through your own server route.
```

The same fields appear in `products`, `publicProducts` and `publicServices` in this
response. Publication sync also copies them to public catalogue documents.

```json
{
  "id": "hair-treatment",
  "name": "Hair Treatment",
  "price": 500,
  "priceMinor": 50000,
  "currency": "GHS",
  "prices": [
    { "currencyCode": "GHS", "currencyName": "Ghana Cedi", "symbol": "GH₵", "amount": 500, "custom": false },
    { "currencyCode": "USD", "currencyName": "US Dollar", "symbol": "$", "amount": 40, "custom": false },
    { "currencyCode": "XOF", "currencyName": "CFA Franc", "symbol": "CFA", "amount": 25000, "custom": true }
  ],
  "pricesByCurrency": { "GHS": 500, "USD": 40, "XOF": 25000 },
  "availableCurrencies": ["GHS", "USD", "XOF"]
}
```

Amounts in `prices` and `pricesByCurrency` are **major units** (500 means GHS 500,
not 500 pesewas). Use exact currency codes for field mapping:

| Website field | Sedifex source |
| --- | --- |
| Cedi price | `product.pricesByCurrency.GHS` |
| Dollar price | `product.pricesByCurrency.USD` |
| Custom XOF price | `product.pricesByCurrency.XOF` |
| Currency dropdown | `product.availableCurrencies` |
| Currency name / symbol | matching row in `product.prices` |

## Display a selectable price in React

```jsx
function ItemPrice({ product }) {
  const [selectedCode, setSelectedCode] = React.useState('');
  const prices = product.prices ?? [];
  const code = selectedCode || prices[0]?.currencyCode;
  const price = prices.find(row => row.currencyCode === code);
  return <div>
    <label>
      Currency
      <select value={code ?? ''} onChange={event => setSelectedCode(event.target.value)}>
        {prices.map(row => <option key={row.currencyCode} value={row.currencyCode}>
          {row.currencyCode} — {row.currencyName}
        </option>)}
      </select>
    </label>
    <p>{price
      ? `${price.symbol} ${price.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`
      : 'Price unavailable in this currency'}</p>
  </div>;
}
```

Use saved symbols for custom currencies; custom codes may not be accepted by
`Intl.NumberFormat`'s currency mode. Render names/symbols as text, not raw HTML.
If a global website selector requests a currency missing from an item, show
“Price unavailable in this currency” or hide that item. Never relabel another
currency's amount, silently convert it, or treat missing values as zero.

For WordPress, map the same fields server-side and escape displayed strings with
`esc_html`. For example, `$product['pricesByCurrency']['USD'] ?? null` selects the
dollar amount; iterate `$product['prices']` to get its saved symbol/name.

## Compatibility and checkout

Existing records without `prices` get a single row using their recorded currency,
defaulting to GHS only when absent. No data migration is required. On newly edited
records, `prices` is authoritative. Removing a row removes its mapping on the next
sync/fetch; refresh your website cache after edits.

The existing GHS POS/payment fields remain separate compatibility fields: `price`
is the GHS row's amount and `priceMinor` is its amount in pesewas. They are null if
no GHS row exists. Websites should use `prices` for multi-currency display, not
these legacy fields. Sedifex-generated catalogue cards show all saved prices.

This feature defines catalogue display prices, not foreign-currency payment
processing. The current checkout preview accepts GHS and requires a saved GHS
price; other requested currencies are rejected. A website must separately support
the selected currency in its payment flow before offering checkout in that currency.
Do not pass a USD price to an existing GHS checkout.
