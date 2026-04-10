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
  { to: '/close-day', label: 'Close day', parentTo: '/sell', roles: ['owner', 'staff'] },
  { to: '/customers', label: 'Customers', roles: ['owner', 'staff'] },
  { to: '/data-transfer', label: 'Data', roles: ['owner'] },
  { to: '/bulk-messaging', label: 'SMS', roles: ['owner'] },
  { to: '/finance', label: 'Invoice', parentTo: '/sell', roles: ['owner'] },
  { to: '/account', label: 'Account', roles: ['owner'] },
  { to: '/public-page', label: 'Public page', roles: ['owner'] },
  { to: '/google-connect', label: 'Google Connect', roles: ['owner'] },
  { to: '/ads', label: 'Google Ads', parentTo: '/google-connect', roles: ['owner'] },
  { to: '/google-shopping', label: 'Google Shopping', parentTo: '/google-connect', roles: ['owner'] },
  { to: '/google-business', label: 'Google Business', parentTo: '/google-connect', roles: ['owner'] },
]
