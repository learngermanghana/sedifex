# Sedifex Product Webhooks (MVP)

Canonical integration contract: `docs/integration-contract.md`.

Sedifex emits product events to endpoints configured in Firestore `webhookEndpoints` documents (`status = active`).

## Events

- `product.created`
- `product.updated`
- `product.deleted`

## Delivery shape

- Method: `POST`
- Headers:
  - `Content-Type: application/json`
  - `X-Sedifex-Event: <event_type>`
  - `X-Sedifex-Event-Id: <event_id>`
  - `X-Sedifex-Signature: sha256=<hmac_hex>`
- Body:
  - JSON payload with `id`, `type`, `occurredAt`, `storeId`, `data.productId`, and `data.before`/`data.after` snapshots.

## Signature verification

Compute HMAC-SHA256 over the **raw request body** using the endpoint secret, then compare to the `X-Sedifex-Signature` value.

### Node.js example

```js
import crypto from 'crypto'

function verifySedifexSignature(rawBody, signatureHeader, webhookSecret) {
  const expected =
    'sha256=' + crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex')

  const a = Buffer.from(expected)
  const b = Buffer.from(signatureHeader || '')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
```

### PHP example

```php
function verify_sedifex_signature(string $rawBody, string $signatureHeader, string $secret): bool {
  $expected = 'sha256=' . hash_hmac('sha256', $rawBody, $secret);
  return hash_equals($expected, $signatureHeader);
}
```

## Operational notes

- Store a unique signing secret per endpoint.
- Reject unsigned requests with `401` or `403`.
- Log `X-Sedifex-Event-Id` to ensure idempotent processing.
- Respond with 2xx only after durable processing (or accepted queueing).


## Operability requirements (production)

Beyond signature verification and retries, partner operations require:

- **Replay by event ID:** allow re-delivery using `X-Sedifex-Event-Id` from delivery logs.
- **Endpoint health status:** expose endpoint state (active/degraded/failing) from recent delivery outcomes.
- **Dead-letter visibility:** show events that exhausted retries, with timestamp, endpoint, last response code/body snippet, and replay action.

### Minimum dashboard log fields

- `eventId`
- `eventType`
- `endpointId` + target URL label
- `attemptCount`
- `lastResponseCode`
- `lastAttemptAt`
- `status` (`delivered`, `retrying`, `dead-letter`)
- replay action state (`not-replayed`, `replayed`, `replay-succeeded`, `replay-failed`)
