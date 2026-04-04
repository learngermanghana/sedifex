export type NavRole = 'owner' | 'staff'

export type NavItem = {
  to: string
  label: string
  end?: boolean
  roles: NavRole[]
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', end: true, roles: ['owner'] },
  { to: '/products', label: 'Items', roles: ['owner'] },
  { to: '/sell', label: 'Sell', roles: ['owner', 'staff'] },
  { to: '/customers', label: 'Customers', roles: ['owner', 'staff'] },
  { to: '/data-transfer', label: 'Data', roles: ['owner'] },
  { to: '/bulk-messaging', label: 'SMS', roles: ['owner'] },
  { to: '/finance', label: 'Invoice', roles: ['owner'] },
  { to: '/close-day', label: 'Close day', roles: ['owner', 'staff'] },
  { to: '/account', label: 'Account', roles: ['owner'] },
]
