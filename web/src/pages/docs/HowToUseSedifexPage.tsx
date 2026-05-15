import React from 'react'
import DocsPageLayout from '../../components/docs/DocsPageLayout'

export default function HowToUseSedifexPage() {
  return (
    <DocsPageLayout
      title="How to Use Sedifex"
      subtitle="Fast onboarding for Shop, Travel, NGO, and School workspaces."
    >
      <section>
        <h2>Pick your workspace type</h2>
        <ul>
          <li><strong>Shop:</strong> Items, Sell, Customers, Donor management, Public page.</li>
          <li><strong>Travel:</strong> Trips, Travelers, messaging, and business records.</li>
          <li><strong>NGO:</strong> Donors, campaigns, communication, and records.</li>
          <li><strong>School:</strong> Classes, students, communication, and records.</li>
        </ul>
      </section>

      <section>
        <h2>Core navigation by role</h2>
        <p><strong>Owner</strong>: Dashboard, Items/Sell, Customers or industry aliases, Bookings/Trips/Classes, Blog, SMS, Bulk email, Donor management, Public page, Account.</p>
        <p><strong>Staff</strong>: Sell, Customers (or alias), Bookings (or alias), Blog, Donor management.</p>
      </section>

      <section>
        <h2>Start here in 3 steps</h2>
        <ol>
          <li>Confirm workspace in <strong>Account</strong> and verify contract/billing.</li>
          <li>Load catalog in <strong>Items</strong> and test checkout in <strong>Sell</strong>.</li>
          <li>Use <strong>Customers</strong> and <strong>Bookings</strong> (or aliases) for daily operations.</li>
        </ol>
      </section>

      <section>
        <h2>Related setup docs</h2>
        <ul>
          <li><a href="/docs/integration-quickstart">/docs/integration-quickstart</a></li>
          <li><a href="/docs/wordpress-install-guide">/docs/wordpress-install-guide</a></li>
          <li><a href="/docs/bulk-email-google-sheets-guide">/docs/bulk-email-google-sheets-guide</a></li>
          <li><a href="/docs/donor-website-integration">/docs/donor-website-integration</a></li>
        </ul>
      </section>
    </DocsPageLayout>
  )
}
