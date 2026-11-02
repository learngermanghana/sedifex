const assert = require('node:assert/strict')
const { selectAuthorizedBookingRecipients } = require('../lib/bookingNotificationRecipients')
const { useCentralBookingSender } = require('../lib/emailDelivery')

const verifiedMembers = [
  { role: 'owner', email: 'owner@glittering.example' },
  { role: 'staff', email: 'staff@glittering.example' },
  { role: 'staff', email: 'second@glittering.example' },
]
assert.deepEqual(
  selectAuthorizedBookingRecipients(
    verifiedMembers,
    ['onconurse@example.com', 'staff@glittering.example'],
  ),
  ['owner@glittering.example', 'staff@glittering.example'],
  'wrong-store BCC must never be added from stale store settings',
)
assert.deepEqual(
  selectAuthorizedBookingRecipients(verifiedMembers, []),
  ['owner@glittering.example'],
  'owner should always receive booking store alert',
)
assert.deepEqual(
  selectAuthorizedBookingRecipients([], ['onconurse@example.com']),
  [],
  'no verified store member must mean no store email',
)

for (const event of [
  'booking.received', 'booking.confirmed', 'booking.cancelled',
  'booking.payment_confirmed', 'booking.rescheduled',
]) {
  assert.equal(useCentralBookingSender(event, 'automatic'), true, event)
  assert.equal(useCentralBookingSender(event, 'sedifex'), true, event)
  assert.equal(useCentralBookingSender(event, 'store_email'), false, event)
}
assert.equal(useCentralBookingSender('booking.reminder_1d', 'automatic'), false, 'keep scheduled reminders on existing route')
assert.equal(useCentralBookingSender('order.confirmed', 'automatic'), false, 'do not alter unrelated order mail')
assert.equal(useCentralBookingSender('booking.confirmed', 'custom_webhook'), false, 'preserve explicit custom override')

console.log('store-isolated booking email routing tests passed')
