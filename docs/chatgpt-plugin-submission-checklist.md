# Sedifex Business ChatGPT plugin — submission checklist

The plugin is **not ready for public submission**. The current private pilot implements only `list_services` and `create_service`; creating a service leaves it unpublished.

## Existing Sedifex website pages

The React app already registers these routes in `web/src/main.tsx`:

- Privacy policy: `https://sedifex.com/privacy` (also `/legal/privacy`)
- Terms of service: `https://sedifex.com/terms` (also `/legal/terms`)

**Verify that both return a publicly readable page on the deployed production domain before putting them into plugin metadata.** The source routes alone do not prove the deployment serves them.

The prior plugin submission showed the support URL `https://blog.sedifex.com/contact/`. Check that this support page actually serves Sedifex business customers; update it if necessary.

## Metadata and package

- Name: Sedifex Business
- Subtitle: Manage Sedifex services
- Website: `https://sedifex.com`
- Privacy URL: `https://sedifex.com/privacy` after live verification
- Terms URL: `https://sedifex.com/terms` after live verification
- Support URL: a verified Sedifex support page
- Icon: use the exact icon metadata field and asset path required by the current OpenAI plugin package schema; verify the icon appears in the submission UI. Having a PNG inside the ZIP is insufficient if the validator cannot resolve it.
- Add review information including a safe test merchant account and instructions without sharing real customer credentials.
- Upload a new package and wait for all skill and metadata findings to finish.

## OAuth and MCP — separate release blockers

- MCP URL: `https://sedifex.com/api/chatgpt-mcp` only when the production endpoint is confirmed reachable.
- The OAuth issuer, resource, JWKS, client ID, and redirect URI must be mutually consistent **for the same deployment environment**. Do not mix Preview-only signing keys with the production MCP URL.
- Confirm `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server` are publicly reachable.
- Verify authorization-code + PKCE, redirect URI exact matching, consent, audience, scopes, token expiration, revocation and replay prevention.
- Keep `SEDIFEX_OAUTH_PRIVATE_KEY` in Vercel secrets only; never commit or put it in a ZIP.
- Limit test access using `SEDIFEX_MCP_TEST_UIDS` and verify merchant ownership/cross-tenant isolation.
- Test both tools with a test merchant; require explicit confirmation for `create_service`.
- Inspect Vercel deployment status and runtime logs; a successful build is not proof the deployment is Ready.

Do not submit for review until the live endpoints, package validation, security checks and test merchant flow all pass.
