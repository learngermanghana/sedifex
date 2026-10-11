import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import NavigationSettingsSection from './NavigationSettingsSection'

it('searches pages without losing selected modules and reports save failures', async () => {
  const save = vi.fn().mockRejectedValue(new Error('Save failed'))
  render(<NavigationSettingsSection preferences={{ industry: 'shop', enabledModules: ['account'], customNavItems: [] }} onSave={save} canEdit />)
  const user = userEvent.setup()
  await user.type(screen.getByRole('searchbox', { name: 'Find a page' }), 'Bookings')
  expect(screen.queryByText('Business account')).toBeNull()
  await user.click(screen.getByRole('checkbox'))
  await user.click(screen.getByRole('button', { name: 'Save navigation settings' }))
  expect(save.mock.calls[0][0].enabledModules).toContain('bookings')
  expect(save.mock.calls[0][0].enabledModules).toContain('account')
  expect(await screen.findByText('Save failed')).toBeVisible()
})
