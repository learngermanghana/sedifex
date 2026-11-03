export const scopeDescriptions = {
  'stores:read': 'Find your merchant stores.',
  'services:read': 'View your merchant services.',
  'services:write': 'Create unpublished services.',
  'bookings:read': 'View appointments you created through ChatGPT.',
  'bookings:write': 'Request appointments and changes to your own appointments.',
  'blog:read': 'View your store blog posts.',
  'blog:write': 'Create and edit blog drafts, and publish posts you approve.',
} as const
export const chatgptScopes = Object.keys(scopeDescriptions)
