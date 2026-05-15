import React from 'react'
import DocsPageLayout from '../../components/docs/DocsPageLayout'

export default function DonorWebsiteIntegrationPage() {
  return (
    <DocsPageLayout
      title="Donor Website Integration"
      subtitle="How to name your public donation page and sync donor data into Sedifex."
    >
      <section>
        <h2>Recommended website page name</h2>
        <p>
          Use a clear page slug such as <code>/donate</code> (recommended), <code>/give</code>, or
          <code> /support-us</code>. The page name is your website choice; Sedifex integration is driven by the API endpoint.
        </p>
      </section>

      <section>
        <h2>Endpoint to call from your website</h2>
        <p>Submit donor data with a <code>POST</code> request to:</p>
        <pre><code>/api/donor-portal-sync</code></pre>
        <p>Minimum JSON payload:</p>
        <pre><code>{`{
  "storeId": "your_store_id",
  "donor": {
    "name": "Jane Doe",
    "email": "jane@example.com"
  }
}`}</code></pre>
        <p>
          You can also send <code>donor.phone</code>. At least one contact field (email or phone) is required.
        </p>
      </section>

      <section>
        <h2>Accepting payment from the same page</h2>
        <p>
          Include <code>initializePayment: true</code> plus <code>amount</code> to create a pending donation and request a Paystack checkout URL.
        </p>
        <pre><code>{`{
  "storeId": "your_store_id",
  "donor": {
    "name": "Jane Doe",
    "email": "jane@example.com"
  },
  "amount": 150,
  "currency": "GHS",
  "initializePayment": true
}`}</code></pre>
        <p>
          If Paystack is configured, the API response includes <code>payment.authorizationUrl</code>; redirect the donor there to complete payment.
        </p>
      </section>

      <section>
        <h2>What syncs into Sedifex</h2>
        <ul>
          <li>A donor profile is created in <strong>Donor management</strong>.</li>
          <li>When payment is requested, a donation transaction is stored in <code>fund_transactions</code>.</li>
          <li>You can continue confirmation/communications flows using existing donation APIs.</li>
        </ul>
      </section>
    </DocsPageLayout>
  )
}
