import React from 'react'
import DocsPageLayout from '../../components/docs/DocsPageLayout'

export default function WordpressInstallGuidePage() {
  return (
    <DocsPageLayout
      title="WordPress Install Guide (Sedifex Sync)"
      subtitle="Connect your WordPress site to Sedifex product catalogs with a stable, cache-aware integration."
    >
      <section>
        <h2>What this setup does</h2>
        <ol>
          <li>Uses a Sedifex integration API key scoped to your store.</li>
          <li>Calls the <code>integrationProducts</code> endpoint.</li>
          <li>Renders products using a shortcode root.</li>
          <li>Applies dedupe, fallback, and cache controls for reliability.</li>
        </ol>
      </section>

      <section>
        <h2>Step-by-step setup</h2>
        <h3>1) Install plugin scaffold</h3>
        <p>Use Code Snippets or your custom plugin flow and optionally start from <code>docs/wordpress-plugin/sedifex-sync.php</code>.</p>

        <h3>2) Add Sedifex client script</h3>
        <ul>
          <li>Fetch <code>integrationProducts?storeId=&lt;storeId&gt;</code> with bearer auth.</li>
          <li>Deduplicate with key <code>id|storeId|name|price</code>.</li>
          <li>Fallback to static data on fetch failure.</li>
          <li>Group by category and render menu sections with optional item descriptions.</li>
        </ul>

        <h3>3) Register shortcode</h3>
        <pre>{`<div id="sedifex-products-root"></div>`}</pre>

        <h3>4) Configure settings</h3>
        <ul>
          <li><code>SEDIFEX_API_BASE_URL</code></li>
          <li><code>SEDIFEX_STORE_ID</code></li>
          <li><code>SEDIFEX_INTEGRATION_KEY</code></li>
        </ul>
      </section>

      <section>
        <h2>Validation checklist</h2>
        <ol>
          <li>Open a page that contains <code>[sedifex_products]</code>.</li>
          <li>Confirm category-based rendering, description visibility, and out-of-stock handling.</li>
          <li>Simulate endpoint failure and verify fallback products render.</li>
        </ol>
      </section>

      <section>
        <h2>Recommended hardening</h2>
        <ul>
          <li>Show “Last synced at” in UI.</li>
          <li>Alert on repeated sync failures.</li>
          <li>Rotate integration credentials periodically.</li>
        </ul>
      </section>
    </DocsPageLayout>
  )
}
