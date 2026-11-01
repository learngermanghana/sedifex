# ChatGPT integration — initial service creation backend

This branch introduces `POST /api/chatgpt-create-service`, an **experimental** merchant-owner-only service creation endpoint. It is not yet a publicly installable ChatGPT app.

## Request
Authenticate with a valid **Firebase ID token** for the Sedifex merchant owner, then POST:
```json
{"storeId":"<store-id>","name":"Home Cleaning","description":"Standard cleaning","price":300,"currency":"GHS","durationMinutes":120}
```
The server verifies the token, checks the store owner UID, validates input and creates a document in the canonical top-level `products` collection, initially unpublished and hidden from the website. It rejects other store users. No website integration API keys are accepted.

## Required before ChatGPT release
1. Implement OAuth 2.1 account linking with PKCE, authorization-code exchange, refresh/revocation and audience/scope validation. Do not expose Firebase ID tokens to ChatGPT or use a global integration API key for merchant writes.
2. Add an MCP server exposing `create_service` with merchant-scoped OAuth tokens and explicit user confirmation for writes.
3. Verify the canonical service schema and dashboard/catalog visibility against a test store. Existing catalog integrations may use multiple collections; do not assume this endpoint is sufficient to publish a bookable service.
4. Add automated tests for cross-tenant denial, revoked tokens, malformed inputs, duplicate requests, role checks and service visibility. Add rate limiting and idempotency before enabling external traffic.
5. Verify production deployment environment and publish the ChatGPT app only after security review.

This work does **not** change the canonical website integration contract; see [integration-contract.md](./integration-contract.md).


## MCP adapter (development only)

The new `POST /api/chatgpt-mcp` exposes `list_services` and `create_service` via JSON-RPC, with JWT validation using `jose`. The protected-resource metadata is at `/.well-known/oauth-protected-resource`.

Configure these deployment environment variables before testing:

- `SEDIFEX_MCP_RESOURCE_URL`: exact HTTPS URL of the MCP endpoint (e.g. `https://your-domain.example/api/chatgpt-mcp`)
- `SEDIFEX_MCP_OAUTH_ISSUER`: trusted OAuth issuer URL
- `SEDIFEX_MCP_JWKS_URL`: trusted HTTPS JWKS endpoint for that issuer

The issuer must implement OAuth 2.1 authorization-code + PKCE, consent, refresh/revocation and metadata discovery. **Its token `sub` must equal the Sedifex Firebase UID** and the token `aud` must equal the MCP resource URL. Do not configure an unrelated provider whose subject is a different identifier.

**Release blockers:** update `web/package-lock.json` after installing the added `jose` dependency, run TypeScript build and integration tests, add rate limiting and test idempotency, validate ChatGPT OAuth metadata and write-action confirmation, and verify end-to-end with a test merchant. This PR must remain unmerged until those steps pass.

## Retry safety

The MCP `create_service` tool requires a `requestId` (8–100 letters, digits, underscores or hyphens). The caller must reuse the same ID when retrying the same creation. A Firestore transaction writes the service and its deduplication record atomically. This prevents duplicate creation from concurrent retries. The request ID is scoped to the authenticated merchant UID. Verify payload consistency for reused IDs before production.
