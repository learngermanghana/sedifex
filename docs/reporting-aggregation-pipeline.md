# Reporting Aggregation Pipeline

Server-side reporting aggregation is now supported with:

- `dailySummaries/{storeId}_{YYYY-MM-DD}`
- `weeklySummaries/{storeId}_{weekStartYYYY-MM-DD}`
- `monthlySummaries/{storeId}_{YYYY-MM}`
- `reportSnapshots/{storeId}_{bucket}_{bucketKey}` denormalized snapshot docs for fast report reads.

## Trigger

Cloud Function: `onSaleReportingAggregate`

- Source: `sales/{saleId}` on create.
- Writes aggregate increments for sales count, totals, units sold, and tender split (`cashTotal`, `cardTotal`) into all three buckets.

## Historical backfill

Run:

```bash
cd functions
npm run backfill-reporting-aggregates
```

This scans historical `sales` docs and incrementally builds summary buckets and snapshots.
