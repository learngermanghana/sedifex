export type NavRole = 'owner' | 'staff'
export type Industry = 'shop' | 'travel' | 'ngo' | 'school'
export type NavigationLabelPolicy = 'shared' | 'industry_aliases'
export type NavItemType = 'module' | 'internal' | 'external'

export type NavItem = {
  id: string
  label: string
  type: NavItemType
  target: string
  sortOrder: number
  end?: boolean
  parentTarget?: string
  rolesAllowed: NavRole[]
  requiredPermissions?: string[]
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    type: 'module',
    target: '/dashboard',
    end: true,
    rolesAllowed: ['owner'],
    sortOrder: 10,
  },
  { id: 'products', label: 'Items', type: 'module', target: '/products', rolesAllowed: ['owner'], sortOrder: 20 },
  {
    id: 'sell',
    label: 'Sell',
    type: 'module',
    target: '/sell',
    rolesAllowed: ['owner', 'staff'],
    sortOrder: 30,
  },
  {
    id: 'customers',
    label: 'Customers',
    type: 'module',
    target: '/customers',
    rolesAllowed: ['owner', 'staff'],
    sortOrder: 40,
  },
  {
    id: 'bookings',
    label: 'Bookings',
    type: 'module',
    target: '/bookings',
    rolesAllowed: ['owner', 'staff'],
    sortOrder: 50,
  },
  { id: 'blog', label: 'Blog', type: 'module', target: '/blog', rolesAllowed: ['owner', 'staff'], sortOrder: 60 },
  { id: 'bulk-messaging', label: 'SMS', type: 'module', target: '/bulk-messaging', rolesAllowed: ['owner'], sortOrder: 70 },
  { id: 'bulk-email', label: 'Bulk email', type: 'module', target: '/bulk-email', rolesAllowed: ['owner'], sortOrder: 80 },
  {
    id: 'expenses',
    label: 'Business records',
    type: 'module',
    target: '/expenses',
    rolesAllowed: ['owner', 'staff'],
    sortOrder: 90,
  },
  { id: 'public-page', label: 'Public page', type: 'module', target: '/public-page', rolesAllowed: ['owner'], sortOrder: 100 },
  { id: 'account', label: 'Account', type: 'module', target: '/account', rolesAllowed: ['owner'], sortOrder: 110 },
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

export type CustomNavItem = {
  id: string
  label: string
  type: 'module' | 'internal' | 'external'
  target: string
  roles_allowed: NavRole[]
  sort_order: number
  required_permissions?: string[]
}

export type NavigationSettings = {
  industry: Industry
  labelPolicy: NavigationLabelPolicy
  customLabels?: Partial<Record<string, string>>
  enabledModules?: string[]
  customNavItems?: CustomNavItem[]
}

export type NavigationResolverInput = {
  role: NavRole
  workspaceProfile: NavigationSettings
  permissions?: string[]
}

function toShellNavItem(item: NavItem): NavItem {
  return {
    ...item,
    label: item.label.trim(),
  }
}

function hasPermissions(requiredPermissions: string[] | undefined, grantedPermissions: Set<string> | null) {
  if (!requiredPermissions || requiredPermissions.length === 0) return true
  if (!grantedPermissions) return false
  return requiredPermissions.every(permission => grantedPermissions.has(permission))
}

export function resolveNavigation(input: NavigationResolverInput): NavItem[] {
  const { role, workspaceProfile } = input
  const aliasLabels =
    workspaceProfile.labelPolicy === 'industry_aliases' ? INDUSTRY_LABELS[workspaceProfile.industry] : {}

  const enabledModules =
    workspaceProfile.enabledModules && workspaceProfile.enabledModules.length > 0
      ? new Set(workspaceProfile.enabledModules)
      : null

  const grantedPermissions = input.permissions && input.permissions.length > 0
    ? new Set(input.permissions)
    : null

  const baseItems = NAV_ITEMS.filter(item => {
    if (!item.rolesAllowed.includes(role)) return false
    if (enabledModules && !enabledModules.has(item.id)) return false
    return hasPermissions(item.requiredPermissions, grantedPermissions)
  }).map(item => {
    const customLabel = workspaceProfile.customLabels?.[item.target]?.trim()
    const aliasLabel = aliasLabels[item.target]
    return toShellNavItem({
      ...item,
      label: customLabel || aliasLabel || item.label,
    })
  })

  const customItems = (workspaceProfile.customNavItems ?? []).filter(item => {
    if (!item.roles_allowed.includes(role)) return false
    if (!item.label.trim() || !item.target.trim()) return false
    if (!['module', 'internal', 'external'].includes(item.type)) return false
    return hasPermissions(item.required_permissions, grantedPermissions)
  }).map<NavItem>(item => ({
    id: item.id,
    label: item.label.trim(),
    type: item.type,
    target: item.target.trim(),
    rolesAllowed: item.roles_allowed,
    sortOrder: item.sort_order,
    requiredPermissions: item.required_permissions,
    end: false,
  }))

  return [...baseItems, ...customItems].sort((a, b) => a.sortOrder - b.sortOrder)
}

export function resolveNavItems(role: NavRole, settings: NavigationSettings): NavItem[] {
  return resolveNavigation({
    role,
    workspaceProfile: settings,
  })
}
