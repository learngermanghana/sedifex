import * as functions from 'firebase-functions/v1'
import { admin, defaultDb as db } from './firestore'

type CallableContext = functions.https.CallableContext

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


function cleanText(value: unknown, max = 180) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

async function assertCanCleanReports(context: CallableContext, storeId: string) {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign in required.')
  const uid = context.auth.uid
  const storeSnap = await db.collection('stores').doc(storeId).get()
  const storeData = (storeSnap.data() ?? {}) as Record<string, unknown>
  const ownerUid = cleanText(storeData.ownerUid)
  const ownerEmail = cleanText(storeData.ownerEmail ?? storeData.email, 220).toLowerCase()
  const authEmail = cleanText(context.auth.token.email, 220).toLowerCase()
  if (storeId === uid || ownerUid === uid || (ownerEmail && authEmail && ownerEmail === authEmail)) return

  const memberSnap = await db.collection('teamMembers').doc(uid).get()
  const memberData = (memberSnap.data() ?? {}) as Record<string, unknown>
  const memberStoreId = cleanText(memberData.storeId)
  const role = cleanText(memberData.role, 40).toLowerCase()
  if (memberStoreId === storeId && ['owner', 'admin'].includes(role)) return

  throw new functions.https.HttpsError('permission-denied', 'Only a workspace owner or admin can clean report data.')
}

const pendingStatuses = ['pending', 'pending_payment', 'pending_cash', 'awaiting_verification', 'checkout_created', 'syncing']
const pendingReportCollections = ['reportSnapshots', 'reportRows', 'settlementReports']
const pendingReportFields = ['status', 'paymentStatus', 'payment_status', 'orderStatus', 'order_status', 'syncStatus']

async function deleteQueryInPages(query: admin.firestore.Query, batchSize: number) {
  let deleted = 0
  for (;;) {
    const snapshot = await query.limit(batchSize).get()
    if (snapshot.empty) return deleted
    const batch = db.batch()
    snapshot.docs.forEach(doc => batch.delete(doc.ref))
    await batch.commit()
    deleted += snapshot.docs.length
    if (snapshot.docs.length < batchSize) return deleted
  }
}

async function cleanPendingReportDataForStore(input: {
  storeId: string
  batchSize: number
  requestedBy: string
  source: 'callable' | 'scheduled'
  writeAudit?: boolean
}) {
  const details: Record<string, number> = {}
  let deleted = 0

  for (const collectionName of pendingReportCollections) {
    for (const field of pendingReportFields) {
      const count = await deleteQueryInPages(
        db.collection(collectionName).where('storeId', '==', input.storeId).where(field, 'in', pendingStatuses),
        input.batchSize,
      )
      if (count) {
        details[`${collectionName}.${field}`] = count
        deleted += count
      }
    }
  }

  if (input.writeAudit ?? true) {
    await db.collection('reportCleanups').add({
      storeId: input.storeId,
      deleted,
      details,
      pendingStatuses,
      requestedBy: input.requestedBy,
      source: input.source,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })
  }

  return { storeId: input.storeId, deleted, details }
}

export const cleanPendingReportData = functions.https.onCall(
  async (rawData: { storeId?: unknown; batchSize?: unknown } | undefined, context) => {
    const storeId = cleanText(rawData?.storeId)
    if (!storeId) throw new functions.https.HttpsError('invalid-argument', 'storeId is required.')
    await assertCanCleanReports(context, storeId)

    const batchSize = Math.min(Math.max(Number(rawData?.batchSize) || 250, 25), 450)
    const result = await cleanPendingReportDataForStore({
      storeId,
      batchSize,
      requestedBy: context.auth!.uid,
      source: 'callable',
    })

    return { ok: true, ...result }
  },
)

export const scheduledCleanPendingReportData = functions
  .runWith({ timeoutSeconds: 540, memory: '512MB' })
  .pubsub.schedule('every day 03:30')
  .timeZone('Etc/UTC')
  .onRun(async () => {
    const batchSize = 250
    const storesSnap = await db.collection('stores').get()
    const storeResults = []
    let deleted = 0

    for (const storeDoc of storesSnap.docs) {
      const result = await cleanPendingReportDataForStore({
        storeId: storeDoc.id,
        batchSize,
        requestedBy: 'system:scheduledCleanPendingReportData',
        source: 'scheduled',
        writeAudit: false,
      })
      if (result.deleted > 0) storeResults.push(result)
      deleted += result.deleted
    }

    await db.collection('reportCleanups').add({
      deleted,
      storesChecked: storesSnap.docs.length,
      storesCleaned: storeResults.length,
      storeResults,
      pendingStatuses,
      requestedBy: 'system:scheduledCleanPendingReportData',
      source: 'scheduled',
      schedule: 'every day 03:30 Etc/UTC',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    functions.logger.info('Scheduled pending report cleanup completed', {
      deleted,
      storesChecked: storesSnap.docs.length,
      storesCleaned: storeResults.length,
    })

    return null
  })
