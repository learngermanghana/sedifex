import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import PageSection from '../layout/PageSection'
import { db, functions } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import { useWorkspaceIdentity } from '../hooks/useWorkspaceIdentity'

type Customer = {
  id: string
  name?: string
  displayName?: string
  email?: string
  updatedAt?: unknown
  createdAt?: unknown
}

type SendResult = {
  ok?: boolean
  attempted?: number
  sent?: number
  failed?: number
  queuedForRetry?: number
  error?: string
  [key: string]: unknown
}

type SendBulkEmailPayload = {
  storeId: string
  fromName: string
  subject: string
  html: string
  recipients: Array<{ id: string; name: string; email: string }>
}

function getCustomerName(customer: Pick<Customer, 'displayName' | 'name' | 'email'>) {
  const displayName = customer.displayName?.trim()
  if (displayName) return displayName
  const name = customer.name?.trim()
  if (name) return name
  const email = customer.email?.trim()
  if (email) return email
  return 'Unknown customer'
}

export default function BulkEmail() {
  const { storeId } = useActiveStore()
  const { name: workspaceName } = useWorkspaceIdentity()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [fromName, setFromName] = useState(workspaceName || 'Sedifex Campaign')
  const [subject, setSubject] = useState('')
  const [html, setHtml] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoadingIntegration, setIsLoadingIntegration] = useState(false)
  const [integrationError, setIntegrationError] = useState<string>('')
  const [isSending, setIsSending] = useState(false)
  const [sendStatus, setSendStatus] = useState<string>('')
  const [sendError, setSendError] = useState<string>('')
  const [sendResult, setSendResult] = useState<SendResult | null>(null)
  const sendBulkEmail = useMemo(
    () => httpsCallable<SendBulkEmailPayload, SendResult>(functions, 'sendBulkEmail'),
    [],
  )

  useEffect(() => {
    if (!workspaceName) return
    setFromName(prev => (prev ? prev : workspaceName))
  }, [workspaceName])

  useEffect(() => {
    if (!storeId) {
      setFromName(workspaceName || 'Sedifex Campaign')
      return
    }

    let cancelled = false

    async function loadIntegrationSettings() {
      setIsLoadingIntegration(true)
      setIntegrationError('')
      try {
        const snapshot = await getDoc(doc(db, 'stores', storeId))
        if (cancelled) return

        if (!snapshot.exists()) {
          setIntegrationError('Workspace not found. Open Account → Integrations to reconnect email settings.')
          return
        }

        const data = snapshot.data() as Record<string, unknown>
        const bulkEmailIntegration =
          data.bulkEmailIntegration && typeof data.bulkEmailIntegration === 'object'
            ? (data.bulkEmailIntegration as Record<string, unknown>)
            : {}

        const savedWebAppUrl =
          typeof bulkEmailIntegration.webAppUrl === 'string' ? bulkEmailIntegration.webAppUrl.trim() : ''
        const savedSharedToken = typeof bulkEmailIntegration.sharedToken === 'string'
          ? bulkEmailIntegration.sharedToken.trim()
          : ''
        const savedFromName =
          typeof bulkEmailIntegration.fromName === 'string' ? bulkEmailIntegration.fromName.trim() : ''

        setFromName(savedFromName || workspaceName || 'Sedifex Campaign')

        if (!savedWebAppUrl || !savedSharedToken) {
          setIntegrationError('Email integration is incomplete. Open Account → Integrations → Email delivery.')
        }
      } catch (error) {
        if (cancelled) return
        console.error('[bulk-email] Failed to load email integration settings', error)
        setIntegrationError('Unable to load email integration settings. Open Account → Integrations.')
      } finally {
        if (!cancelled) setIsLoadingIntegration(false)
      }
    }

    void loadIntegrationSettings()

    return () => {
      cancelled = true
    }
  }, [storeId, workspaceName])

  useEffect(() => {
    if (!storeId) {
      setCustomers([])
      setSelectedIds(new Set())
      return undefined
    }

    const customerQuery = query(
      collection(db, 'customers'),
      where('storeId', '==', storeId),
      orderBy('updatedAt', 'desc'),
      orderBy('createdAt', 'desc'),
      limit(500),
    )

    const unsubscribe = onSnapshot(customerQuery, snapshot => {
      const rows = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Customer, 'id'>),
      }))
      setCustomers(rows)
    })

    return () => unsubscribe()
  }, [storeId])

  const emailCustomers = useMemo(
    () =>
      customers.filter(customer => {
        const email = customer.email?.trim()
        return Boolean(email)
      }),
    [customers],
  )

  const filteredCustomers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return emailCustomers
    return emailCustomers.filter(customer => {
      const text = `${getCustomerName(customer)} ${customer.email || ''}`.toLowerCase()
      return text.includes(term)
    })
  }, [emailCustomers, searchTerm])

  const selectedCustomers = useMemo(
    () => emailCustomers.filter(customer => selectedIds.has(customer.id)),
    [emailCustomers, selectedIds],
  )

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectAllFiltered = () => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      filteredCustomers.forEach(customer => next.add(customer.id))
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  const handleSend = async () => {
    setSendStatus('')
    setSendError('')
    setSendResult(null)

    if (!storeId) {
      setSendError('Workspace is missing. Refresh and try again.')
      return
    }
    if (!subject.trim()) {
      setSendError('Enter an email subject.')
      return
    }
    if (!html.trim()) {
      setSendError('Enter an email message.')
      return
    }
    if (!selectedCustomers.length) {
      setSendError('Select at least one customer with an email address.')
      return
    }

    setIsSending(true)

    try {
      const payload = {
        storeId,
        fromName: fromName.trim() || 'Sedifex Campaign',
        subject: subject.trim(),
        html: html.trim(),
        recipients: selectedCustomers.map(customer => ({
          id: customer.id,
          name: getCustomerName(customer),
          email: customer.email?.trim() || '',
        })),
      }

      const response = await sendBulkEmail(payload)
      const body = (response.data ?? {}) as SendResult

      if (body.ok === false) {
        const errorMessage = typeof body.error === 'string' ? body.error : 'send-failed'
        setSendError(errorMessage)
        setSendResult(body)
        return
      }

      setSendResult(body)
      setSendStatus('Campaign sent to Apps Script endpoint successfully.')
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Unable to send campaign.')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <PageSection
      title="Bulk email"
      subtitle="Compose and send your campaign from here. Integration settings are now managed under Account → Integrations."
    >
      <div className="card" style={{ display: 'grid', gap: 16 }}>
        <h3 className="card__title">In-app email composer</h3>
        <p style={{ margin: 0 }}>
          Write your message here, choose recipients, then send directly to your configured Google Apps Script endpoint.
        </p>

        <div
          style={{
            border: '1px solid var(--line, #d8deeb)',
            borderRadius: 12,
            padding: 14,
            background: 'var(--panel-muted, #f6f8fd)',
            display: 'grid',
            gap: 8,
          }}
        >
          <p style={{ margin: 0 }}>
            <strong>Delivery setup:</strong> Account → Integrations → Email delivery.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link className="button button--ghost" to="/account">
              Open integrations
            </Link>
            <Link className="button button--ghost" to="/docs/bulk-email-google-sheets-guide">
              Open setup guide
            </Link>
          </div>
          {isLoadingIntegration ? <p style={{ margin: 0 }}>Loading integration settings…</p> : null}
          {integrationError ? <p style={{ margin: 0, color: 'var(--danger, #b3261e)' }}>{integrationError}</p> : null}
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>From name</span>
            <input
              type="text"
              value={fromName}
              onChange={event => setFromName(event.target.value)}
              placeholder="Sedifex Campaign"
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Email subject</span>
            <input
              type="text"
              value={subject}
              onChange={event => setSubject(event.target.value)}
              placeholder="Big weekend offer for loyal customers"
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Email content (HTML or plain text)</span>
            <textarea
              rows={8}
              value={html}
              onChange={event => setHtml(event.target.value)}
              placeholder="<h1>Hi {{name}}</h1><p>Thanks for shopping with us...</p>"
            />
          </label>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <strong>Recipients</strong>
            <span>
              {selectedCustomers.length} selected / {emailCustomers.length} with email
            </span>
          </div>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Search customers</span>
            <input
              type="search"
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              placeholder="Search name or email"
            />
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="button button--secondary" onClick={selectAllFiltered}>
              Select all filtered
            </button>
            <button type="button" className="button button--ghost" onClick={clearSelection}>
              Clear selection
            </button>
          </div>
          <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid var(--line, #d8deeb)', borderRadius: 10 }}>
            {filteredCustomers.length === 0 ? (
              <p style={{ margin: 0, padding: 12 }}>No customers with email match your search.</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {filteredCustomers.map(customer => {
                  const isSelected = selectedIds.has(customer.id)
                  return (
                    <li key={customer.id} style={{ borderBottom: '1px solid var(--line, #d8deeb)', padding: '10px 12px' }}>
                      <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(customer.id)}
                        />
                        <span>
                          <strong>{getCustomerName(customer)}</strong>
                          <br />
                          <span>{customer.email?.trim() || 'No email'}</span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="button button--primary" onClick={handleSend} disabled={isSending}>
            {isSending ? 'Sending…' : 'Send bulk email'}
          </button>
          <Link className="button button--ghost" to="/customers">
            Manage customers
          </Link>
        </div>

        {sendStatus ? <p style={{ margin: 0, color: 'var(--success, #137333)' }}>{sendStatus}</p> : null}
        {sendError ? <p style={{ margin: 0, color: 'var(--danger, #b3261e)' }}>{sendError}</p> : null}
        {sendResult ? (
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(sendResult, null, 2)}
          </pre>
        ) : null}
      </div>
    </PageSection>
  )
}
