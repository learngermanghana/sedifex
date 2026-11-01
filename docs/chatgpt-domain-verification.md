# Verify Sedifex's MCP domain for OpenAI Plugins

This adds a public `GET https://sedifex.com/.well-known/openai-apps-challenge` endpoint without using a new Vercel serverless function.

1. In OpenAI Platform → Plugins → Sedifex Business → MCPs → Reconnect, find the **Verify Domain** challenge. Copy the exact token shown by OpenAI (not a made-up value).
2. In Vercel → `sedifexbiz` → Project Settings → Environment Variables, add `SEDIFEX_OPENAI_DOMAIN_CHALLENGE` targeted to **Production**. Set its value to the exact token with **no quotes, spaces, or line breaks**.
3. Deploy the updated production commit with the new environment value (Vercel changes are not retroactive to existing deployments).
4. Verify the challenge endpoint returns **HTTP 200, content-type text/plain, and only the exact token**. It deliberately returns 404 when not configured.
5. In the OpenAI plugin's Reconnect drawer, click **Verify Domain**; continue OAuth connection and tool scan.
6. The OAuth redirect URI shown by OpenAI must also be registered **exactly** as `SEDIFEX_OAUTH_REDIRECT_URI` for Production, with the same deployment and public OAuth client ID. Do not guess the callback. A separate `SEDIFEX_MCP_TEST_UIDS` production allowlist must contain only an authorized test merchant's Firebase UID; leave it unset until that account is deliberately chosen.

Notes: The token is public domain proof, not an OAuth secret. Do not place the OAuth private key, Firebase ID tokens, customer data, passwords, or test credentials in this repository. Do not submit the plugin for review until domain verification, OAuth login, and tool scan pass.
