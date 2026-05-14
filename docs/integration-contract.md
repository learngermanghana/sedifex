# Sedifex Canonical Integration Contract

This is the authoritative integration contract for all Sedifex partner-facing endpoints and webhooks.

All integration documentation must link to this page and must not redefine contract semantics independently.

## Mandatory versioning policy

- **Current contract version:** `2026-04-13`
- **Required request header (all integration API requests):** `X-Sedifex-Contract-Version: 2026-04-13`
- **Response headers:**
  - `x-sedifex-contract-version`
  - `x-sedifex-request-id`

### Enforcement

- Missing or mismatched contract header returns `400` with:

```json
{
  "error": "contract-version-mismatch",
  "expectedVersion": "2026-04-13",
  "receivedVersion": "<sent_version_or_empty>"
}
```

- Integration clients must fail fast on contract mismatch and raise a visible operator error.

## URL/versioning rules (mandatory)

- **Do not use path-based versioning for integration contract dates** (for example, never append `/2026-04-13` to the base URL).
- Keep contract versioning in the `X-Sedifex-Contract-Version` header only.
- Base URL remains deployment/environment specific (for example, `https://us-central1-sedifex-web.cloudfunctions.net`).

## Required operational behavior for partners

- Send `x-api-key` and `X-Sedifex-Contract-Version` on every authenticated integration request.
- Log `x-sedifex-request-id` for support/debugging correlation.
- Treat contract-version mismatch as a deployment/configuration incident and escalate immediately.

## Required behavior for Sedifex-owned docs

Every integration doc (quickstarts, plugin guides, webhook docs, and plans) must:

1. Link to this canonical contract page.
2. State that header-based contract versioning is mandatory.
3. Avoid introducing alternative versioning guidance.
