# Sedifex ChatGPT integration: Hobby deployment & OAuth readiness

The Sedifex web app is hosted on Vercel Hobby, which allows no more than **12 serverless functions per deployment**. The first production deployment with individual ChatGPT endpoints failed with `exceeded_serverless_functions_per_deployment` (deployment `dpl_ACF1tUWsHwXLdLEe5xe7Uicma6zf`). This change uses a **single** `web/api/chatgpt.ts` serverless function and rewrites the eight original paths and OAuth discovery endpoints to that entry point. Legacy endpoint URL contracts remain unchanged.

## Deployment check

- Verify total deployed functions are **at most 12** (10 existing unrelated functions + 1 consolidated ChatGPT entry point, assuming Vercel ignores helper and test files).
- Verify Production is **READY** rather than just a successful build.
- Verify `GET /.well-known/oauth-protected-resource`, `GET /.well-known/oauth-authorization-server`, `GET /api/chatgpt-oauth-jwks`, and the JSON-RPC `initialize` and `tools/list` calls against `POST /api/chatgpt-mcp`.
- Keep Node on the Vercel project's selected `22.x`, instead of automatically upgrading to Node 26.
- For `POST /api/chatgpt-mcp` without an access token, expect HTTP 401 and a `WWW-Authenticate` response pointing to `https://sedifex.com/.well-known/oauth-protected-resource` once the OAuth environment is configured.

## Remaining *manual*, security-critical configuration

Production environment variables must include valid consistent values for `SEDIFEX_OAUTH_ISSUER`, `SEDIFEX_OAUTH_PRIVATE_KEY`, `SEDIFEX_OAUTH_KEY_ID`, `SEDIFEX_OAUTH_CLIENT_ID`, `SEDIFEX_OAUTH_REDIRECT_URI`, `SEDIFEX_MCP_RESOURCE_URL`, `SEDIFEX_MCP_OAUTH_ISSUER`, `SEDIFEX_MCP_JWKS_URL`. Do not commit private keys, client credentials, Firebase IDs or tokens. OAuth discovery does not establish login without those values, even when Vercel deploys successfully.

Authenticated Sedifex accounts can connect without pilot enrollment. Store ownership and booking access remain enforced, and no `create_service` write should occur without the merchant's explicit confirmation. Test both cross-tenant authorization and a fresh OAuth connection with a dedicated test merchant before publishing the plugin.
