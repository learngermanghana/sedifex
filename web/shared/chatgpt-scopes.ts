export const scopeDescriptions = {
  'inventory:read': 'View your store inventory and stock.',
  'inventory:write': 'Create unpublished products in stores you own.',
  'sales:read': 'Summarize recorded store sales.',
  'sales:write': 'Record offline sales you approve and update stock.',
  'merchant-bookings:read': 'View all appointments and customer contact details in stores you own.',
  'merchant-bookings:write': 'Confirm, complete, cancel and reschedule store appointments you approve.',
  'reminders:write': 'Send standard booking email reminders to saved customer addresses after your approval.',
  'payments:read': 'View store booking payment links and prepare a manual refund handoff. Does not charge or refund customers.',
  'stores:read': 'Find the stores you own.',
  'services:read': 'View your business services.',
  'services:write': 'Create unpublished services.',
  'bookings:read': 'View appointments you created through ChatGPT.',
  'bookings:write': 'Request appointments and changes to your own appointments.',
  'blog:read': 'View your store blog posts.',
  'blog:write': 'Create and edit blog drafts, and publish posts you approve.',
} as const
export const chatgptScopes = Object.keys(scopeDescriptions)

