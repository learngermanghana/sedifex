# Admin-only: Sedifex integration master key usage

This document is intentionally separated from store-scoped BuySedifex integration docs.

## When to use

Use `SEDIFEX_INTEGRATION_API_KEY` only for trusted admin/server workflows that require cross-store access.

## Rules

- Never expose master key in client/browser code.
- Store in secure server-side config/secret manager only.
- Log redacted key fingerprints only.
- Rotate immediately on suspected leakage.

## Scope

Master key can access integration product endpoints across stores; therefore it must not be used in standard store-scoped website integrations.
