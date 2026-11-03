import * as functions from 'firebase-functions/v1'
import { createHash } from 'node:crypto'
import { getAuth } from 'firebase-admin/auth'
import { admin, defaultDb } from './firestore'
import { queueBrandedNotification } from './notifications'
const str = (v: unknown) => typeof v === 'string' ? v.trim() : ''
const owner = (s: Record<string, any>, id: string) => s.ownerUid || s.ownerId || s.userId || s.createdBy || id
function revision(s: Record<string, any>) {
  const date = s.updatedAt?.toDate?.() || (s.updatedAt instanceof Date ? s.updatedAt : typeof s.updatedAt === 'string' ? new Date(s.updatedAt) : null)
  const iso = date && Number.isFinite(date.getTime()) ? date.toISOString() : null
  return createHash('sha256').update(JSON.stringify([iso,s.bookingStatus,s.status,s.bookingDate,s.bookingTime,s.slotId])).digest('hex')
}
// Server-only requests are written by the MCP after owner, recipient and consent validation.
export const deliverChatgptBookingReminder = functions.firestore.document('chatgpt_reminders/{reminderId}').onCreate(async snapshot => {
  const request=snapshot.data(), storeId=str(request.storeId), bookingId=str(request.bookingId), uid=str(request.uid)
  const paths=[`stores/${storeId}/integrationBookings/${bookingId}`,`integrationBookings/${bookingId}`,`stores/${storeId}/integrationOrders/${bookingId}`,`integrationOrders/${bookingId}`]
  try {
    if(!/^[\w-]{1,220}$/.test(storeId)||!/^[\w-]{1,220}$/.test(bookingId)||!paths.includes(request.bookingPath))throw Error('invalid_request')
    const [store,booking,user]=await Promise.all([defaultDb.collection('stores').doc(storeId).get(),defaultDb.doc(request.bookingPath).get(),getAuth().getUser(uid)])
    const s=store.data()||{}, b=booking.data()||{}
    if(user.disabled||!store.exists||owner(s,storeId)!==uid||!booking.exists||b.storeId!==storeId)throw Error('access_changed')
    if(!['confirmed','rescheduled'].includes(str(b.bookingStatus||b.status))||revision(b)!==request.revision||str(b.customer?.email||b.customerEmail).toLowerCase()!==request.recipientEmail)throw Error('booking_or_recipient_changed')
    const result=await queueBrandedNotification({storeId,eventType:'booking.reminder',reference:'chatgpt-reminder-'+snapshot.id,customer:{name:b.customer?.name||b.customerName||null,email:request.recipientEmail},data:{itemName:b.serviceName||b.booking?.serviceName||'appointment',bookingDate:b.bookingDate||b.booking?.preferredDate||null,bookingTime:b.bookingTime||b.booking?.preferredTime||null,timezone:b.timezone||null}})
    await snapshot.ref.update({status:result.ok?'processed':'failed',result,updatedAt:admin.firestore.FieldValue.serverTimestamp()})
  }catch(error){
    await snapshot.ref.update({status:'failed',result:{reason:error instanceof Error?error.message:'delivery_failed'},updatedAt:admin.firestore.FieldValue.serverTimestamp()})
  }
})
