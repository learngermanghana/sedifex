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
          <li>Companion endpoints for promotions, promo galleries, customers, top sellers, and Google Merchant XML feed: <code>GET /integrationPromo?storeId=&lt;storeId&gt;</code>, <code>GET /integrationGallery?storeId=&lt;storeId&gt;</code>, <code>GET /integrationCustomers?storeId=&lt;storeId&gt;</code>, <code>GET /integrationTopSelling?storeId=&lt;storeId&gt;&amp;days=30&amp;limit=10</code>, and <code>GET /integrationGoogleMerchantFeed?slug=&lt;promoSlug&gt;</code>.</li>
          <li>Booking endpoints for service businesses: <code>GET /v1IntegrationBookings?storeId=&lt;storeId&gt;</code> and <code>POST /v1IntegrationBookings?storeId=&lt;storeId&gt;</code>.</li>
          <li>Google Sheets sync workflow for bookings/customers via Google Apps Script pull jobs (see docs page for script template).</li>
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
        <h2>Top-selling products integration</h2>
        <ul>
          <li>Use <code>integrationTopSelling</code> when you want "Best Sellers" on your site.</li>
          <li>Optional query params: <code>days</code> (1-365, default 30) and <code>limit</code> (1-50, default 10).</li>
          <li>The payload returns <code>qtySold</code>, <code>grossSales</code>, and <code>lastSoldAt</code> for each top product.</li>
        </ul>
      </section>

      <section>
        <h2>Booking field standardization (recommended)</h2>
        <p>
          To avoid sync errors across WordPress forms, page builders, and custom sites, map all incoming booking payloads
          to canonical Sedifex field keys before sending them.
        </p>
        <ul>
          <li><code>branchLocationId</code>: internal branch selector id (for multi-branch stores).</li>
          <li><code>branchLocationName</code>: branch label shown to users (for reporting and sheet output).</li>
          <li><code>eventLocation</code>: where an event takes place.</li>
          <li><code>customerStayLocation</code>: where the customer is currently staying.</li>
          <li><code>paymentMethod</code>: payment channel used (cash/card/transfer/etc.).</li>
          <li><code>paymentAmount</code>: amount paid or to charge for the booking.</li>
        </ul>
        <p>
          You can configure aliases for these keys in <strong>Settings → Integrations → Booking Mapping</strong>, so
          labels like <code>venue</code>, <code>event_venue</code>, or <code>hotelLocation</code> still resolve to the
          same canonical values.
        </p>
      </section>

      <section>
        <h2>Next.js cache guidance</h2>
        <ul>
          <li><strong>30–120s</strong> revalidate window for frequent stock/price/promo/gallery changes.</li>
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
        <p>
          For email campaigns with store-owned Google Sheets + Apps Script, use{' '}
          <a href="/docs/bulk-email-google-sheets-guide">/docs/bulk-email-google-sheets-guide</a>.
        </p>
      </section>
    </DocsPageLayout>
  )
}
