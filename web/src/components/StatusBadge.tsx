import React from 'react'
import './StatusBadge.css'

type StatusBadgeKind = 'booking' | 'payment' | 'generic'
type StatusTone = 'neutral' | 'warning' | 'success' | 'danger'

function normalize(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[\s-]+/g, '_')
    : ''
}

export function statusBadgeLabel(value: unknown, kind: StatusBadgeKind = 'generic'): string {
  const status = normalize(value)

  if (['paid', 'success', 'settled'].includes(status)) return 'Paid'
  if (['confirmed', 'approved'].includes(status)) return 'Confirmed'
  if (['completed', 'complete'].includes(status)) return 'Completed'
  if (['cancelled', 'canceled', 'deleted', 'void', 'voided', 'rejected'].includes(status)) return 'Cancelled'

  if (kind === 'payment' && ['manual_review', 'awaiting_verification', 'review'].includes(status)) {
    return 'Payment review'
  }

  if (['pending_approval', 'manual_review', 'awaiting_verification', 'review', 'needs_approval'].includes(status)) {
    return 'Needs approval'
  }

  if (kind === 'payment' && ['pending', 'payment_pending', 'partial', 'unpaid'].includes(status)) {
    return 'Payment pending'
  }

  if (['pending', 'payment_pending'].includes(status)) {
    return kind === 'payment' ? 'Payment pending' : 'Needs approval'
  }

  if (!status) return kind === 'payment' ? 'Payment pending' : 'Needs approval'
  return status.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

function statusTone(value: unknown, kind: StatusBadgeKind): StatusTone {
  const status = normalize(value)
  if (['cancelled', 'canceled', 'deleted', 'void', 'voided', 'rejected'].includes(status)) return 'danger'
  if (['paid', 'success', 'settled', 'confirmed', 'approved', 'completed', 'complete'].includes(status)) return 'success'
  if (
    ['pending', 'pending_approval', 'payment_pending', 'partial', 'unpaid', 'manual_review', 'awaiting_verification', 'review', 'needs_approval'].includes(status)
    || !status
  ) return 'warning'
  return kind === 'payment' ? 'warning' : 'neutral'
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
  const tone = statusTone(status, kind)
  return (
    <span className={`status-badge status-badge--${tone}${className ? ` ${className}` : ''}`}>
      {statusBadgeLabel(status, kind)}
    </span>
  )
}
