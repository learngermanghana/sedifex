import { useState } from 'react'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import CatalogPricesEditor, { emptyPrice, type PriceDraft } from './CatalogPricesEditor'
import { normalizeCatalogPrices } from '../../../shared/catalogPrices'

function Harness({ initial = [emptyPrice()] }: { initial?: PriceDraft[] }) {
  const [prices, setPrices] = useState(initial)
  const [saved, setSaved] = useState('')
  return <form onSubmit={event => { event.preventDefault(); setSaved(JSON.stringify(normalizeCatalogPrices(prices, true))) }}>
    <CatalogPricesEditor prices={prices} onChange={setPrices} />
    <button type="submit">Save</button><output aria-label="Saved prices">{saved}</output>
  </form>
}

describe('manual currency prices', () => {
  it('adds USD and custom prices, prevents duplicate selection and removes a row', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await act(async () => { await user.type(screen.getByLabelText('Price'), '500') })
    await act(async () => { await user.click(screen.getByRole('button', { name: '+ Add price' })) })
    expect(screen.getAllByLabelText('Currency')[1]).toHaveValue('USD')
    expect(within(screen.getAllByLabelText('Currency')[1]).getByRole('option', { name: /GHS/ })).toBeDisabled()
    await act(async () => { await user.type(screen.getAllByLabelText('Price')[1], '40') })
    await act(async () => { await user.click(screen.getByRole('button', { name: '+ Add price' })) })
    await act(async () => { await user.selectOptions(screen.getAllByLabelText('Currency')[2], 'custom') })
    await act(async () => { await user.type(screen.getByLabelText('Currency name'), 'CFA Franc') })
    await act(async () => { await user.type(screen.getByLabelText('Code'), 'xof') })
    await act(async () => { await user.type(screen.getByLabelText('Symbol'), 'CFA') })
    await act(async () => { await user.type(screen.getAllByLabelText('Price')[2], '25000') })
    await act(async () => { await user.click(screen.getByRole('button', { name: 'Save' })) })
    const saved = JSON.parse(screen.getByLabelText('Saved prices').textContent!)
    expect(saved.map(row => [row.currencyCode, row.amount])).toEqual([['GHS', 500], ['USD', 40], ['XOF', 25000]])
    await act(async () => { await user.click(screen.getByRole('button', { name: 'Remove price 2' })) })
    await act(async () => { await user.click(screen.getByRole('button', { name: 'Save' })) })
    expect(JSON.parse(screen.getByLabelText('Saved prices').textContent!).map(row => row.currencyCode)).toEqual(['GHS', 'XOF'])
  })

  it('reopens saved custom metadata and permits an explicit zero price', async () => {
    const user = userEvent.setup()
    render(<Harness initial={[{ currencyCode: 'XOF', currencyName: 'CFA Franc', symbol: 'CFA', custom: true, amount: '0' }]} />)
    expect(screen.getByLabelText('Code')).toHaveValue('XOF')
    expect(screen.queryByRole('button', { name: /Remove price/ })).not.toBeInTheDocument()
    await act(async () => { await user.click(screen.getByRole('button', { name: 'Save' })) })
    expect(JSON.parse(screen.getByLabelText('Saved prices').textContent!)[0].amount).toBe(0)
  })
})
