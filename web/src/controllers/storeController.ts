// web/src/controllers/storeController.ts
import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'
import { FirebaseError } from 'firebase/app'

export type StaffRole = 'owner' | 'staff'

export type ManageStaffAccountPayload = {
  storeId: string
  email: string
  role: StaffRole
  action?: 'invite' | 'reset' | 'deactivate'
  /** Only used when creating a new staff user (server decides). */
  password?: string
}

export type ManageStaffAccountResult = {
  ok: boolean
  storeId: string
  role: StaffRole
  email: string
  uid: string
  created: boolean
  claims?: unknown
}

export type CreateStoreMasterInviteLinkPayload = {
  storeId: string
  role?: StaffRole
  expiresInHours?: number
  maxUses?: number
}

export type CreateStoreMasterInviteLinkResult = {
  ok: boolean
  storeId: string
  inviteToken: string
  inviteUrl: string
  expiresAt: string | null
  maxUses: number | null
}

export type AcceptStoreMasterInvitePayload = {
  tokenOrUrl: string
  childStoreId: string
  confirmOverwrite?: boolean
}

export type AcceptStoreMasterInviteResult = {
  ok: boolean
  parentStoreId: string
  childStoreId: string
  role: StaffRole
  overwritten: boolean
}

function normalizePayload(input: ManageStaffAccountPayload): ManageStaffAccountPayload {
  return {
    storeId: input.storeId.trim(),
    email: input.email.trim().toLowerCase(),
    role: (input.role === 'owner' ? 'owner' : 'staff') as StaffRole,
    action:
      input.action === 'reset' || input.action === 'deactivate' ? input.action : 'invite',
    password: typeof input.password === 'string' && input.password.trim()
      ? input.password.trim()
      : undefined,
  }
}

function friendlyError(err: unknown): Error {
  if (err instanceof FirebaseError) {
    // Common callable errors → friendlier messages
    switch (err.code) {
      case 'functions/permission-denied':
        return new Error('You do not have permission to manage staff for this store.')
      case 'functions/invalid-argument':
        return new Error('The staff details you entered are invalid. Please check and try again.')
      case 'functions/not-found':
        return new Error('The target store was not found.')
      case 'functions/resource-exhausted':
        return new Error('Rate limit reached. Please wait a moment and try again.')
      default:
        // Strip the "Firebase:" prefix if present
        const msg = (err.message || '').replace(/^Firebase:\s*/i, '')
        return new Error(msg || 'Something went wrong while managing the staff account.')
    }
  }
  if (err instanceof Error) return err
  return new Error('Unexpected error while managing the staff account.')
}

export async function manageStaffAccount(payload: ManageStaffAccountPayload): Promise<ManageStaffAccountResult> {
  const clean = normalizePayload(payload)

  try {
    const callable = httpsCallable<ManageStaffAccountPayload, ManageStaffAccountResult>(
      functions,
      'manageStaffAccount',
    )
    const { data } = await callable(clean)

    // Provide a stable shape even if the server omits optional fields
    return {
      ok: data?.ok === true,
      storeId: data?.storeId ?? clean.storeId,
      role: (data?.role === 'owner' ? 'owner' : 'staff') as StaffRole,
      email: (data?.email ?? clean.email).toLowerCase(),
      uid: data?.uid ?? '',
      created: data?.created === true,
      claims: data?.claims,
    }
  } catch (err) {
    throw friendlyError(err)
  }
}

export async function createStoreMasterInviteLink(
  payload: CreateStoreMasterInviteLinkPayload,
): Promise<CreateStoreMasterInviteLinkResult> {
  const callable = httpsCallable<CreateStoreMasterInviteLinkPayload, CreateStoreMasterInviteLinkResult>(
    functions,
    'createStoreMasterInviteLink',
  )

  const clean: CreateStoreMasterInviteLinkPayload = {
    storeId: payload.storeId.trim(),
    role: payload.role === 'owner' ? 'owner' : 'staff',
    expiresInHours:
      typeof payload.expiresInHours === 'number' && Number.isFinite(payload.expiresInHours)
        ? payload.expiresInHours
        : undefined,
    maxUses:
      typeof payload.maxUses === 'number' && Number.isFinite(payload.maxUses)
        ? payload.maxUses
        : undefined,
  }

  try {
    const { data } = await callable(clean)
    return {
      ok: data?.ok === true,
      storeId: data?.storeId ?? clean.storeId,
      inviteToken: data?.inviteToken ?? '',
      inviteUrl: data?.inviteUrl ?? '',
      expiresAt: data?.expiresAt ?? null,
      maxUses: typeof data?.maxUses === 'number' ? data.maxUses : null,
    }
  } catch (error) {
    throw friendlyError(error)
  }
}

export async function acceptStoreMasterInvite(
  payload: AcceptStoreMasterInvitePayload,
): Promise<AcceptStoreMasterInviteResult> {
  const callable = httpsCallable<
    AcceptStoreMasterInvitePayload,
    AcceptStoreMasterInviteResult
  >(functions, 'acceptStoreMasterInvite')

  const clean: AcceptStoreMasterInvitePayload = {
    tokenOrUrl: payload.tokenOrUrl.trim(),
    childStoreId: payload.childStoreId.trim(),
    confirmOverwrite: payload.confirmOverwrite === true,
  }

  try {
    const { data } = await callable(clean)
    return {
      ok: data?.ok === true,
      parentStoreId: data?.parentStoreId ?? '',
      childStoreId: data?.childStoreId ?? clean.childStoreId,
      role: data?.role === 'owner' ? 'owner' : 'staff',
      overwritten: data?.overwritten === true,
    }
  } catch (error) {
    throw friendlyError(error)
  }
}
