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
  'booking.reminder_1d', 'booking.reminder_3d',
  'order.confirmed', 'student_registration.paid', 'donation.confirmed',
]) {
  for (const preference of ['automatic', 'sedifex', 'store_email', 'custom_webhook']) {
    assert.equal(useCentralBookingSender(event, preference), true,
      `${event} must always use Sedifex's own script, not ${preference}`)
  }
}
assert.equal(useCentralBookingSender(''), false, 'empty event is not an email')
console.log('store-isolated transactional email routing tests passed')
