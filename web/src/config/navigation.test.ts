import { describe, expect, it } from 'vitest'
import { INDUSTRY_ENABLED_MODULE_PRESETS, resolveNavigation } from './navigation'

describe('resolveNavigation', () => {
  it('always offers a scoped Activity page for staff and owners, even with saved modules', () => {
    for (const role of ['staff', 'owner'] as const) {
      const items = resolveNavigation({ role, workspaceProfile: { industry: 'travel', labelPolicy: 'shared', enabledModules: ['customers'] } })
      expect(items.find(item => item.id === 'activity')).toMatchObject({ target: '/activity', rolesAllowed: ['owner', 'staff'] })
    }
  })

  it('uses the selected industry preset when no enabled modules are stored', () => {
    const items = resolveNavigation({
      role: 'owner',
      workspaceProfile: {
        industry: 'ngo',
        labelPolicy: 'industry_aliases',
        enabledModules: [],
      },
    })

    expect(items.map(item => item.id)).toContain('volunteers')
    expect(items.map(item => item.id)).not.toContain('sell')
  })

  it('keeps Automations hidden until the owner enables it', () => {
    const hidden = resolveNavigation({
      role: 'owner',
      workspaceProfile: {
        industry: 'shop',
        labelPolicy: 'shared',
        enabledModules: ['dashboard', 'products'],
      },
    })
    expect(hidden.map(item => item.id)).not.toContain('automations')

    const enabled = resolveNavigation({
      role: 'owner',
      workspaceProfile: {
        industry: 'shop',
        labelPolicy: 'shared',
        enabledModules: ['dashboard', 'products', 'automations'],
      },
    })
    expect(enabled.map(item => item.id)).toContain('automations')
  })

  it('does not restore the retired marketplace page from saved workspace settings', () => {
    const items = resolveNavigation({
      role: 'owner',
      workspaceProfile: {
        industry: 'shop',
        labelPolicy: 'shared',
        enabledModules: ['dashboard', 'products', 'sell', 'marketplace-orders'],
      },
    })

    expect(items.map(item => item.id)).toEqual(['dashboard', 'products', 'sell', 'activity', 'settlement', 'account'])
  })

  it('applies industry preset aliases, module toggles, custom items, role and permissions', () => {
    const items = resolveNavigation({
      role: 'staff',
      permissions: ['view_reports'],
      workspaceProfile: {
        industry: 'travel',
        labelPolicy: 'industry_aliases',
        enabledModules: ['sell', 'customers', 'blog'],
        customNavItems: [
          {
            id: 'reports',
            label: ' Reports ',
            type: 'internal',
            target: '/reports',
            sort_order: 5,
            roles_allowed: ['staff'],
            required_permissions: ['view_reports'],
          },
          {
            id: 'admin',
            label: 'Admin',
            type: 'internal',
            target: '/admin',
            sort_order: 1,
            roles_allowed: ['staff'],
            required_permissions: ['manage_admin'],
          },
        ],
      },
    })

    expect(items.map(item => item.id)).toEqual(['reports', 'sell', 'activity', 'customers', 'blog'])
    expect(items.find(item => item.id === 'customers')?.label).toBe('Customers')
  })

  it('prefers custom labels over industry aliases', () => {
    const items = resolveNavigation({
      role: 'owner',
      workspaceProfile: {
        industry: 'school',
        labelPolicy: 'industry_aliases',
        customLabels: {
          '/customers': 'Learners',
        },
      },
    })

    expect(items.find(item => item.target === '/customers')?.label).toBe('Learners')
    expect(items.find(item => item.target === '/bookings')?.label).toBe('Classes')
  })

  it('does not reveal the retired Website Builder even for previously enabled modules', () => {
    const items = resolveNavigation({
      role: 'staff',
      workspaceProfile: {
        industry: 'shop',
        labelPolicy: 'shared',
        enabledModules: ['website-builder', 'promo', 'gallery', 'website-hero-slides', 'social-links'],
        customNavItems: [{ id: 'website-builder', label: 'Old editor', type: 'internal', target: '/website-builder', roles_allowed: ['staff'], sort_order: 4 }],
      },
    })

    expect(items.map(item => item.id)).toEqual(['activity'])
  })

  it('keeps signup presets focused on the selected business type', () => {
    expect(INDUSTRY_ENABLED_MODULE_PRESETS.shop).toEqual([
      'dashboard',
      'products',
      'sell',
      'invoices',
      'receipts',
      'customers',
      'settlement',
    ])
    expect(INDUSTRY_ENABLED_MODULE_PRESETS.travel).toEqual([
      'dashboard',
      'customers',
      'bookings',
      'upcoming-events',
      'invoices',
      'receipts',
      'settlement',
    ])
    expect(INDUSTRY_ENABLED_MODULE_PRESETS.ngo).toEqual([
      'dashboard',
      'customers',
      'bookings',
      'upcoming-events',
      'donor-management',
      'funds-ledger',
      'volunteers',
      'settlement',
    ])
    expect(INDUSTRY_ENABLED_MODULE_PRESETS.school).toEqual([
      'dashboard',
      'students',
      'customers',
      'bookings',
      'upcoming-events',
      'student-registration',
      'invoices',
      'settlement',
    ])
    expect(INDUSTRY_ENABLED_MODULE_PRESETS.event).toEqual([
      'dashboard',
      'events',
      'customers',
      'invoices',
      'reports',
      'bulk-email',
      'settlement',
    ])
  })

  it('shows the cleaning business pages in a practical order with cleaning-specific labels', () => {
    const owner = resolveNavigation({
      role: 'owner',
      workspaceProfile: { industry: 'cleaning', labelPolicy: 'industry_aliases' },
    })
    expect(INDUSTRY_ENABLED_MODULE_PRESETS.cleaning).toEqual([
      'dashboard', 'products', 'customers', 'bookings', 'upcoming-events', 'invoices', 'expenses', 'reports',
    ])
    expect(owner.map(item => item.id)).toEqual([
      'dashboard', 'activity', 'products', 'customers', 'bookings', 'upcoming-events',
      'invoices', 'expenses', 'reports', 'settlement', 'account',
    ])
    expect(owner.find(item => item.id === 'products')).toMatchObject({ label: 'Services & Pricing', target: '/products' })
    expect(owner.find(item => item.id === 'customers')).toMatchObject({ label: 'Clients', target: '/customers' })
    expect(owner.find(item => item.id === 'upcoming-events')).toMatchObject({ label: 'Cleaning Schedule', target: '/upcoming-events' })
    expect(owner.map(item => item.id)).not.toContain('events')
    expect(owner.map(item => item.id)).not.toContain('automations')

    const staff = resolveNavigation({
      role: 'staff',
      workspaceProfile: { industry: 'cleaning', labelPolicy: 'industry_aliases' },
    })
    expect(staff.map(item => item.id)).toEqual([
      'activity', 'customers', 'bookings', 'upcoming-events', 'invoices', 'expenses', 'reports',
    ])
  })

  it('respects custom module choices and custom labels for cleaning businesses', () => {
    const owner = resolveNavigation({
      role: 'owner',
      workspaceProfile: {
        industry: 'cleaning', labelPolicy: 'industry_aliases',
        enabledModules: ['customers', 'bookings', 'bulk-email'],
        customLabels: { '/customers': 'Property clients' },
      },
    })
    expect(owner.map(item => item.id)).toEqual(['activity', 'customers', 'bookings', 'bulk-email', 'settlement', 'account'])
    expect(owner.find(item => item.id === 'customers')?.label).toBe('Property clients')
  })

  it('leaves advanced pages available for opt-in instead of enabling them at signup', () => {
    for (const industry of ['shop', 'travel', 'ngo', 'school'] as const) {
      expect(INDUSTRY_ENABLED_MODULE_PRESETS[industry]).not.toContain('reports')
      expect(INDUSTRY_ENABLED_MODULE_PRESETS[industry]).not.toContain('integrations')
      expect(INDUSTRY_ENABLED_MODULE_PRESETS[industry]).not.toContain('automations')
      expect(INDUSTRY_ENABLED_MODULE_PRESETS[industry]).not.toContain('website-builder')
      expect(INDUSTRY_ENABLED_MODULE_PRESETS[industry]).not.toContain('bulk-email')
      expect(INDUSTRY_ENABLED_MODULE_PRESETS[industry]).not.toContain('bulk-messaging')
    }
  })
})
