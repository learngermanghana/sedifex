import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import StatusBadge, { statusBadgeLabel, statusBadgeTone } from './StatusBadge'

describe('StatusBadge', () => {
  it('distinguishes payment review from booking approval', () => {
    expect(statusBadgeLabel('manual_review', 'payment')).toBe('Awaiting verification')
    expect(statusBadgeLabel('manual_review', 'booking')).toBe('Needs confirmation')
  })

  it('keeps missing workflow data neutral instead of inventing pending state', () => {
    expect(statusBadgeLabel(null, 'payment')).toBe('Payment not recorded')
    expect(statusBadgeTone(null, 'payment')).toBe('neutral')
    expect(statusBadgeLabel(undefined, 'booking')).toBe('Not recorded')
    expect(statusBadgeTone(undefined, 'booking')).toBe('neutral')
  })

  it('keeps common success and cancellation mappings consistent', () => {
    expect(statusBadgeLabel('approved', 'booking')).toBe('Confirmed')
    expect(statusBadgeTone('approved', 'booking')).toBe('success')
    expect(statusBadgeLabel('voided', 'generic')).toBe('Cancelled')
    expect(statusBadgeTone('voided', 'generic')).toBe('danger')
  })

  it('keeps unpaid and partial generic statuses visually actionable', () => {
    expect(statusBadgeLabel('unpaid', 'generic')).toBe('Unpaid')
    expect(statusBadgeTone('unpaid', 'generic')).toBe('warning')
    expect(statusBadgeLabel('partial', 'generic')).toBe('Partial')
    expect(statusBadgeTone('partial', 'generic')).toBe('warning')
    expect(statusBadgeLabel('unpaid', 'payment')).toBe('Payment pending')
    expect(statusBadgeLabel('partial', 'payment')).toBe('Partially paid')
  })

  it('renders the centralized label and tone', () => {
    render(<StatusBadge status="awaiting_verification" kind="payment" />)

    const badge = screen.getByText('Awaiting verification')
    expect(badge).toHaveClass('status-badge--warning')
  })
})
