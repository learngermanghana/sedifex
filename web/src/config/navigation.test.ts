import { describe, expect, it } from 'vitest'
import { INDUSTRY_ENABLED_MODULE_PRESETS, resolveNavigation } from './navigation'

describe('resolveNavigation', () => {
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

    expect(items.map(item => item.id)).toEqual(['reports', 'sell', 'customers', 'blog'])
    expect(items.find(item => item.id === 'customers')?.label).toBe('Travelers')
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

  it('defines the phase 4 enabled module presets by industry', () => {
    expect(INDUSTRY_ENABLED_MODULE_PRESETS.shop).toEqual([
      'dashboard',
      'products',
      'sell',
      'customers',
      'expenses',
      'public-page',
    ])
    expect(INDUSTRY_ENABLED_MODULE_PRESETS.travel).toEqual([
      'dashboard',
      'bookings',
      'customers',
      'bulk-messaging',
      'bulk-email',
      'expenses',
    ])
    expect(INDUSTRY_ENABLED_MODULE_PRESETS.ngo).toEqual([
      'dashboard',
      'customers',
      'bulk-messaging',
      'bulk-email',
      'expenses',
      'public-page',
    ])
    expect(INDUSTRY_ENABLED_MODULE_PRESETS.school).toEqual([
      'dashboard',
      'bookings',
      'customers',
      'bulk-messaging',
      'bulk-email',
      'expenses',
    ])
  })
})
