# NGO website integration readiness

NGO workspaces include volunteers, support requests, donors, funds, reports, blog and website integrations in the default navigation. Existing saved navigation remains configurable in account settings.

## Public application forms

POST JSON to the deployed volunteerIntake or supportRequestIntake Firebase endpoint.
Send storeId, name, email or phone, and consent: true after the applicant checks a clearly labelled follow-up consent checkbox. Support requests also require supportType.
Volunteer fields: skill, availability, preferredProject, location, notes.
Support fields: needSummary, householdSize, urgency, location, notes.
The website, company and url fields are honeypots and must be empty.
Handle 400 validation failures and 429 submission limits in the public form.
Consent is for application follow-up, not marketing.

## Donations

Use /api/donor-portal-sync for donation intent and checkout.
POST storeId and reference to /api/donations-payment-confirmation after returning from checkout.
Caller-supplied payment status is never authoritative. Both confirmation and webhook paths verify reference, amount, currency and workspace with Paystack.
Only settled donations enter available balances. Manual historical entries without payment status remain included.
Verified confirmation updates donor lifetime giving and creates one deterministic receipt queue job.
Receipt dispatch generates deterministic receipt/communication records; it does not itself deliver email or generate a downloadable PDF. Branded donation notifications use the existing Firebase notification flow.

## Launch checklist

- Configure and test the Paystack webhook and credentials in the actual deployment.
- Confirm merchant settlement routing before accepting GHACOE donations.
- Review existing notification recipients: older versions may already have saved Sedifex internal addresses. This release stops adding them but preserves explicitly saved recipient lists.
- Audit historic donor totals; earlier pending intents may have inflated lifetimeGiving. No historic financial records are rewritten automatically.
- Add consent checkboxes to any existing external application forms before rollout.
- Enable added modules for workspaces with an older saved navigation preset.
- Build GHACOE's approved About, leadership, programmes and contact content, and connect public blog/gallery/events.
- Run full browser-to-dashboard and payment tests with the actual GHACOE workspace before launch.

Campaigns currently reuse booking records. Beneficiary outcomes, fundraising targets and a dedicated programme application workflow remain future extensions.
