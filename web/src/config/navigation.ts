export type NavRole = 'owner' | 'staff'
export type Industry = 'shop' | 'travel' | 'ngo' | 'school'
export type NavigationLabelPolicy = 'shared' | 'industry_aliases'

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

const INDUSTRY_LABELS: Record<Industry, Partial<Record<string, string>>> = {
  shop: {},
  travel: {
    '/customers': 'Travelers',
    '/bookings': 'Trips',
  },
  ngo: {
    '/customers': 'Donors',
    '/bookings': 'Campaigns',
  },
  school: {
    '/customers': 'Students',
    '/bookings': 'Classes',
  },
}

export type NavigationSettings = {
  industry: Industry
  labelPolicy: NavigationLabelPolicy
  customLabels?: Partial<Record<string, string>>
}

export function resolveNavItems(
  role: NavRole,
  settings: NavigationSettings,
): NavItem[] {
  const aliasLabels =
    settings.labelPolicy === 'industry_aliases'
      ? INDUSTRY_LABELS[settings.industry]
      : {}

  return NAV_ITEMS.filter(item => item.roles.includes(role)).map(item => {
    const customLabel = settings.customLabels?.[item.to]?.trim()
    const aliasLabel = aliasLabels[item.to]
    return {
      ...item,
      label: customLabel || aliasLabel || item.label,
    }
  })
}
