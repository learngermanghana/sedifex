import { describe, expect, it } from 'vitest'
import { INDUSTRY_ENABLED_MODULE_PRESETS, resolveNavigation } from './navigation'

describe('resolveNavigation', () => {
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

  it('groups website content behind the website builder nav item', () => {
    const items = resolveNavigation({
      role: 'staff',
      workspaceProfile: {
        industry: 'shop',
        labelPolicy: 'shared',
        enabledModules: ['promo', 'gallery', 'website-hero-slides', 'social-links'],
      },
    })

    expect(items.map(item => item.id)).toEqual(['website-builder'])
    expect(items[0].target).toBe('/website-builder')
  })

  it('includes document modules in enabled module presets by industry', () => {
    expect(INDUSTRY_ENABLED_MODULE_PRESETS.shop).toContain('invoices')
    expect(INDUSTRY_ENABLED_MODULE_PRESETS.shop).toContain('receipts')
    expect(INDUSTRY_ENABLED_MODULE_PRESETS.shop).toContain('website-builder')
    expect(INDUSTRY_ENABLED_MODULE_PRESETS.travel).toContain('invoices')
    expect(INDUSTRY_ENABLED_MODULE_PRESETS.travel).toContain('receipts')
    expect(INDUSTRY_ENABLED_MODULE_PRESETS.ngo).toContain('invoices')
    expect(INDUSTRY_ENABLED_MODULE_PRESETS.ngo).toContain('receipts')
    expect(INDUSTRY_ENABLED_MODULE_PRESETS.school).toContain('invoices')
    expect(INDUSTRY_ENABLED_MODULE_PRESETS.school).toContain('receipts')
  })
})
