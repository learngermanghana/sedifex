# Paystack card-testing remediation and request-hashing readiness (November 2026)

## Why
On November 3 Paystack Transaction Monitoring confirmed that, on September 30, around 1,000 Paystack transactions were initialized *directly with the exposed public key*, not via the Sedifex website. International card payments for integration 1455689 remain disabled. The Paystack public key is intentionally public; merely hiding it, adding CAPTCHA to a browser form, or changing that key **does not** stop direct initialization. Only Paystack enabling **request hashing** will prevent public-key-only initialization after they validate the updated integration.

## What this change does
- The main `integrationCheckoutCreate` Cloud Function already calculates Paystack amounts and calls the Initialize Transaction API with the server-side secret; it returns `accessCode` and `authorizationUrl`. Keep this as the only path for first-party Quick Pay.
- `/s/:storeId` Quick Pay now uses Paystack Inline V2 `resumeTransaction(accessCode)`, with server-authorized redirect fallback. It never initializes a transaction in the browser with an amount and public key.
- The legacy `payWithPaystack(amount, buyer)` helper now fails closed and V1 auto-loading is removed. Any legacy test payment must be converted to server initialization before being usable.
- The initialization endpoint has a durable Firestore 10-minute rate limit of 30 attempts per IP and 8 attempts per email, with SHA-256 hashes rather than plaintext identifiers.
- The endpoint verifies Cloudflare Turnstile server-side **if** `TURNSTILE_SECRET_KEY` is configured, returning HTTP 403 for absent/invalid tokens; failures to contact Turnstile also fail closed. First-party Quick Pay renders Turnstile using `VITE_TURNSTILE_SITE_KEY` and sends `turnstileToken`.
- The two hardcoded Paystack payment-page links in the workspace-blocked fallback UI were removed. The actual Paystack-hosted pages may still be active and must be deactivated separately in the Paystack dashboard.

## Rollout steps
1. Inspect all client websites, mobile apps, and integrations that call `integrationCheckoutCreate`. Server-side Turnstile verification applies to **every real request to this endpoint** once the secret is configured. Add challenge generation to all browser checkout clients before configuring the secret; provide a dedicated authenticated server-to-server flow for trusted integrations rather than bypassing challenges by a spoofable `sourceChannel`.
2. Create a Cloudflare Turnstile widget for the Sedifex checkout domain and any other website domains that will serve checkout challenges. Add the site key to Vercel as `VITE_TURNSTILE_SITE_KEY`. Configure the secret in Firebase Secret Manager with `firebase functions:secrets:set TURNSTILE_SECRET_KEY --project sedifex-web`; the Cloud Function binds it via `runWith({ secrets: [TURNSTILE_SECRET_KEY] })`. **Configure the site key, update other checkout clients, and set the secret together before deploying enforced protection.** Without the secret, Turnstile checks are intentionally inactive and only rate limiting applies.
3. Enable a Firestore TTL policy on collection `paystackCheckoutRateLimits` field `expiresAt` (Timestamp). This keeps historical IP/email hash buckets from accumulating.
4. Build and test: `cd functions && npm run build`; `cd web && npm run build && npm test -- src/utils/__tests__/paystack.test.ts`. Run the Firebase Emulator checkout tests, then test the sandbox and live checkout with a low-value authorized transaction.
5. Confirm there are no remaining direct calls to Paystack `setup` / `newTransaction` / Inline V1 and no Paystack public-key-only initialization in mobile apps or other deployed frontends. Verify all server initialization routes, including website and donation integrations.
6. Deactivate or replace old Paystack-hosted payment pages **in Paystack**, not only on Sedifex. Paystack says request hashing is incompatible with Paystack payment pages and Virtual Terminal QR codes. Confirm to Paystack whether any such flows or mobile apps are still used.
7. After deployment and end-to-end verification, reply to Paystack Transaction Monitoring that all relevant transactions initialize on the server, clients only resume access codes, and rate limiting/Turnstile are in place. Ask Paystack to enable **request hashing** and restore international cards. Do not claim the restriction is lifted until Paystack confirms.

## Important constraints
- Existing Sedifex non-card channels and cash payment handling should not be changed.
- Never expose Paystack secret keys or Turnstile secret keys in browser bundles, documentation, or GitHub.
- Don't trust client-side success URLs as payment confirmation; use verified Paystack webhooks or server verification matching order amount and currency before fulfillment.
- Firestore rate limiting adds a small read/write cost per checkout and is not a complete denial-of-service solution. Edge rate limiting / WAF can further reduce billable function calls.
- If the Turnstile site key is enabled but the Firebase secret is not, the browser challenge is a UX gate only, **not effective server-side bot protection**.
