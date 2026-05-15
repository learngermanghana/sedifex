#!/usr/bin/env node
const admin = require('firebase-admin')

if (!admin.apps.length) admin.initializeApp()
const db = admin.firestore()

function dateKey(date) { return date.toISOString().slice(0, 10) }
function weekKey(date) {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = (utc.getUTCDay() + 6) % 7
  utc.setUTCDate(utc.getUTCDate() - day)
  return utc.toISOString().slice(0, 10)
}
function monthKey(date) { return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}` }
function key(bucket, date){ return bucket==='daily'?dateKey(date):bucket==='weekly'?weekKey(date):monthKey(date)}

async function run() {
  const snapshot = await db.collection('sales').get()
  console.log(`Found ${snapshot.size} sales for backfill`)
  let processed = 0
  for (const doc of snapshot.docs) {
    const sale = doc.data() || {}
    const storeId = String(sale.storeId || '').trim()
    if (!storeId) continue
    const createdAt = sale.createdAt && typeof sale.createdAt.toDate === 'function' ? sale.createdAt.toDate() : new Date()
    const total = Number(sale.total || 0)
    const tenders = sale.tenders || {}
    const items = Array.isArray(sale.items) ? sale.items : []
    const unitsSold = items.reduce((s, it) => s + Number(it.qty || 0), 0)

    const batch = db.batch()
    for (const bucket of ['daily', 'weekly', 'monthly']) {
      const bucketValue = key(bucket, createdAt)
      const summaryRef = db.collection(`${bucket}Summaries`).doc(`${storeId}_${bucketValue}`)
      batch.set(summaryRef, {
        storeId, bucket, bucketKey: bucketValue,
        salesCount: admin.firestore.FieldValue.increment(1),
        salesTotal: admin.firestore.FieldValue.increment(total),
        unitsSold: admin.firestore.FieldValue.increment(unitsSold),
        cashTotal: admin.firestore.FieldValue.increment(Number(tenders.cash || 0)),
        cardTotal: admin.firestore.FieldValue.increment(Number(tenders.card || 0)),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true })

      const snapRef = db.collection('reportSnapshots').doc(`${storeId}_${bucket}_${bucketValue}`)
      batch.set(snapRef, {
        storeId, bucket, bucketKey: bucketValue,
        metrics: {
          salesCount: admin.firestore.FieldValue.increment(1),
          salesTotal: admin.firestore.FieldValue.increment(total),
          unitsSold: admin.firestore.FieldValue.increment(unitsSold),
        },
        source: 'sales-backfill',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true })
    }
    await batch.commit()
    processed += 1
    if (processed % 100 === 0) console.log(`Processed ${processed}`)
  }
  console.log(`Backfill complete. Processed ${processed} sales.`)
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
