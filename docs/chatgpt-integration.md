# Sedifex in ChatGPT

The private-pilot MCP endpoint is `POST /api/chatgpt-mcp`, routed through the existing consolidated Vercel function. This implementation adds customer booking and merchant blog workflows; it does not make the app publicly installable or configure deployment secrets.

## Tools

| Tool | Access | Behavior |
| --- | --- | --- |
| `search_services` | Public | Search published `publicListings` service entries; follow `nextCursor` to search further pages. |
| `get_availability` | Public | Read future public slots for an explicitly published service in an active, verified marketplace store. Returns slot price, currency, timezone and schedule; follow `nextCursor`. |
| `list_stores` | `stores:read` | Discover the connected merchant's store IDs. |
| `list_services` | `services:read` | Read the merchant's services, including unpublished services. |
| `create_service` | `services:write` | Create an unpublished service in `products`. |
| `create_booking` | `bookings:write` | Reserve slot capacity and create a pending appointment for the connected customer. |
| `list_my_bookings` | `bookings:read` | Read this customer’s ChatGPT bookings in the specified store, with cursor pagination. |
| `request_booking_change` | `bookings:write` | Submit cancellation/rescheduling for merchant approval through the existing `customerPortalRequest` workflow. |
| `list_blog_posts` | `blog:read` | List merchant posts, with cursor pagination. |
| `get_blog_post` | `blog:read` | Read a post and its revision. |
| `create_blog_draft` | `blog:write` | Save supplied article text as a draft in the existing Blog page. |
| `update_blog_draft` | `blog:write` | Edit a draft using the last read revision; reject concurrent edits. |
| `publish_blog_post` | `blog:write` | Publish a draft using the last read revision and explicit user confirmation. |

Merchant tools verify current ownership. Customer tools bind booking access through server-only identity records to the OAuth subject, never a supplied email or phone. The customer can only view/change bookings they created through ChatGPT. Do not enroll a merchant account as a substitute for the customer's identity.

## Booking flow

1. Search the public catalog and select a returned `listingId` and `storeId`.
2. Call `get_availability`. No slots means there is no time the connector can book. Time/date-TBA events and appointments without availability slots are not supported in this release.
3. Show the selected service, quantity, unit/total price, currency, start/end time, timezone, customer details and **pending business approval**. Obtain user approval.
4. Call `create_booking` with `confirmed: true`, the selected slot, contact details, stable `requestId`, and `expectedUnitPrice`, `expectedCurrency`, `expectedStartAt`, `expectedEndAt`, `expectedTimezone` exactly as returned by availability. If price or time changed, read again and obtain fresh approval with a new request ID.
5. Return the booking reference and pending approval status. Do not say it is confirmed or paid. This version does not collect payments or initialize checkout.

The transaction reads current service publication, store eligibility, slot visibility/status/time/capacity, then writes the customer record, store booking, root booking mirror, slot counter and retry record atomically. Retries with the same inputs return the original result. Reusing a request ID with different inputs fails. Capacity zero retains the existing integration convention of unlimited capacity. Existing booking/notification triggers continue to see normal integration booking documents.

Cancellation/rescheduling creates a pending request on both booking copies without releasing capacity or changing the appointment immediately. The business reviews it in the existing Booking editor. Approval uses the existing customer portal review handler to release old slot capacity. A reschedule asks for a preferred date/time in the booking timezone; it does not reserve a replacement slot. The business must verify that time before approval.

## Blog flow

Use `list_stores` to choose the merchant store. ChatGPT composes article text and sends it to `create_blog_draft`; no extra AI API key or background generation is required. The post is visible in Sedifex's existing Blog page and remains a draft. Use `get_blog_post` before editing or publishing, passing its opaque `revision` as `expectedRevision`. Revisions include Firestore nanoseconds. Published posts cannot be silently overwritten by the connector. Publishing requires the user to review the article and explicitly approve it.

## Account linking

The existing Sedifex/Firebase email-password login remains on `/chatgpt/connect`. Credentials never pass through ChatGPT. Consent displays the exact requested scopes. The issuer supports one-time authorization codes with PKCE S256, 15-minute access tokens, rotating refresh tokens, and a maximum 30-day session. Session revocation invalidates existing access tokens on their next tool call. Disabled Firebase users and Firebase session revocation are checked as well.

Set these deployment variables (keep their actual values in deployment configuration):

- `SEDIFEX_OAUTH_ISSUER`: HTTPS origin hosting the local issuer, e.g. `https://sedifex.com`.
- `SEDIFEX_OAUTH_CLIENT_ID`: the registered public OAuth client ID.
- `SEDIFEX_OAUTH_REDIRECT_URI`: the exact callback shown by the ChatGPT connection screen, including any existing query parameters.
- `SEDIFEX_OAUTH_PRIVATE_KEY`: RSA signing key in PEM form.
- `SEDIFEX_OAUTH_KEY_ID`: signing key identifier.
- `SEDIFEX_MCP_RESOURCE_URL`: exact endpoint URL, e.g. `https://sedifex.com/api/chatgpt-mcp`.
- `SEDIFEX_MCP_OAUTH_ISSUER`: the same issuer for the built-in OAuth implementation.
- `SEDIFEX_MCP_JWKS_URL`: e.g. `https://sedifex.com/api/chatgpt-oauth-jwks`.
- `SEDIFEX_MCP_TEST_UIDS`: deliberately enrolled merchant and customer **Firebase UIDs**, comma separated. Empty means all authenticated tools are denied. Public catalog tools remain readable.
- Existing Firebase Admin service-account configuration is also required.

Discovery endpoints: `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource`. Refresh at `POST /api/chatgpt-oauth-token` with `grant_type=refresh_token`, `client_id`, and `refresh_token`. Revoke the current refresh token at `POST /api/chatgpt-oauth-revoke` with `client_id` and `token` (form encoded or JSON). Reconnect existing pilot accounts after deployment to establish a session and consent to new scopes. Previously issued sessionless access tokens are rejected by the built-in issuer path.

Private tools share a persisted limit of 60 requests per account per minute. Configure edge rate limiting for public catalog tools before a public launch. Configure Firestore TTL cleanup for `chatgpt_rate_limits.expiresAt`; other OAuth and retry collections should have a deliberate retention policy before public release. Retry records must survive for as long as their retry guarantee is needed. Existing legacy Firebase-token service endpoints are unchanged and are not OAuth endpoints.

## Verification and release

```sh
cd web
npm ci
npm run test:chatgpt
npm run typecheck:chatgpt
npm run build
# From the repository root, with Java 21 and firebase-tools installed:
firebase emulators:exec --config firebase.event-planning-ci.json --only firestore,auth --project sedifex-ci "cd web && RUN_CHATGPT_EMULATOR_TESTS=1 npm exec vitest run tests/chatgpt-access.rules.emulator.test.ts"
```

The focused suite checks real JWT signatures, PKCE, single-use codes, refresh rotation, revocation, scope and pilot restrictions, disabled accounts, customer isolation, cross-store denial, capacity races, retry safety, stale price confirmation and blog revisions. The in-memory transaction test double enforces read-before-write and rollback; it is not a Firestore emulator or live deployment test.

**Deploy the updated Firestore rules before enabling the new connector.** They block all client access to `chatgpt_*` records, scope root/store bookings and blog posts to store members, and prevent client reassignment of ChatGPT booking ownership.

Before public release, test the deployed OAuth connection with one enrolled merchant and a distinct customer, verify domain ownership, scan all tools, book a real test slot, review its change request in the merchant dashboard, and check draft/publish behavior on the public blog. Confirm deployment is READY and the consolidated function remains within the hosting plan's function count. This change adds a route to the existing function, not another serverless function. Public app review/submission, open customer enrollment, payment checkout and deployment configuration are separate release steps.
