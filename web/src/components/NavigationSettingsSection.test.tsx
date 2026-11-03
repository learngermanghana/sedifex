import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import NavigationSettingsSection from './NavigationSettingsSection'

it('searches pages without losing selected modules and reports save failures', async () => {
  const save = vi.fn().mockRejectedValue(new Error('Save failed'))
  render(<NavigationSettingsSection preferences={{ industry: 'shop', enabledModules: ['account'], customNavItems: [] }} onSave={save} canEdit />)
  const user = userEvent.setup()
  await user.type(screen.getByRole('searchbox', { name: 'Find a page' }), 'Bookings')
  expect(screen.queryByText('Settings')).toBeNull()
  await user.click(screen.getByRole('checkbox'))
  await user.click(screen.getByRole('button', { name: 'Save navigation settings' }))
  expect(save.mock.calls[0][0].enabledModules).toContain('bookings')
  expect(save.mock.calls[0][0].enabledModules).toContain('account')
  expect(await screen.findByText('Save failed')).toBeVisible()
})


it('applies the Cleaning Services industry preset and saves its labels without turning on unrelated modules', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  const user = userEvent.setup()
  render(<NavigationSettingsSection
    preferences={{ industry: 'shop', labelPolicy: 'shared', enabledModules: ['dashboard', 'sell'], customNavItems: [] }}
    onSave={save}
    canEdit
  />)

  await user.selectOptions(screen.getByRole('combobox', { name: 'Business type' }), 'cleaning')
  expect(screen.getAllByText('Recommended for Cleaning Services')).toHaveLength(8)
  await user.click(screen.getByRole('button', { name: 'Save navigation settings' }))

  expect(save).toHaveBeenCalledWith(expect.objectContaining({
    industry: 'cleaning',
    labelPolicy: 'industry_aliases',
    enabledModules: ['dashboard', 'products', 'customers', 'bookings', 'upcoming-events', 'invoices', 'expenses', 'reports'],
  }))
  const saved = save.mock.calls[0][0]
  expect(saved.enabledModules).not.toContain('events')
  expect(saved.enabledModules).not.toContain('automations')
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
})


it('lets the owner tick Media Library under Website & marketing and save it to the sidebar', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  const user = userEvent.setup()
  render(<NavigationSettingsSection
    preferences={{
      industry: 'shop',
      labelPolicy: 'shared',
      enabledModules: ['dashboard', 'account'],
      customNavItems: [],
    }}
    onSave={save}
    canEdit
  />)

  expect(screen.getByRole('heading', { name: 'Website & marketing' })).toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: /Media Library/i })).not.toBeChecked()
  expect(screen.getByText(/Upload from device or Google Drive, reuse photos and manage albums/)).toBeVisible()

  await user.click(screen.getByRole('checkbox', { name: /Media Library/i }))
  expect(screen.getByRole('checkbox', { name: /Media Library/i })).toBeChecked()

  await user.click(screen.getByRole('button', { name: 'Save navigation settings' }))
  expect(save).toHaveBeenCalledWith(expect.objectContaining({
    enabledModules: expect.arrayContaining(['dashboard', 'account', 'media-library']),
  }))
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
})

it('keeps Settings always available and lets owners untick Media Library', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  const user = userEvent.setup()
  render(<NavigationSettingsSection
    preferences={{
      industry: 'shop',
      labelPolicy: 'shared',
      enabledModules: ['dashboard', 'media-library', 'account'],
      customNavItems: [],
    }}
    onSave={save}
    canEdit
  />)
  const settings = screen.getByRole('checkbox', { name: /Settings/i })
  expect(settings).toBeChecked()
  expect(settings).toBeDisabled()
  expect(screen.getByRole('checkbox', { name: /Media Library/i })).toBeChecked()

  await user.click(screen.getByRole('checkbox', { name: /Media Library/i }))
  await user.click(screen.getByRole('button', { name: 'Save navigation settings' }))
  const selected = save.mock.calls[0][0].enabledModules
  expect(selected).not.toContain('media-library')
  expect(selected).toContain('account')
})
