export type NavRole = 'owner' | 'staff'

export type NavItem = {
  to: string
  label: string
  end?: boolean
  parentTo?: string
  roles: NavRole[]
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', end: true, roles: ['owner'] },
  { to: '/products', label: 'Items', roles: ['owner'] },
  { to: '/sell', label: 'Sell', roles: ['owner', 'staff'] },
  { to: '/customers', label: 'Customers', roles: ['owner', 'staff'] },
  { to: '/bookings', label: 'Bookings', roles: ['owner', 'staff'] },
  { to: '/blog', label: 'Blog', roles: ['owner', 'staff'] },
  { to: '/bulk-messaging', label: 'SMS', roles: ['owner'] },
  { to: '/bulk-email', label: 'Bulk email', roles: ['owner'] },
  { to: '/expenses', label: 'Business records', roles: ['owner', 'staff'] },
  { to: '/public-page', label: 'Public page', roles: ['owner'] },
  { to: '/account', label: 'Account', roles: ['owner'] },
]
