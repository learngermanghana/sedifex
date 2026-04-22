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
        These Terms of Service ("Terms") govern your use of <strong>Sedifex — Inventory &amp; POS</strong>
        (the "App"), including the Sedifex web application available at <code>https://sedifex.com</code>
        and related services operated by <strong>Learn Language Education Academy</strong>.
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
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">2. What Sedifex provides</h2>
        <p>
          Sedifex — Inventory &amp; POS provides tools for point-of-sale workflows, inventory tracking,
          customer management, reporting, and connected integrations (including optional social or
          marketplace integrations where enabled).
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">3. Subscription, billing, and plan changes</h2>
        <ul>
          <li>Paid features are offered under subscription plans billed monthly or yearly in advance.</li>
          <li>Plans, limits, and prices may change as Sedifex scales; we will provide notice before material billing changes take effect.</li>
          <li>If payment fails, access to paid features may be limited until billing is resolved.</li>
          <li>Refund rules are described in our Subscription &amp; Refund Policy at <code>/refund</code>.</li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">4. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the App for unlawful, deceptive, or fraudulent activity.</li>
          <li>Upload malware or attempt to interfere with platform security.</li>
          <li>Scrape, reverse engineer, or abuse APIs beyond permitted use.</li>
          <li>Infringe intellectual property or privacy rights of others.</li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">5. Data protection and privacy</h2>
        <p>
          Your use of Sedifex — Inventory &amp; POS is also governed by our Privacy Policy at
          <code> /privacy</code>, which explains how we collect, use, and protect personal data.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">6. Third-party services</h2>
        <p>
          Some features depend on third-party services (for example, payment processors or social
          integration providers). Sedifex may offer a public-facing page for your business that can
          display your TikTok and YouTube content where you choose to connect those channels. Their
          services are subject to their own terms and policies.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">7. Service availability and changes</h2>
        <ul>
          <li>We may update, improve, or retire features to support reliability, safety, or scale.</li>
          <li>We aim for high availability but do not guarantee uninterrupted service at all times.</li>
          <li>Scheduled maintenance or incidents may temporarily affect access.</li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">8. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, Sedifex and Learn Language Education Academy are
          not liable for indirect, incidental, special, consequential, or punitive damages arising
          from use of the App.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">9. Termination</h2>
        <p>
          We may suspend or terminate access for material breach of these Terms, security risks, or
          legal requirements. You may stop using the App at any time and request account closure.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">10. Contact</h2>
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
