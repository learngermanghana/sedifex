import React, { useEffect, useMemo, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  type DocumentData,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  type QueryDocumentSnapshot,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import { useToast } from '../components/ToastProvider'
import {
  acceptStoreMasterInvite,
  createStoreMasterInviteLink,
  manageStaffAccount,
  type StaffRole,
} from '../controllers/storeController'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import { useAuthUser } from '../hooks/useAuthUser'
import { useMemberships, type Membership } from '../hooks/useMemberships'
import './StaffManagement.css'

type StaffMember = {
  id: string
  uid: string
  storeId: string | null
  email: string | null
  role: StaffRole
  invitedBy: string | null
  status: string | null
  firstSignupEmail: string | null
  createdAt: Date | null
  updatedAt: Date | null
}

type StaffAuditEntry = {
  id: string
  action: 'invite' | 'reset' | 'deactivate'
  outcome: 'success' | 'failure'
  actorEmail: string | null
  targetEmail: string
  createdAt: Date | null
  errorMessage: string | null
}

function toNullableString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function mapMember(docSnap: QueryDocumentSnapshot<DocumentData>): StaffMember {
  const data = docSnap.data() || {}
  const role: StaffRole = data.role === 'owner' ? 'owner' : 'staff'

  return {
    id: docSnap.id,
    uid: typeof data.uid === 'string' && data.uid.trim() ? data.uid.trim() : docSnap.id,
    storeId: typeof data.storeId === 'string' ? data.storeId : null,
    email: toNullableString(data.email),
    role,
    invitedBy: toNullableString(data.invitedBy),
    status: toNullableString(data.status),
    firstSignupEmail: toNullableString(data.firstSignupEmail),
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : null,
  }
}

function mapAudit(docSnap: QueryDocumentSnapshot<DocumentData>): StaffAuditEntry {
  const data = docSnap.data() || {}
  const action = ['invite', 'reset', 'deactivate'].includes(data.action)
    ? (data.action as StaffAuditEntry['action'])
    : 'invite'
  const outcome = data.outcome === 'failure' ? 'failure' : 'success'

  return {
    id: docSnap.id,
    action,
    outcome,
    actorEmail: toNullableString(data.actorEmail),
    targetEmail: toNullableString(data.targetEmail) ?? 'unknown',
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
    errorMessage: toNullableString(data.errorMessage),
  }
}

function formatDate(value: Date | null) {
  if (!value) return '—'
  try {
    return value.toLocaleString()
  } catch (error) {
    console.warn('[staff] Unable to format date', error)
    return '—'
  }
}

function normalizeEmail(value: string | null | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null
}

type HeadingLevel = 'h1' | 'h2' | 'h3' | 'h4'

type StaffManagementProps = {
  headingLevel?: HeadingLevel
}

export default function StaffManagement({ headingLevel = 'h1' }: StaffManagementProps) {
  const { storeId, isLoading: storeLoading, error: storeError } = useActiveStore()
  const user = useAuthUser()
  const { memberships } = useMemberships()
  const { publish } = useToast()

  const [members, setMembers] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const [audits, setAudits] = useState<StaffAuditEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(false)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Membership['role']>('staff')
  const [invitePassword, setInvitePassword] = useState('')
  const [inviting, setInviting] = useState(false)
  const [linkRole, setLinkRole] = useState<StaffRole>('staff')
  const [linkCreating, setLinkCreating] = useState(false)
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState('')
  const [generatedInviteToken, setGeneratedInviteToken] = useState('')
  const [acceptTokenOrUrl, setAcceptTokenOrUrl] = useState('')
  const [acceptChildStoreId, setAcceptChildStoreId] = useState('')
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)
  const [acceptingLink, setAcceptingLink] = useState(false)

  const activeMembership = useMemo(() => {
    if (!storeId) return null
    return memberships.find(membership => membership.storeId === storeId) ?? null
  }, [memberships, storeId])

  const isOwner = activeMembership?.role === 'owner'
  const masterOwnerEmail = useMemo(() => {
    const ownerMembers = members.filter(member => member.role === 'owner')
    if (ownerMembers.length === 0) return null

    const explicitMasterEmail = ownerMembers
      .map(member => normalizeEmail(member.firstSignupEmail))
      .find(Boolean)
    if (explicitMasterEmail) return explicitMasterEmail

    const earliestOwner = ownerMembers.reduce<StaffMember | null>((currentEarliest, candidate) => {
      if (!currentEarliest) return candidate
      const currentTime = currentEarliest.createdAt?.getTime() ?? Number.POSITIVE_INFINITY
      const candidateTime = candidate.createdAt?.getTime() ?? Number.POSITIVE_INFINITY
      return candidateTime < currentTime ? candidate : currentEarliest
    }, null)

    return normalizeEmail(earliestOwner?.email)
  }, [members])
  const isMasterOwner =
    isOwner && normalizeEmail(user?.email) !== null && normalizeEmail(user?.email) === masterOwnerEmail

  function canDeleteMember(member: StaffMember) {
    if (!isOwner) return false
    const memberEmail = normalizeEmail(member.email)
    if (member.role === 'owner') {
      if (!isMasterOwner) return false
      if (memberEmail && memberEmail === masterOwnerEmail) return false
    }
    return true
  }

  useEffect(() => {
    if (!storeId) return
    setAcceptChildStoreId(storeId)
  }, [storeId])

  useEffect(() => {
    if (!storeId) {
      setMembers([])
      setError(storeError)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    const membersRef = collection(db, 'teamMembers')
    const staffQuery = query(membersRef, where('storeId', '==', storeId))

    getDocs(staffQuery)
      .then(snapshot => {
        if (cancelled) return
        const mapped = snapshot.docs.map(mapMember)
        setMembers(mapped)
        setError(null)
      })
      .catch(err => {
        if (cancelled) return
        console.warn('[staff] Failed to load staff list', err)
        setMembers([])
        setError('We could not load the staff list.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [storeId, storeError, refreshToken])

  useEffect(() => {
    if (!storeId) {
      setAudits([])
      return
    }

    let cancelled = false
    setAuditLoading(true)
    const auditRef = collection(db, 'staffAudit')
    const auditQuery = query(
      auditRef,
      where('storeId', '==', storeId),
      orderBy('createdAt', 'desc'),
      limit(15),
    )

    getDocs(auditQuery)
      .then(snapshot => {
        if (cancelled) return
        setAudits(snapshot.docs.map(mapAudit))
      })
      .catch(err => {
        if (cancelled) return
        console.warn('[staff] Failed to load audit log', err)
        setAudits([])
      })
      .finally(() => {
        if (!cancelled) setAuditLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [storeId, refreshToken])

  async function handleInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!storeId || inviting) return
    if (!isOwner) {
      publish({ message: 'Only owners can save staff.', tone: 'error' })
      return
    }

    const normalizedEmail = inviteEmail.trim().toLowerCase()
    const targetStoreId = storeId
    if (!normalizedEmail) {
      setError('Enter an email to save a staff member.')
      publish({ message: 'Enter an email to save a staff member.', tone: 'error' })
      return
    }
    setInviting(true)
    setError(null)
    try {
      await manageStaffAccount({
        storeId: targetStoreId,
        email: normalizedEmail,
        role: inviteRole,
        action: 'invite',
        password: invitePassword.trim() || undefined,
      })
      publish({
        message: 'Staff member saved.',
        tone: 'success',
      })
      setInviteEmail('')
      setInvitePassword('')
      setInviteRole('staff')
      setRefreshToken(token => token + 1)
    } catch (err) {
      console.warn('[staff] Failed to save staff member', err)
      const message = err instanceof Error ? err.message : 'We could not save the staff member.'
      setError(message)
      publish({ message, tone: 'error' })
    } finally {
      setInviting(false)
    }
  }

  async function handleCreateMasterInviteLink() {
    if (!storeId || linkCreating) return
    if (!isOwner) {
      publish({ message: 'Only owners can create workspace invite links.', tone: 'error' })
      return
    }

    setLinkCreating(true)
    try {
      const result = await createStoreMasterInviteLink({
        storeId,
        role: linkRole,
        maxUses: 1,
        expiresInHours: 72,
      })
      setGeneratedInviteUrl(result.inviteUrl)
      setGeneratedInviteToken(result.inviteToken)
      publish({ message: 'Master invite link created.', tone: 'success' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to create a master invite link.'
      publish({ message, tone: 'error' })
    } finally {
      setLinkCreating(false)
    }
  }

  async function handleAcceptMasterInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!acceptTokenOrUrl.trim()) {
      publish({ message: 'Paste an invite link or token to continue.', tone: 'error' })
      return
    }
    if (!acceptChildStoreId.trim()) {
      publish({ message: 'Select the store you want to link as a sub-store.', tone: 'error' })
      return
    }

    setAcceptingLink(true)
    try {
      const result = await acceptStoreMasterInvite({
        tokenOrUrl: acceptTokenOrUrl,
        childStoreId: acceptChildStoreId.trim(),
        confirmOverwrite,
      })
      publish({
        message: result.overwritten
          ? `Linked to ${result.parentStoreId}. Previous parent was replaced.`
          : `Linked successfully under mother store ${result.parentStoreId}.`,
        tone: 'success',
      })
      setAcceptTokenOrUrl('')
      setConfirmOverwrite(false)
      setRefreshToken(token => token + 1)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to accept invite link.'
      publish({ message, tone: 'error' })
    } finally {
      setAcceptingLink(false)
    }
  }

  async function handleResetPassword(member: StaffMember) {
    if (!storeId) return
    if (!member.email) {
      publish({ message: 'Cannot reset password without an email address.', tone: 'error' })
      return
    }
    if (!isOwner) {
      publish({ message: 'Only owners can reset passwords.', tone: 'error' })
      return
    }

    const nextPassword = window.prompt(
      `Enter a new password for ${member.email}`,
      '',
    )

    if (nextPassword === null) return
    const trimmed = nextPassword.trim()
    if (!trimmed) {
      publish({ message: 'Password cannot be empty.', tone: 'error' })
      return
    }

    try {
      await manageStaffAccount({
        storeId,
        email: member.email,
        role: member.role,
        action: 'reset',
        password: trimmed,
      })
      publish({ message: 'Password reset successfully.', tone: 'success' })
    } catch (err) {
      console.warn('[staff] Failed to reset password', err)
      const message = err instanceof Error ? err.message : 'Unable to reset the password.'
      publish({ message, tone: 'error' })
    }
  }

  async function handleDeactivate(member: StaffMember) {
    if (!storeId) return
    if (!isOwner) {
      publish({ message: 'Only owners can deactivate staff.', tone: 'error' })
      return
    }
    if (!member.email) {
      publish({ message: 'Cannot deactivate a user without an email address.', tone: 'error' })
      return
    }

    const confirmed = window.confirm(`Deactivate ${member.email ?? member.id}?`)
    if (!confirmed) return

    try {
      await manageStaffAccount({
        storeId,
        email: member.email,
        role: member.role,
        action: 'deactivate',
      })
      publish({ message: 'Staff member deactivated.', tone: 'success' })
      setRefreshToken(token => token + 1)
    } catch (err) {
      console.warn('[staff] Failed to deactivate member', err)
      const message = err instanceof Error ? err.message : 'Unable to deactivate this member.'
      publish({ message, tone: 'error' })
    }
  }

  async function handleReactivate(member: StaffMember) {
    if (!member.email || !member.storeId) {
      publish({ message: 'Missing email or Store ID for this member.', tone: 'error' })
      return
    }
    if (!isOwner) {
      publish({ message: 'Only owners can reactivate staff.', tone: 'error' })
      return
    }

    try {
      await manageStaffAccount({
        storeId: member.storeId,
        email: member.email,
        role: member.role,
        action: 'invite',
      })
      publish({ message: 'Staff member reactivated.', tone: 'success' })
      setRefreshToken(token => token + 1)
    } catch (err) {
      console.warn('[staff] Failed to reactivate member', err)
      const message = err instanceof Error ? err.message : 'Unable to reactivate this member.'
      publish({ message, tone: 'error' })
    }
  }

  async function handleDelete(member: StaffMember) {
    if (!isOwner) {
      publish({ message: 'Only owners can delete staff access.', tone: 'error' })
      return
    }
    if (!canDeleteMember(member)) {
      publish({
        message:
          member.role === 'owner'
            ? 'Only the master owner can delete other owner memberships.'
            : 'You cannot delete this member.',
        tone: 'error',
      })
      return
    }
    const memberEmail = normalizeEmail(member.email)
    if (memberEmail && memberEmail === normalizeEmail(user?.email)) {
      publish({ message: 'You cannot delete your own membership from this screen.', tone: 'error' })
      return
    }

    const confirmed = window.confirm(`Delete ${member.email ?? member.id} from this workspace?`)
    if (!confirmed) return

    try {
      await deleteDoc(doc(db, 'teamMembers', member.id))
      await addDoc(collection(db, 'staffAudit'), {
        storeId: member.storeId ?? storeId,
        action: 'deactivate',
        outcome: 'success',
        actorEmail: activeMembership?.email ?? null,
        targetEmail: member.email ?? member.id,
        createdAt: serverTimestamp(),
        deleted: true,
      })
      publish({ message: 'Staff access deleted.', tone: 'success' })
      setRefreshToken(token => token + 1)
    } catch (err) {
      console.warn('[staff] Failed to delete member', err)
      const message = err instanceof Error ? err.message : 'Unable to delete this member.'
      publish({ message, tone: 'error' })
    }
  }

  if (storeError) {
    return <div role="alert">{storeError}</div>
  }

  const Heading = headingLevel as keyof JSX.IntrinsicElements

  if (!storeId && !storeLoading) {
    return (
      <div className="page staff-page" role="status">
        <Heading>Staff management</Heading>
        <p>Select a workspace to manage staff accounts.</p>
      </div>
    )
  }

  return (
    <div className="page staff-page">
      <header className="page__header">
        <div>
          <p className="page__eyebrow">Workspace</p>
          <Heading className="page__title">Staff management</Heading>
          <p className="page__subtitle">
            Add new teammates, reset passwords, or deactivate access.
          </p>
        </div>
      </header>

      {error && (
        <div className="staff-page__error" role="alert">
          {error}
        </div>
      )}

      <section className="card staff-card" aria-labelledby="staff-actions">
        <div className="staff-card__header">
          <div>
            <p className="staff-card__eyebrow">Team actions</p>
            <h2 id="staff-actions">Save staff</h2>
            <p className="staff-card__hint">
              New staff will get an account and team member record automatically.
            </p>
          </div>
        </div>

        <form className="staff-card__form" onSubmit={handleInvite}>
          <label>
            <span>Email</span>
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={event => setInviteEmail(event.target.value)}
              placeholder="teammate@example.com"
              autoComplete="email"
              disabled={!isOwner || inviting}
            />
          </label>

          <label>
            <span>Workspace</span>
            <input
              type="text"
              value={storeId ?? ''}
              autoComplete="off"
              disabled
            />
          </label>

          <label>
            <span>Role</span>
            <select
              value={inviteRole}
              onChange={event => setInviteRole(event.target.value as Membership['role'])}
              disabled={!isOwner || inviting}
            >
              <option value="owner">Owner</option>
              <option value="staff">Staff</option>
            </select>
          </label>

          <label>
            <span>Password (optional)</span>
            <input
              type="password"
              value={invitePassword}
              onChange={event => setInvitePassword(event.target.value)}
              placeholder="Auto-generate if empty"
              autoComplete="new-password"
              disabled={!isOwner || inviting}
            />
          </label>

          <button
            type="submit"
            className="button button--primary"
            disabled={!isOwner || inviting}
            data-testid="invite-staff-button"
          >
            {inviting ? 'Saving…' : 'Save staff'}
          </button>
        </form>

        {!isOwner && (
          <p className="staff-card__hint" role="note">
            Only workspace owners can save staff members.
          </p>
        )}
      </section>

      <section className="card staff-card" aria-labelledby="workspace-linking">
        <div className="staff-card__header">
          <div>
            <p className="staff-card__eyebrow">Workspace linking</p>
            <h2 id="workspace-linking">Master invite links</h2>
            <p className="staff-card__hint">
              Create one link from the mother workspace. Other workspace owners can accept it to become sub-stores.
            </p>
          </div>
        </div>

        <div className="staff-card__form">
          <label>
            <span>Sub-store role after linking</span>
            <select
              value={linkRole}
              onChange={event => setLinkRole(event.target.value === 'owner' ? 'owner' : 'staff')}
              disabled={!isOwner || linkCreating}
            >
              <option value="owner">Admin</option>
              <option value="staff">Staff</option>
            </select>
          </label>

          <button
            type="button"
            className="button button--primary"
            disabled={!isOwner || linkCreating}
            onClick={handleCreateMasterInviteLink}
          >
            {linkCreating ? 'Creating link…' : 'Create master invite link'}
          </button>

          {generatedInviteUrl && (
            <label>
              <span>Share this link</span>
              <input type="text" readOnly value={generatedInviteUrl} />
            </label>
          )}
          {generatedInviteToken && (
            <p className="staff-card__hint">Backup token: {generatedInviteToken}</p>
          )}
        </div>

        <form className="staff-card__form" onSubmit={handleAcceptMasterInvite}>
          <label>
            <span>Invite link or token</span>
            <input
              type="text"
              value={acceptTokenOrUrl}
              onChange={event => setAcceptTokenOrUrl(event.target.value)}
              placeholder="Paste invite URL or token"
              disabled={acceptingLink}
              required
            />
          </label>

          <label>
            <span>Store to link as sub-store</span>
            <input
              type="text"
              value={acceptChildStoreId}
              onChange={event => setAcceptChildStoreId(event.target.value)}
              placeholder="your-store-id"
              disabled={acceptingLink}
              required
            />
          </label>

          <label>
            <span>Overwrite current mother store (if linked)</span>
            <input
              type="checkbox"
              checked={confirmOverwrite}
              onChange={event => setConfirmOverwrite(event.target.checked)}
              disabled={acceptingLink}
            />
          </label>

          <button type="submit" className="button button--ghost" disabled={acceptingLink}>
            {acceptingLink ? 'Linking workspace…' : 'Accept master invite'}
          </button>
        </form>
      </section>

      <section className="card staff-card" aria-labelledby="staff-list">
        <div className="staff-card__header">
          <div>
            <p className="staff-card__eyebrow">Team roster</p>
            <h2 id="staff-list">Current staff</h2>
            <p className="staff-card__hint">Filtered by this workspace ID.</p>
          </div>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => setRefreshToken(token => token + 1)}
            disabled={loading}
          >
            Refresh
          </button>
        </div>

        <div className="staff-table staff-table--roster" role="table" aria-label="Staff list">
          <div className="staff-table__row staff-table__header" role="row">
            <span role="columnheader" className="staff-table__email">Email</span>
            <span role="columnheader">Role</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Updated</span>
            <span role="columnheader" className="staff-table__actions">Actions</span>
          </div>

          {members.length === 0 && !loading ? (
            <div className="staff-table__row" role="row">
              <span role="cell" className="staff-table__empty">
                No staff found for this workspace.
              </span>
            </div>
          ) : (
            members.map(member => (
              <div
                className="staff-table__row"
                role="row"
                key={member.id}
                data-testid={`staff-member-${member.id}`}
              >
                <span role="cell" className="staff-table__email" data-label="Email">
                  {member.email ?? '—'}
                </span>
                <span role="cell" data-label="Role">{member.role === 'owner' ? 'Owner' : 'Staff'}</span>
                <span role="cell" data-label="Status">
                  {member.status ? (
                    <span className="staff-table__status" data-variant={member.status}>
                      {member.status}
                    </span>
                  ) : (
                    'Active'
                  )}
                </span>
                <span role="cell" data-label="Updated">
                  {formatDate(member.updatedAt ?? member.createdAt)}
                </span>
                <span role="cell" className="staff-table__actions" data-label="Actions">
                  <button
                    type="button"
                    className="button button--ghost button--small"
                    onClick={() => handleResetPassword(member)}
                    disabled={!isOwner}
                  >
                    Reset password
                  </button>
                  <button
                    type="button"
                    className="button button--ghost button--small"
                    onClick={() => handleDeactivate(member)}
                    disabled={!isOwner}
                  >
                    Deactivate
                  </button>
                  <button
                    type="button"
                    className="button button--ghost button--small"
                    onClick={() => handleReactivate(member)}
                    disabled={!isOwner || member.status === 'active'}
                  >
                    Reactivate
                  </button>
                  <button
                    type="button"
                    className="button button--danger button--small"
                    onClick={() => handleDelete(member)}
                    disabled={!canDeleteMember(member)}
                  >
                    Delete
                  </button>
                </span>
              </div>
            ))
          )}
        </div>

        {loading && (
          <p className="staff-card__hint" role="status">
            Loading staff…
          </p>
        )}
      </section>

      <section className="card staff-card" aria-labelledby="staff-audit">
        <div className="staff-card__header">
          <div>
            <p className="staff-card__eyebrow">Audit trail</p>
            <h2 id="staff-audit">Recent staff changes</h2>
            <p className="staff-card__hint">
              Read-only log of recent additions, resets, and deactivations for this workspace.
            </p>
          </div>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => setRefreshToken(token => token + 1)}
            disabled={auditLoading}
          >
            Refresh
          </button>
        </div>

        <div className="staff-table" role="table" aria-label="Staff audit log">
          <div className="staff-table__row staff-table__header" role="row">
            <span role="columnheader">When</span>
            <span role="columnheader">Action</span>
            <span role="columnheader">Target</span>
            <span role="columnheader">By</span>
            <span role="columnheader">Outcome</span>
          </div>

          {audits.length === 0 && !auditLoading ? (
            <div className="staff-table__row" role="row">
              <span role="cell" className="staff-table__empty">
                No recent staff changes recorded.
              </span>
            </div>
          ) : (
            audits.map(entry => (
              <div className="staff-table__row" role="row" key={entry.id}>
                <span role="cell" data-label="When">{formatDate(entry.createdAt)}</span>
                <span role="cell" data-label="Action">{entry.action}</span>
                <span role="cell" data-label="Target">{entry.targetEmail}</span>
                <span role="cell" data-label="By">{entry.actorEmail ?? '—'}</span>
                <span role="cell" data-label="Outcome">
                  <span
                    className="staff-table__status"
                    data-variant={entry.outcome === 'success' ? 'active' : 'inactive'}
                  >
                    {entry.outcome === 'success' ? 'Success' : 'Failed'}
                  </span>
                  {entry.errorMessage && (
                    <span className="staff-card__hint">{entry.errorMessage}</span>
                  )}
                </span>
              </div>
            ))
          )}
        </div>

        {auditLoading && (
          <p className="staff-card__hint" role="status">
            Loading audit history…
          </p>
        )}
      </section>
    </div>
  )
}
