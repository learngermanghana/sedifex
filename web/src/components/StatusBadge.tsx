import { bookingPresentation, paymentPresentation } from '../lib/recordStatus'
import React from 'react'
import './StatusBadge.css'

type StatusBadgeKind = 'booking' | 'payment' | 'generic'
type StatusTone = 'neutral' | 'warning' | 'success' | 'danger'

type StatusPresentation = {
  label: string
  tone: StatusTone
}

const SHARED_STATUS_PRESENTATIONS: Record<string, StatusPresentation> = {
  paid: { label: 'Paid', tone: 'success' },
  success: { label: 'Paid', tone: 'success' },
  settled: { label: 'Paid', tone: 'success' },
  confirmed: { label: 'Confirmed', tone: 'success' },
  approved: { label: 'Confirmed', tone: 'success' },
  completed: { label: 'Completed', tone: 'success' },
  complete: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
  canceled: { label: 'Cancelled', tone: 'danger' },
  deleted: { label: 'Cancelled', tone: 'danger' },
  void: { label: 'Cancelled', tone: 'danger' },
  voided: { label: 'Cancelled', tone: 'danger' },
  rejected: { label: 'Cancelled', tone: 'danger' },
  pending_approval: { label: 'Needs approval', tone: 'warning' },
  manual_review: { label: 'Needs approval', tone: 'warning' },
  awaiting_verification: { label: 'Needs approval', tone: 'warning' },
  review: { label: 'Needs approval', tone: 'warning' },
  needs_approval: { label: 'Needs approval', tone: 'warning' },
  pending: { label: 'Needs approval', tone: 'warning' },
  payment_pending: { label: 'Needs approval', tone: 'warning' },
  partial: { label: 'Partial', tone: 'warning' },
  unpaid: { label: 'Unpaid', tone: 'warning' },
}

function normalize(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[\s-]+/g, '_')
    : ''
}

export function statusBadgePresentation(value: unknown, kind: StatusBadgeKind = 'generic'): StatusPresentation {
  const status = normalize(value)

  if (!status) {
    return {
      label: kind === 'payment' ? 'Payment not recorded' : 'Not recorded',
      tone: 'neutral',
    }
  }

  if (kind === 'payment') return paymentPresentation({ paymentStatus: status })
  if (kind === 'booking') return bookingPresentation({ bookingStatus: status })

  const shared = SHARED_STATUS_PRESENTATIONS[status]
  if (shared) return shared

  return {
    label: status.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()),
    tone: 'neutral',
  }
}

export function statusBadgeLabel(value: unknown, kind: StatusBadgeKind = 'generic'): string {
  return statusBadgePresentation(value, kind).label
}

export function statusBadgeTone(value: unknown, kind: StatusBadgeKind = 'generic'): StatusTone {
  return statusBadgePresentation(value, kind).tone
}

export default function StatusBadge({
  status,
  kind = 'generic',
  className = '',
}: {
  status: unknown
  kind?: StatusBadgeKind
  className?: string
}) {
  const presentation = statusBadgePresentation(status, kind)
  return (
    <span className={`status-badge status-badge--${presentation.tone}${className ? ` ${className}` : ''}`}>
      {presentation.label}
    </span>
  )
}
