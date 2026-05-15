import * as functions from 'firebase-functions/v1'
import { admin, defaultDb as db } from './firestore'

type SaleItem = {
  productId?: string
  name?: string
  qty?: number
  total?: number
}

type SaleRecord = {
  storeId?: string
  createdAt?: admin.firestore.Timestamp
  total?: number
  tenders?: Record<string, number>
  items?: SaleItem[]
}

type SummaryBucket = 'daily' | 'weekly' | 'monthly'

function toDate(value: unknown): Date {
  if (value instanceof admin.firestore.Timestamp) return value.toDate()
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number') return new Date(value)
  return new Date()
}

function dateKeyFromDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function weekKeyFromDate(date: Date): string {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = (utc.getUTCDay() + 6) % 7
  utc.setUTCDate(utc.getUTCDate() - day)
  return utc.toISOString().slice(0, 10)
}

function monthKeyFromDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function bucketKey(bucket: SummaryBucket, date: Date): string {
  if (bucket === 'daily') return dateKeyFromDate(date)
  if (bucket === 'weekly') return weekKeyFromDate(date)
  return monthKeyFromDate(date)
}

async function writeAggregateForSale(sale: SaleRecord, saleId: string) {
  const storeId = sale.storeId?.trim()
  if (!storeId) return
  const eventDate = toDate(sale.createdAt)
  const total = Number(sale.total ?? 0)
  const tenders = sale.tenders ?? {}
  const cashTotal = Number(tenders.cash ?? 0)
  const cardTotal = Number(tenders.card ?? 0)
  const items = Array.isArray(sale.items) ? sale.items : []
  const unitsSold = items.reduce((sum, item) => sum + Number(item.qty ?? 0), 0)

  const batch = db.batch()

  for (const bucket of ['daily', 'weekly', 'monthly'] as SummaryBucket[]) {
    const key = bucketKey(bucket, eventDate)
    const id = `${storeId}_${key}`
    const summaryRef = db.collection(`${bucket}Summaries`).doc(id)
    batch.set(summaryRef, {
      storeId,
      bucket,
      bucketKey: key,
      salesCount: admin.firestore.FieldValue.increment(1),
      salesTotal: admin.firestore.FieldValue.increment(total),
      unitsSold: admin.firestore.FieldValue.increment(unitsSold),
      cashTotal: admin.firestore.FieldValue.increment(cashTotal),
      cardTotal: admin.firestore.FieldValue.increment(cardTotal),
      lastActivityAt: admin.firestore.Timestamp.fromDate(eventDate),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true })

    const snapshotRef = db.collection('reportSnapshots').doc(`${storeId}_${bucket}_${key}`)
    batch.set(snapshotRef, {
      storeId,
      bucket,
      bucketKey: key,
      source: 'sales',
      metrics: {
        salesTotal: admin.firestore.FieldValue.increment(total),
        salesCount: admin.firestore.FieldValue.increment(1),
        unitsSold: admin.firestore.FieldValue.increment(unitsSold),
      },
      refs: { saleId },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true })
  }

  await batch.commit()
}

export const onSaleReportingAggregate = functions.firestore
  .document('sales/{saleId}')
  .onCreate(async (snapshot, context) => {
    await writeAggregateForSale(snapshot.data() as SaleRecord, context.params.saleId)
  })
