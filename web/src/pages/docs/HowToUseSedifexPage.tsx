import React from 'react'
import DocsPageLayout from '../../components/docs/DocsPageLayout'

export default function HowToUseSedifexPage() {
  return (
    <DocsPageLayout
      title="How to Use Sedifex"
      subtitle="Fast onboarding for Shop, Travel, NGO, and School workspaces."
    >
      <section>
        <h2>Start with the latest workspace navigation</h2>
        <p>
          Sedifex now uses module-based navigation. Owners can open <strong>Account → Navigation settings</strong>,
          choose a business type, then tick only the pages that should appear in the sidebar.
        </p>
        <ul>
          <li><strong>Daily work:</strong> Dashboard, Reports, Items, Sell, Marketplace Orders, Customers, and Bookings.</li>
          <li><strong>Documents, payments & expenses:</strong> Quick Pay, Invoices, Receipts, Expenses, Settlement, Donor management, and Funds ledger.</li>
          <li><strong>Bookings, registration & cases:</strong> Upcoming events, Student registration, Volunteers, and Support requests.</li>
          <li><strong>Website & marketing:</strong> Integrations, Website Builder, Blog, SMS, and Bulk email.</li>
        </ul>
      </section>

      <section>
        <h2>Pick your workspace type</h2>
        <ul>
          <li><strong>Retail / Shop:</strong> Items, Sell, Marketplace Orders, Quick Pay, Customers, Bookings, Website Builder, and Reports.</li>
          <li><strong>Travel:</strong> Trips, Travelers, Upcoming trips, Online Orders, Trip promos, Trip gallery, and Contact links.</li>
          <li><strong>NGO:</strong> Donors, Campaigns, Upcoming campaigns, Volunteers, Support requests, Campaign promo, Impact gallery, and Petty expenses.</li>
          <li><strong>School:</strong> Students, Classes, Upcoming classes, Student registration, Registrations & Orders, Admissions promo, and School gallery.</li>
        </ul>
      </section>

      <section>
        <h2>Core navigation by role</h2>
        <p>
          <strong>Owner</strong>: Dashboard, Reports, Items, Sell, Marketplace Orders, Quick Pay, invoices,
          receipts, expenses, customers or industry aliases, bookings, upcoming events, settlement,
          integrations, Blog, Website Builder, SMS, Bulk email, Donor management, Funds ledger, and Account.
        </p>
        <p>
          <strong>Staff</strong>: Reports, Sell, Marketplace Orders, Quick Pay, invoices, receipts, expenses,
          customers or industry aliases, bookings, upcoming events, Blog, Website Builder sections, Donor
          management, and Funds ledger where enabled.
        </p>
      </section>

      <section>
        <h2>Use Ask Sedifex</h2>
        <p>
          The floating <strong>Ask Sedifex</strong> launcher helps users search connected products, services,
          and courses, open the Items page from a result, prepare safe edits like price or description changes,
          and upload product images into the open Add/Edit Item form. Users still review and save changes manually.
        </p>
      </section>

      <section>
        <h2>Start here in 5 steps</h2>
        <ol>
          <li>Confirm workspace, billing, staff access, public profile, and navigation in <strong>Account</strong>.</li>
          <li>Load catalog records in <strong>Items</strong> and use <strong>Ask Sedifex</strong> for item search, edit prep, and image upload.</li>
          <li>Use <strong>Sell</strong>, <strong>Quick Pay</strong>, <strong>Invoices</strong>, <strong>Receipts</strong>, and <strong>Marketplace Orders</strong> for sales and payments.</li>
          <li>Use <strong>Bookings</strong>, <strong>Upcoming events</strong>, registrations, volunteers, or support requests for operational intake.</li>
          <li>Build the public site in <strong>Website Builder</strong> and connect APIs, checkout, gallery, Google Business, and email from <strong>Integrations</strong>.</li>
        </ol>
      </section>

      <section>
        <h2>Read the full guide</h2>
        <p>
          The complete Markdown guide is maintained at{' '}
          <a href="https://github.com/learngermanghana/sedifex/blob/main/docs/how-to-use-sedifex.md">
            docs/how-to-use-sedifex.md
          </a>.
        </p>
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
