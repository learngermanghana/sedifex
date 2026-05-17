export default function RefundPage() {
  const today = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <main className="prose prose-slate mx-auto max-w-3xl px-4 py-12">
      <p className="text-sm font-semibold uppercase tracking-wide text-violet-600">
        Legal
      </p>

      <h1 className="mb-2 text-3xl font-bold text-slate-900">
        Subscription, Payment &amp; Refund Policy
      </h1>

      <p className="mb-8 text-sm text-slate-500">Last updated: {today}</p>

      <p className="text-sm text-slate-500">
        This Subscription, Payment &amp; Refund Policy explains how billing,
        renewals, Sedifex Market payments and refunds work for your use of{" "}
        <strong>Sedifex</strong>, the POS, inventory, booking, website
        integration and marketplace system operated by{" "}
        <strong>Learn Language Education Academy</strong>.
      </p>

      <p className="mt-4 rounded-md bg-slate-50 p-3 text-xs text-slate-500">
        This policy is intended as a clear explanation of how payments work for
        Sedifex. It may not cover every situation under local law in every
        country. If you need specific legal advice, please consult a qualified
        professional in your jurisdiction.
      </p>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">1. Service description</h2>

        <p>Sedifex provides:</p>

        <ul>
          <li>
            A POS and inventory management system for small businesses,
            schools, service providers, NGOs and similar organisations.
          </li>
          <li>
            Public product, service and store discovery through{" "}
            <code>www.sedifexmarket.com</code>.
          </li>
          <li>
            Website integrations that allow businesses to display products,
            services, bookings, upcoming events and registration forms from
            their Sedifex data.
          </li>
          <li>
            Optional online checkout through Sedifex Market or connected client
            websites, including payment confirmation, order records and merchant
            settlement where enabled.
          </li>
          <li>
            Reports, dashboards and automation tools to help merchants review
            sales, bookings, customers and performance.
          </li>
        </ul>

        <p>
          Sedifex may process online payments for marketplace or connected
          website checkouts through payment providers such as{" "}
          <strong>Paystack</strong>. Where merchant settlement is enabled,
          payment may be split between Sedifex service fees and the merchant's
          settlement account according to the checkout rules shown at the time of
          payment.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">
          2. Subscription plans and billing
        </h2>

        <ul>
          <li>
            Sedifex may be offered as a free workspace with limits, or with paid
            monthly, yearly or custom subscription plans.
          </li>
          <li>
            Paid subscription fees are charged <strong>in advance</strong> for
            each billing period.
          </li>
          <li>
            We currently process subscription payments using{" "}
            <strong>Paystack</strong> and may add other payment providers in the
            future.
          </li>
          <li>
            By providing your payment details, you authorise us and our payment
            provider to charge the subscription fee for each billing period.
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">3. Sedifex subscription refunds</h2>

        <p>
          Because Sedifex provides immediate access to digital services,
          dashboards, integrations and tools once payment is confirmed:
        </p>

        <ul>
          <li>
            <strong>All Sedifex subscription payments are generally non-refundable.</strong>
          </li>
          <li>
            We do not offer full or partial refunds if you stop using the
            service during a paid billing period.
          </li>
          <li>
            We do not refund payments if you forget to cancel before the renewal
            date.
          </li>
          <li>
            We do not refund payments because of changes in your business
            circumstances.
          </li>
        </ul>

        <p>
          Please choose your plan and billing period carefully before paying.
          If applicable law in your country gives you additional mandatory
          rights, we will comply with those legal requirements.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">
          4. Sedifex Market and connected website customer payments
        </h2>

        <p>
          Customers may pay for products, services, bookings, registrations or
          other merchant offerings through <code>www.sedifexmarket.com</code> or
          through a business website connected to Sedifex.
        </p>

        <ul>
          <li>
            Payment confirmation is handled through the payment provider and the
            related Sedifex order or booking record.
          </li>
          <li>
            Product fulfilment, service delivery, booking attendance and any
            customer-facing refund request are primarily the responsibility of
            the merchant selling the item or service.
          </li>
          <li>
            Sedifex may assist with order records, payment references, support
            information and technical checks, but Sedifex is not automatically
            responsible for refunding a merchant's customer unless required by
            law or by a specific written agreement.
          </li>
          <li>
            Transfer fees, service fees and payment-provider fees may be
            non-refundable once a payment has been processed.
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">5. Billing errors</h2>

        <p>
          While payments are non-refundable in normal situations, we will
          investigate:
        </p>

        <ul>
          <li>Duplicate payments for the same billing period or checkout.</li>
          <li>Obvious technical errors in charging your account.</li>
          <li>Confirmed payment-provider errors.</li>
        </ul>

        <p>
          If we confirm that a payment was taken in error, we will correct the
          issue. This may be through a refund, reversal or credit on your
          account, depending on the circumstances and the rules of the payment
          provider.
        </p>

        <p>
          If you believe there has been a billing or checkout error, please
          contact us as soon as possible at <strong>info@sedifex.com</strong>
          with:
        </p>

        <ul>
          <li>Your name and business name.</li>
          <li>The date and amount of the payment.</li>
          <li>
            Any Paystack reference, Sedifex order reference or screenshot that
            can help us locate the transaction.
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">6. Renewal and cancellation</h2>

        <ul>
          <li>
            Your subscription may renew automatically at the end of each billing
            period using the same payment method, unless you cancel in advance.
          </li>
          <li>
            You can request cancellation at any time by emailing{" "}
            <strong>info@sedifex.com</strong> or using any cancellation option
            provided inside the app.
          </li>
          <li>
            Cancelling stops <strong>future</strong> renewals only; it does not
            trigger a refund for the current billing period.
          </li>
          <li>
            After cancellation, you retain access to Sedifex until the end of
            the period you have already paid for. After that, your workspace may
            lose access to paid features.
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">
          7. Account closure and data deletion
        </h2>

        <p>
          If you want to completely close your account and request deletion of
          your data, you can email <strong>info@sedifex.com</strong>.
        </p>

        <ul>
          <li>
            We will delete or anonymise personal data and store data from our
            systems, except where we are required to keep some information for
            legal, tax, accounting, payment reconciliation or security reasons.
          </li>
          <li>
            Once your data is deleted, it may not be possible to recover any of
            your previous reports or records.
          </li>
        </ul>

        <p>
          For more information about how we handle your information, please see
          our <strong>Privacy Policy</strong> at <code>/privacy</code> and
          <strong> Terms of Service</strong> at <code>/terms</code>.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">8. Changes to this policy</h2>

        <p>
          We may update this Subscription, Payment &amp; Refund Policy from time
          to time. When we do, we will update the “Last updated” date at the top
          of this page and may provide an in-app or email notice for significant
          changes.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">9. Contact us</h2>

        <p>If you have any questions about this policy, please contact:</p>

        <ul>
          <li>
            <strong>Email:</strong> info@sedifex.com
          </li>
          <li>
            <strong>Address:</strong> Kwamisa street, Awoshie, Ghana
          </li>
          <li>
            <strong>Owner:</strong> Learn Language Education Academy
          </li>
        </ul>
      </section>
    </main>
  );
}
