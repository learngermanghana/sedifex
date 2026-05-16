import './LegalPage.css'

export default function TermsPage() {
  const today = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  return (
    <main className="legal-page">
      <article className="legal-page__content prose prose-slate mx-auto max-w-3xl px-4 py-12">
        <p className="text-sm font-semibold uppercase tracking-wide text-violet-600">Legal</p>

        <h1 className="mb-2 text-3xl font-bold text-slate-900">Terms of Service</h1>

        <p className="mb-8 text-sm text-slate-500">Last updated: {today}</p>

        <p className="text-sm text-slate-500">
          These Terms of Service (&quot;Terms&quot;) govern your use of <strong>Sedifex — Inventory &amp; POS</strong>,
          Sedifex Market, Sedifex checkout links, public store pages, website integrations, and related services
          operated by <strong>Learn Language Education Academy</strong>.
        </p>

        <p className="mt-4 rounded-md bg-slate-50 p-3 text-xs text-slate-500">
          This document is provided for general information and does not constitute legal advice.
          If your business has specific compliance requirements, consult a qualified legal adviser.
        </p>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">1. Eligibility and account responsibilities</h2>
          <ul>
            <li>You must be legally able to enter a binding agreement in your jurisdiction.</li>
            <li>You are responsible for keeping your login credentials secure.</li>
            <li>You agree not to share accounts in ways that bypass role and permission controls.</li>
            <li>You are responsible for all activity that happens under your workspace.</li>
            <li>You must provide accurate business, contact, product, service, payment, and delivery information.</li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">2. What Sedifex provides</h2>
          <p>
            Sedifex provides tools for point-of-sale workflows, inventory tracking, customer management,
            service bookings, public catalog pages, website integrations, reporting, checkout/payment links,
            Sedifex Market listings, and related merchant tools.
          </p>
          <p>
            Sedifex may make your published products, services, promotions, public pages, and approved store
            information available through Sedifex Market or connected integration channels where enabled.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">3. Merchant responsibility for products, services, and fulfilment</h2>
          <ul>
            <li>You are responsible for product accuracy, service descriptions, prices, stock availability, taxes, delivery promises, and customer communication.</li>
            <li>You must not list illegal, unsafe, counterfeit, restricted, misleading, or prohibited products or services.</li>
            <li>You are responsible for fulfilling customer orders, service bookings, pay-on-delivery orders, and after-sales support unless Sedifex expressly agrees otherwise in writing.</li>
            <li>If a customer contacts Sedifex about an order, Sedifex may contact you, review order records, or temporarily limit a listing to protect customers and platform trust.</li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">4. Subscription, billing, and plan changes</h2>
          <ul>
            <li>Paid features may be offered under subscription plans billed monthly or yearly in advance.</li>
            <li>Some features may be available on a free or limited plan with usage limits, upload limits, or feature restrictions.</li>
            <li>Plans, limits, and prices may change as Sedifex scales; we will provide notice before material billing changes take effect.</li>
            <li>If payment fails, access to paid features may be limited until billing is resolved.</li>
            <li>Refund rules are described in our Subscription &amp; Refund Policy at <code>/refund</code>.</li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">5. Checkout, payment processing, and Sedifex commission</h2>
          <p>
            Sedifex may support online payment collection for product orders, service bookings, public pages,
            client websites, and Sedifex Market transactions. Online payments may be processed by third-party
            providers such as Paystack or other payment partners.
          </p>
          <ul>
            <li>Sedifex is not a bank or payment processor. Payment providers may apply their own processing fees, settlement timelines, chargeback rules, and verification checks.</li>
            <li>Sedifex may charge a platform commission, service fee, convenience fee, or payment facilitation fee on transactions processed through Sedifex checkout or Sedifex Market.</li>
            <li>Fees may be charged to the customer, deducted from merchant settlement, added to checkout totals, or handled according to the active fee policy shown or configured for that transaction.</li>
            <li>Where a checkout page or dashboard shows fees, totals, net amounts, or commission estimates, those values are part of the transaction terms for that checkout.</li>
            <li>Sedifex may update commission rates, processing-fee recovery rules, or marketplace fee policies with notice. Continued use of Sedifex checkout after notice means you accept the updated fee policy.</li>
            <li>Payment confirmation is based on Sedifex and payment-provider verification, not only on a customer returning from a payment page.</li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">6. Pay on delivery and manual payment</h2>
          <p>
            Sedifex may allow customers to place pay-on-delivery or manual-payment orders where the store collects
            payment directly from the customer. During launch, Sedifex may make pay-on-delivery available without a
            Sedifex commission under a free-launch policy.
          </p>
          <ul>
            <li>Pay-on-delivery transactions may be marked as free launch, for example under <code>sedifex_free_pay_on_delivery_v1</code>.</li>
            <li>For pay-on-delivery, the merchant is responsible for collection, delivery confirmation, customer support, and any cash/mobile-money reconciliation outside Sedifex.</li>
            <li>Sedifex may later introduce a commission, subscription requirement, delivery fee, verification fee, or other rule for pay-on-delivery or manual-payment transactions after notice.</li>
            <li>Sedifex may restrict pay-on-delivery if there is suspected abuse, repeated failed deliveries, customer complaints, or inaccurate listings.</li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">7. Sedifex Market and website integrations</h2>
          <ul>
            <li>Product orders from Sedifex Market or connected websites may be saved as <code>integrationOrders</code>.</li>
            <li>Service bookings, appointments, registrations, or classes may be saved as <code>integrationBookings</code>.</li>
            <li>Lead-only enquiries may be saved as <code>checkoutRequests</code>.</li>
            <li>Webhook and payment event logs may be stored for auditing and troubleshooting.</li>
            <li>Website integrations must keep Sedifex API keys server-side and must not expose private integration keys in the browser.</li>
            <li>Stores are responsible for any content, products, prices, services, and promises displayed on their own websites even when powered by Sedifex data.</li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">8. Refunds, cancellations, disputes, and chargebacks</h2>
          <ul>
            <li>Stores are responsible for their own customer refund, return, cancellation, exchange, and service-completion policies unless Sedifex states otherwise.</li>
            <li>Sedifex may assist with payment verification, transaction records, or dispute evidence where checkout was processed through Sedifex.</li>
            <li>Payment processing fees, platform fees, and commission may be non-refundable unless required by law, required by the payment provider, or expressly approved by Sedifex.</li>
            <li>If a chargeback, fraud claim, duplicate payment, or dispute occurs, Sedifex may hold, reverse, deduct, or delay settlement where permitted by payment-provider rules and applicable law.</li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">9. Product comments, reviews, and engagement</h2>
          <p>
            Sedifex may support product comments, favorites, reactions, and other engagement features across
            Sedifex Market and connected websites.
          </p>
          <ul>
            <li>Approved public comments may be shown across Sedifex Market and websites connected to the same product.</li>
            <li>Sedifex and stores may moderate, hide, reject, or remove comments that are abusive, fraudulent, irrelevant, unsafe, unlawful, or misleading.</li>
            <li>You must not manipulate reviews, post fake engagement, or encourage deceptive comments.</li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">10. Acceptable use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Use Sedifex for unlawful, deceptive, fraudulent, abusive, or harmful activity.</li>
            <li>Upload malware or attempt to interfere with platform security.</li>
            <li>Scrape, reverse engineer, overload, or abuse APIs beyond permitted use.</li>
            <li>Infringe intellectual property, privacy, consumer-protection, tax, or data-protection rights of others.</li>
            <li>Misrepresent stock availability, delivery timelines, service capability, price, discounts, or payment terms.</li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">11. Data protection and privacy</h2>
          <p>
            Your use of Sedifex is also governed by our Privacy Policy at <code>/privacy</code>, which explains
            how we collect, use, and protect personal data. You are responsible for collecting, processing,
            and using customer data lawfully in your own business.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">12. Third-party services</h2>
          <p>
            Some features depend on third-party services, including payment processors, Google, TikTok,
            LinkedIn, email providers, SMS providers, hosting providers, analytics tools, or social platforms.
            Their services are subject to their own terms, fees, availability, policies, and technical limits.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">13. Service availability and changes</h2>
          <ul>
            <li>We may update, improve, limit, or retire features to support reliability, safety, compliance, or scale.</li>
            <li>We aim for high availability but do not guarantee uninterrupted service at all times.</li>
            <li>Scheduled maintenance, third-party outages, network issues, or incidents may temporarily affect access.</li>
            <li>We may adjust marketplace, checkout, engagement, and integration features as we learn from real merchant and customer usage.</li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">14. Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, Sedifex and Learn Language Education Academy are not liable
            for indirect, incidental, special, consequential, or punitive damages arising from use of Sedifex,
            including lost profits, failed deliveries, disputes between merchants and customers, third-party
            payment delays, or integration downtime.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">15. Termination or suspension</h2>
          <p>
            We may suspend or terminate access for material breach of these Terms, security risks, suspected
            fraud, payment disputes, illegal listings, customer harm, repeated complaints, or legal requirements.
            You may stop using Sedifex at any time and request account closure.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">16. Updates to these Terms</h2>
          <p>
            We may update these Terms as Sedifex grows, including changes related to marketplace fees,
            commission, checkout, delivery, subscriptions, integrations, or compliance. We will update this page
            and may provide additional notice for material changes. Continued use of Sedifex after changes take
            effect means you accept the updated Terms.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">17. Contact</h2>
          <ul>
            <li>
              <strong>Email:</strong> <a href="mailto:info@sedifex.com">info@sedifex.com</a>
            </li>
            <li>
              <strong>Product name:</strong> Sedifex — Inventory &amp; POS
            </li>
            <li>
              <strong>Operator:</strong> Learn Language Education Academy
            </li>
          </ul>
        </section>
      </article>
    </main>
  )
}
