export default function ReturnPolicyPage() {
  const today = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  return (
    <main className="prose prose-slate mx-auto max-w-3xl px-4 py-12">
      <p className="text-sm font-semibold uppercase tracking-wide text-violet-600">Policy</p>

      <h1 className="mb-2 text-3xl font-bold text-slate-900">Sedifex Return &amp; Exchange Policy</h1>

      <p className="mb-8 text-sm text-slate-500">Last updated: {today}</p>

      <p>
        This page is a return-policy template for stores that use <strong>Sedifex</strong>. Sedifex
        supports multi-merchant accounts and allows each merchant to publish their own public
        return-policy link for customers.
      </p>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">1. Return window</h2>
        <p>
          Returns are accepted within <strong>1 day</strong> of the purchase date.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">2. Exchange condition</h2>
        <p>
          Exchange is possible only when the product is in <strong>good shape</strong>.
        </p>
        <ul>
          <li>Item must be clean and unused.</li>
          <li>Item must not be broken, altered, or damaged by misuse.</li>
          <li>Original packaging or proof of purchase may be required by the merchant.</li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">3. Merchant-specific terms</h2>
        <p>
          Because Sedifex serves multiple merchants, each store can keep its own return-policy page
          link and customer instructions. Shoppers should review the specific merchant policy before
          purchase.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">4. Contact the merchant</h2>
        <p>
          For return approval, exchange requests, and product checks, contact the merchant directly
          using the details on their Sedifex public store page.
        </p>
      </section>
    </main>
  )
}
