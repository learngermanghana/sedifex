# Integration Delivery Sequence (High Confidence)

This plan captures the recommended order for shipping Sedifex integrations with the highest near-term product and operational payoff.

## 1) Ship real integration API keys + revoke/rotate UI

### Goal
Move away from shared user credentials and give each integration a dedicated API key lifecycle.

### MVP scope
- Generate store-scoped integration keys (prefix + hashed secret at rest).
- Show key metadata in-app: name, created time, last used time, status.
- One-time secret reveal on creation.
- Revoke key action (immediate invalidation).
- Rotate key flow (create replacement, deprecate old key with short overlap window).
- Basic audit log entries for create/revoke/rotate events.

### Why first
- Reduces credential sharing risk immediately.
- Unblocks plugin and webhook work by providing a stable auth surface.
- Gives support and compliance teams visibility into integration access.

### Exit criteria
- New integrations can authenticate with API keys only.
- Revoked keys fail authentication immediately.
- Rotation path is documented and verified in staging.

---

## 2) Ship WordPress plugin MVP

### Goal
Provide the fastest path for merchants to embed Sedifex products on WordPress.

### MVP scope
- Plugin settings page for API key + store selection.
- Product shortcode/block for storefront embedding.
- Sync health panel (last success, last failure, item count, next retry).
- 30-120 second cache window and manual "Sync now" trigger.

### Why second
- API key model from phase 1 keeps plugin setup secure and supportable.
- WordPress merchant demand is high and time-to-value is short.
- Sync health reduces support load and speeds troubleshooting.

### Exit criteria
- Non-technical user can install and configure plugin in < 10 minutes.
- Product list renders via shortcode/block on a standard theme.
- Health state clearly indicates success/failure and recovery actions.

---

## 3) Ship basic product webhooks (+ signature verification docs)

### Goal
Enable event-driven sync for partners who need fresher data than polling.

### MVP scope
- Outbound events:
  - `product.created`
  - `product.updated`
  - `product.deleted`
- Per-endpoint signing secret and `X-Sedifex-Signature` header.
- Retry policy with exponential backoff for non-2xx responses.
- Delivery log view (status, attempts, last response code).
- Documentation with concrete signature verification examples.

### Why third
- Depends on stable key/secret management patterns from phase 1.
- Complements (not replaces) plugin polling for broader ecosystem support.
- Enables higher-scale integrations with lower latency.

### Exit criteria
- Event payloads match documented schema.
- Signature verification examples work as copy/paste quickstarts.
- Failed deliveries are visible and retryable.

---

## Suggested milestone cadence

- **Milestone A (Weeks 1-2):** API keys + revoke/rotate UI + audit logs.
- **Milestone B (Weeks 3-4):** WordPress plugin MVP + sync health + onboarding guide.
- **Milestone C (Weeks 5-6):** Product webhooks + signing + delivery logs + verification docs.

## Dependency note

If timeline pressure requires overlap, keep key-management primitives (creation, hashing, revoke, rotate, audit) as the non-negotiable foundation before broad partner rollout.
