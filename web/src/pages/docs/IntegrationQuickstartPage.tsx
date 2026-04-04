import React from 'react'
import DocsPageLayout from '../../components/docs/DocsPageLayout'

export default function IntegrationQuickstartPage() {
  return (
    <DocsPageLayout
      title="Sedifex Integration Quickstart (Next.js + WordPress)"
      subtitle="Use this guide to auto-load Sedifex products in WordPress or a Next.js storefront on Vercel."
    >
      <section>
        <h2>What you get</h2>
        <ul>
          <li>Product fields: <code>id</code>, <code>storeId</code>, <code>name</code>, <code>category</code>, <code>description</code>, <code>price</code>, <code>stockCount</code>, and media metadata.</li>
          <li>Integration flow with API key auth via <code>GET /integrationProducts?storeId=&lt;storeId&gt;</code>.</li>
          <li>Dedupe, fallback data, category grouping, and cache strategy recommendations.</li>
        </ul>
      </section>

      <section>
        <h2>Integration flow</h2>
        <ol>
          <li>Create an integration API key from <strong>Account → Integrations</strong>.</li>
          <li>Send <code>Authorization: Bearer &lt;integration_key&gt;</code> with your request.</li>
          <li>Deduplicate using <code>id|storeId|name|price</code>.</li>
          <li>Fallback to static products if fetch fails.</li>
          <li>Render products grouped by category and choose cache mode based on stock volatility.</li>
        </ol>
      </section>

      <section>
        <h2>Next.js cache guidance</h2>
        <ul>
          <li><strong>30–120s</strong> revalidate window for frequent stock/price changes.</li>
          <li><strong>3600s+</strong> for mostly static catalogs.</li>
          <li>Use SWR/polling on top of SSR/ISR when you need near-live updates.</li>
        </ul>
      </section>

      <section>
        <h2>Security and operations checklist</h2>
        <ul>
          <li>Use per-integration keys and rotate credentials on ownership changes.</li>
          <li>Do not embed admin credentials in storefront code.</li>
          <li>Log sync success/failure metrics and add alerting for repeated failures.</li>
          <li>Validate in staging before production rollout.</li>
        </ul>
      </section>

      <section>
        <h2>Continue to WordPress</h2>
        <p>
          If your storefront is WordPress, follow the dedicated install flow at{' '}
          <a href="/docs/wordpress-install-guide">/docs/wordpress-install-guide</a>.
        </p>
      </section>
    </DocsPageLayout>
  )
}
