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
