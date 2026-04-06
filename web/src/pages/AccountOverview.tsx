// web/src/pages/AccountOverview.tsx
import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { FirebaseError } from 'firebase/app'
import { httpsCallable } from 'firebase/functions'
import {
  addDoc,
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  setDoc,
  serverTimestamp,
  type DocumentData,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { deleteUser } from 'firebase/auth'
import { db, functions } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import { useMemberships, type Membership } from '../hooks/useMemberships'
import { useToast } from '../components/ToastProvider'
import { useAuthUser } from '../hooks/useAuthUser'
import { AccountBillingSection } from '../components/AccountBillingSection'
import { deleteWorkspaceData } from '../controllers/dataDeletion'
import { getStoreIdFromRecord } from '../utils/storeId'
import { buildPromoSlug } from '../utils/promoSlug'
import {
  ProductImageUploadError,
  deleteUploadedImageByUrl,
  uploadProductImage,
} from '../api/productImageUpload'
import './AccountOverview.css'

type StoreProfile = {
  name: string | null
  displayName: string | null
  email: string | null
  ownerEmail: string | null // ✅ NEW: owner email (source of truth for billing)
  phone: string | null
  status: string | null
  contractStatus: string | null
  billingPlan: string | null
  paymentProvider: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  region: string | null
  postalCode: string | null
  country: string | null
  logoUrl: string | null
  logoAlt: string | null
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
  // 🔹 Billing/trial fields
  trialEndsAt: Timestamp | null
  // 🔹 Upcoming promo fields
  promoEnabled: boolean
  promoTitle: string | null
  promoSummary: string | null
  promoStartDate: string | null
  promoEndDate: string | null
  promoSlug: string | null
  promoWebsiteUrl: string | null
  promoImageUrl: string | null
  promoImageAlt: string | null
}

type SubscriptionProfile = {
  status: string | null
  plan: string | null
  provider: string | null
  currentPeriodStart: Timestamp | null
  currentPeriodEnd: Timestamp | null
  lastPaymentAt: Timestamp | null
  receiptUrl: string | null
}

type RosterMember = {
  id: string
  uid: string
  storeId: string | null
  email: string | null
  role: Membership['role']
  invitedBy: string | null
  status: string | null
  phone: string | null
  firstSignupEmail: string | null
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
}

type IntegrationApiKey = {
  id: string
  name: string
  status: 'active' | 'revoked'
  keyPreview: string
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
  revokedAt: Timestamp | null
  lastUsedAt: Timestamp | null
}

type PromoGalleryDraftItem = {
  id: string
  url: string
  alt: string
  caption: string
  sortOrder: number
  isPublished: boolean
}

const MAX_PROMO_GALLERY_ITEMS = 3
const EXACT_UPLOAD_LIMIT_HINT = 'Maximum upload size is 5 MB (5,242,880 bytes).'

function toNullableString(value: unknown) {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function buildStableStoreImagePath(storeId: string, imageType: 'promo' | 'logo'): string {
  return `stores/${storeId}/${imageType}.jpg`
}

function buildPromoGalleryImagePath(storeId: string, itemId: string): string {
  const safeItemId = itemId.replace(/[^a-zA-Z0-9_-]/g, '_')
  return `stores/${storeId}/promo-gallery/${safeItemId}.jpg`
}

function buildUploadErrorMessage(error: unknown): string {
  if (error instanceof ProductImageUploadError) {
    return `${error.message} ${EXACT_UPLOAD_LIMIT_HINT}`.trim()
  }
  return `Image upload failed. ${EXACT_UPLOAD_LIMIT_HINT} Please try again.`
}

function isTimestamp(value: unknown): value is Timestamp {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Timestamp).toDate === 'function'
  )
}

function mapStoreSnapshot(
  snapshot:
    | DocumentSnapshot<DocumentData>
    | QueryDocumentSnapshot<DocumentData>
    | null,
): StoreProfile | null {
  if (!snapshot) return null
  const data = snapshot.data() || {}
  const billingRaw = (data.billing ?? {}) as Record<string, unknown>

  const billingStatus = toNullableString(billingRaw.status)
  const paymentStatus = toNullableString(
    (data as { paymentStatus?: unknown }).paymentStatus,
  )

  let billingPlan =
    toNullableString((data as { billingPlan?: unknown }).billingPlan) ??
    toNullableString((data as { planKey?: unknown }).planKey) ??
    toNullableString(billingRaw.planKey)

  if (billingStatus === 'trial' || paymentStatus === 'trial') {
    billingPlan = 'trial'
  }

  const paymentProvider =
    toNullableString((data as { paymentProvider?: unknown }).paymentProvider) ??
    toNullableString(billingRaw.provider) ??
    'Paystack'

  const contractStatus =
    toNullableString((data as { contractStatus?: unknown }).contractStatus) ??
    billingStatus ??
    toNullableString(data.status)

  // 🔹 Trial end from billing (supports trialEndsAt/trialEnd)
  const trialEndsRaw =
    (billingRaw.trialEndsAt as unknown) ?? (billingRaw.trialEnd as unknown)
  const trialEndsAt = isTimestamp(trialEndsRaw) ? trialEndsRaw : null

  // ✅ Prefer stores.ownerEmail for billing; fallback to stores.email
  const ownerEmail =
    toNullableString((data as any).ownerEmail) ?? toNullableString(data.email)

  return {
    name: toNullableString(data.name),
    displayName: toNullableString(data.displayName),
    email: toNullableString(data.email),
    ownerEmail,
    phone: toNullableString(data.phone),
    status: toNullableString(data.status),
    contractStatus,
    billingPlan,
    paymentProvider,
    addressLine1: toNullableString(data.addressLine1),
    addressLine2: toNullableString(data.addressLine2),
    city: toNullableString(data.city),
    region: toNullableString(data.region),
    postalCode: toNullableString(data.postalCode),
    country: toNullableString(data.country),
    logoUrl: toNullableString((data as any).logoUrl),
    logoAlt: toNullableString((data as any).logoAlt),
    createdAt: isTimestamp(data.createdAt) ? data.createdAt : null,
    updatedAt: isTimestamp(data.updatedAt) ? data.updatedAt : null,
    trialEndsAt,
    promoTitle: toNullableString((data as any).promoTitle),
    promoEnabled: (data as any).promoEnabled === true,
    promoSummary: toNullableString((data as any).promoSummary),
    promoStartDate: toNullableString((data as any).promoStartDate),
    promoEndDate: toNullableString((data as any).promoEndDate),
    promoSlug: toNullableString((data as any).promoSlug),
    promoWebsiteUrl: toNullableString((data as any).promoWebsiteUrl),
    promoImageUrl: toNullableString((data as any).promoImageUrl),
    promoImageAlt: toNullableString((data as any).promoImageAlt),
  }
}

function mapSubscriptionSnapshot(
  snapshot:
    | DocumentSnapshot<DocumentData>
    | QueryDocumentSnapshot<DocumentData>
    | null,
): SubscriptionProfile | null {
  if (!snapshot) return null
  const data = snapshot.data() || {}

  return {
    status: toNullableString(data.status),
    plan: toNullableString(data.plan),
    provider: toNullableString(data.provider) ?? 'Paystack',
    currentPeriodStart: isTimestamp(data.currentPeriodStart)
      ? data.currentPeriodStart
      : null,
    currentPeriodEnd: isTimestamp(data.currentPeriodEnd)
      ? data.currentPeriodEnd
      : null,
    lastPaymentAt: isTimestamp(data.lastPaymentAt) ? data.lastPaymentAt : null,
    receiptUrl: toNullableString(data.receiptUrl),
  }
}

function mapRosterSnapshot(snapshot: QueryDocumentSnapshot<DocumentData>): RosterMember {
  const data = snapshot.data() || {}
  const role: Membership['role'] = data.role === 'owner' ? 'owner' : 'staff'
  const uid =
    typeof data.uid === 'string' && data.uid.trim() ? data.uid : snapshot.id

  const storeId = getStoreIdFromRecord(data)

  return {
    id: snapshot.id,
    uid,
    storeId,
    email: toNullableString(data.email),
    role,
    invitedBy: toNullableString(data.invitedBy),
    status: toNullableString(data.status),
    phone: toNullableString(data.phone),
    firstSignupEmail: toNullableString(data.firstSignupEmail),
    createdAt: isTimestamp(data.createdAt) ? data.createdAt : null,
    updatedAt: isTimestamp(data.updatedAt) ? data.updatedAt : null,
  }
}

function formatValue(value: string | null) {
  return value ?? '—'
}

function formatTimestamp(timestamp: Timestamp | null) {
  if (!timestamp) return '—'
  try {
    return timestamp
      .toDate()
      .toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch (error) {
    console.warn('Unable to render timestamp', error)
    return '—'
  }
}

function formatStatus(status: string | null) {
  if (!status || status === 'active') return 'Active'
  if (status === 'pending') return 'Pending approval'
  if (status === 'inactive') return 'Inactive'
  return status
}

type HeadingLevel = 'h1' | 'h2' | 'h3' | 'h4'

type AccountOverviewProps = {
  headingLevel?: HeadingLevel
  viewMode?: 'full' | 'promotions'
}

type AccountTab = 'workspace' | 'integrations' | 'promotions' | 'operations'
type PublicPageTab = 'overview' | 'promo' | 'gallery' | 'website-sync'
type PromoGalleryTab = 'upload' | 'view'

export default function AccountOverview({
  headingLevel = 'h1',
  viewMode = 'full',
}: AccountOverviewProps) {
  const { storeId, isLoading: storeLoading, error: storeError } = useActiveStore()
  const {
    memberships,
    loading: membershipsLoading,
    error: membershipsError,
  } = useMemberships()
  const { publish } = useToast()
  const user = useAuthUser()

  const [profile, setProfile] = useState<StoreProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  const [subscriptionProfile, setSubscriptionProfile] =
    useState<SubscriptionProfile | null>(null)
  const [subscriptionLoading, setSubscriptionLoading] = useState(false)
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null)

  const [roster, setRoster] = useState<RosterMember[]>([])
  const [rosterLoading, setRosterLoading] = useState(false)
  const [rosterError, setRosterError] = useState<string | null>(null)
  const [pendingActionId, setPendingActionId] = useState<string | null>(null)
  const [isDeletingWorkspace, setIsDeletingWorkspace] = useState(false)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)

  const [profileDraft, setProfileDraft] = useState({
    displayName: '',
    email: '',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    region: '',
    postalCode: '',
    country: '',
    logoUrl: '',
    logoAlt: '',
  })
  const [logoImageFile, setLogoImageFile] = useState<File | null>(null)
  const [isUploadingLogoImage, setIsUploadingLogoImage] = useState(false)
  const [logoImageUploadError, setLogoImageUploadError] = useState<string | null>(null)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [activeTab, setActiveTab] = useState<AccountTab>('workspace')

  const [isSavingPromo, setIsSavingPromo] = useState(false)
  const [promoDraft, setPromoDraft] = useState({
    title: '',
    summary: '',
    startDate: '',
    endDate: '',
    websiteUrl: '',
    imageUrl: '',
    imageAlt: '',
  })
  const [promoImageFile, setPromoImageFile] = useState<File | null>(null)
  const [isUploadingPromoImage, setIsUploadingPromoImage] = useState(false)
  const [promoImageUploadError, setPromoImageUploadError] = useState<string | null>(null)
  const [promoGalleryDraft, setPromoGalleryDraft] = useState<PromoGalleryDraftItem[]>([])
  const [promoGalleryLoading, setPromoGalleryLoading] = useState(false)
  const [isSavingPromoGallery, setIsSavingPromoGallery] = useState(false)
  const [promoGalleryImageFile, setPromoGalleryImageFile] = useState<File | null>(null)
  const [promoGalleryUploadTargetId, setPromoGalleryUploadTargetId] = useState<string | null>(null)
  const [isUploadingPromoGalleryImage, setIsUploadingPromoGalleryImage] = useState(false)
  const [promoGalleryImageUploadError, setPromoGalleryImageUploadError] = useState<string | null>(null)
  const [promoGalleryTab, setPromoGalleryTab] = useState<PromoGalleryTab>('upload')
  const [publicPageTab, setPublicPageTab] = useState<PublicPageTab>('overview')
  const [endpointToTest, setEndpointToTest] = useState('')
  const [endpointTestStatus, setEndpointTestStatus] = useState<string | null>(null)
  const [isTestingEndpoint, setIsTestingEndpoint] = useState(false)
  const [isCopyingApiToken, setIsCopyingApiToken] = useState(false)
  const [integrationApiKeys, setIntegrationApiKeys] = useState<IntegrationApiKey[]>([])
  const [integrationKeysLoading, setIntegrationKeysLoading] = useState(false)
  const [integrationKeyName, setIntegrationKeyName] = useState('')
  const [isCreatingIntegrationKey, setIsCreatingIntegrationKey] = useState(false)
  const [latestIntegrationToken, setLatestIntegrationToken] = useState<string | null>(null)
  const [actioningKeyId, setActioningKeyId] = useState<string | null>(null)
  const isPromotionsView = viewMode === 'promotions'

  const activeMembership = useMemo(() => {
    if (!storeId) return null
    return memberships.find(m => m.storeId === storeId) ?? null
  }, [memberships, storeId])

  const isOwner = activeMembership?.role === 'owner'
  const pendingMembers = useMemo(
    () => roster.filter(member => member.status === 'pending'),
    [roster],
  )

  useEffect(() => {
    if (!isPromotionsView) return
    setActiveTab('promotions')
  }, [isPromotionsView])

  useEffect(() => {
    if (!isPromotionsView) return
    setPublicPageTab('overview')
  }, [isPromotionsView])

  useEffect(() => {
    if (!storeId) {
      setProfile(null)
      setProfileError(null)
      setIsEditingProfile(false)
      return
    }

    let cancelled = false

    async function loadProfile() {
      setProfileLoading(true)
      setProfileError(null)

      try {
        const ref = doc(db, 'stores', storeId)
        const snapshot = await getDoc(ref)
        if (cancelled) return

        if (snapshot.exists()) {
          const mapped = mapStoreSnapshot(snapshot)
          setProfile(mapped)
          setProfileError(null)
          return
        }

        // ✅ FIX: the old fallback query used ownerId==storeId (wrong)
        // If stores/{storeId} doesn't exist, just show a clean error.
        setProfile(null)
        setProfileError('We could not find this workspace profile.')
      } catch (error) {
        if (cancelled) return
        console.error('Failed to load store profile', error)
        setProfile(null)
        setProfileError('We could not load the workspace profile.')
        publish({ message: 'Unable to load store details.', tone: 'error' })
      } finally {
        if (!cancelled) setProfileLoading(false)
      }
    }

    void loadProfile()

    return () => {
      cancelled = true
    }
  }, [storeId, publish])

  useEffect(() => {
    if (!storeId) {
      setSubscriptionProfile(null)
      setSubscriptionError(null)
      return
    }

    let cancelled = false

    async function loadSubscription() {
      setSubscriptionLoading(true)
      setSubscriptionError(null)

      try {
        const ref = doc(db, 'subscriptions', storeId)
        const snapshot = await getDoc(ref)
        if (cancelled) return

        if (!snapshot.exists()) {
          setSubscriptionProfile(null)
          return
        }

        const mapped = mapSubscriptionSnapshot(snapshot)
        setSubscriptionProfile(mapped)
      } catch (error) {
        if (cancelled) return
        console.error('Failed to load subscription', error)
        setSubscriptionProfile(null)
        setSubscriptionError('We could not load the billing information.')
        publish({ message: 'Unable to load billing information.', tone: 'error' })
      } finally {
        if (!cancelled) setSubscriptionLoading(false)
      }
    }

    void loadSubscription()

    return () => {
      cancelled = true
    }
  }, [storeId, publish])

  useEffect(() => {
    if (!storeId) {
      setRoster([])
      setRosterError(null)
      return
    }

    let cancelled = false

    setRosterLoading(true)
    setRosterError(null)

    const membersRef = collection(db, 'teamMembers')
    const rosterQuery = query(membersRef, where('storeId', '==', storeId))
    getDocs(rosterQuery)
      .then(snapshot => {
        if (cancelled) return
        const members = snapshot.docs.map(mapRosterSnapshot)
        setRoster(members)
        setRosterError(null)
      })
      .catch(error => {
        if (cancelled) return
        console.error('Failed to load roster', error)
        setRoster([])
        setRosterError('We could not load the team roster.')
        publish({ message: 'Unable to load team members.', tone: 'error' })
      })
      .finally(() => {
        if (!cancelled) setRosterLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [storeId, publish])

  useEffect(() => {
    if (!profile) return
    setPromoDraft({
      title: profile.promoTitle ?? '',
      summary: profile.promoSummary ?? '',
      startDate: profile.promoStartDate ?? '',
      endDate: profile.promoEndDate ?? '',
      websiteUrl: profile.promoWebsiteUrl ?? '',
      imageUrl: profile.promoImageUrl ?? '',
      imageAlt: profile.promoImageAlt ?? '',
    })
  }, [profile])

  useEffect(() => {
    if (!storeId || !isOwner) {
      setPromoGalleryDraft([])
      setPromoGalleryLoading(false)
      return
    }

    let cancelled = false
    async function loadPromoGallery() {
      setPromoGalleryLoading(true)
      try {
        const galleryQuery = query(
          collection(db, 'stores', storeId, 'promoGallery'),
          orderBy('sortOrder', 'asc'),
          limit(MAX_PROMO_GALLERY_ITEMS),
        )
        const snapshot = await getDocs(galleryQuery)
        if (cancelled) return
        const items = snapshot.docs.map(itemDoc => {
          const data = itemDoc.data() as Record<string, unknown>
          return {
            id: itemDoc.id,
            url: typeof data.url === 'string' ? data.url : '',
            alt: typeof data.alt === 'string' ? data.alt : '',
            caption: typeof data.caption === 'string' ? data.caption : '',
            sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : 0,
            isPublished: data.isPublished === true,
          } satisfies PromoGalleryDraftItem
        })
        setPromoGalleryDraft(items)
      } catch (error) {
        if (cancelled) return
        console.error('[account] Failed to load promo gallery', error)
        setPromoGalleryDraft([])
        publish({ message: 'Unable to load promo gallery.', tone: 'error' })
      } finally {
        if (!cancelled) setPromoGalleryLoading(false)
      }
    }

    void loadPromoGallery()
    return () => {
      cancelled = true
    }
  }, [isOwner, publish, storeId])

  async function refreshIntegrationApiKeys() {
    if (!isOwner) {
      setIntegrationApiKeys([])
      return
    }

    try {
      setIntegrationKeysLoading(true)
      const callable = httpsCallable(functions, 'listIntegrationApiKeys')
      const response = await callable({})
      const payload = (response.data ?? {}) as {
        keys?: Array<Record<string, unknown>>
      }

      const keys = Array.isArray(payload.keys)
        ? payload.keys.map(item => ({
            id: typeof item.id === 'string' ? item.id : '',
            name: typeof item.name === 'string' ? item.name : 'Unnamed key',
            status: item.status === 'revoked' ? 'revoked' : 'active',
            keyPreview:
              typeof item.keyPreview === 'string' && item.keyPreview.trim()
                ? item.keyPreview
                : '••••••••',
            createdAt: isTimestamp(item.createdAt) ? item.createdAt : null,
            updatedAt: isTimestamp(item.updatedAt) ? item.updatedAt : null,
            revokedAt: isTimestamp(item.revokedAt) ? item.revokedAt : null,
            lastUsedAt: isTimestamp(item.lastUsedAt) ? item.lastUsedAt : null,
          }))
        : []
      setIntegrationApiKeys(keys.filter(key => key.id))
    } catch (error) {
      console.error('[account] Failed to load integration API keys', error)
      const callableError = error as FirebaseError | null
      const detailsRaw =
        callableError && 'details' in callableError
          ? (callableError as FirebaseError & { details?: unknown }).details
          : null
      const detailText =
        detailsRaw && typeof detailsRaw === 'object'
          ? JSON.stringify(detailsRaw)
          : typeof detailsRaw === 'string'
            ? detailsRaw
            : ''
      console.error('[account] listIntegrationApiKeys diagnostics', {
        code: callableError?.code ?? null,
        message: callableError?.message ?? null,
        details: detailsRaw ?? null,
      })
      const detail =
        callableError && typeof callableError.code === 'string' && callableError.code
          ? ` (${callableError.code}${callableError.message ? `: ${callableError.message}` : ''}${detailText ? ` | details: ${detailText}` : ''})`
          : ''
      publish({ message: `Unable to load integration API keys.${detail}`, tone: 'error' })
      setIntegrationApiKeys([])
    } finally {
      setIntegrationKeysLoading(false)
    }
  }

  useEffect(() => {
    if (!storeId || !isOwner) {
      setIntegrationApiKeys([])
      return
    }
    void refreshIntegrationApiKeys()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, isOwner])

  useEffect(() => {
    if (!profile) return

    setProfileDraft({
      displayName: profile.displayName ?? profile.name ?? '',
      email: profile.email ?? '',
      phone: profile.phone ?? '',
      addressLine1: profile.addressLine1 ?? '',
      addressLine2: profile.addressLine2 ?? '',
      city: profile.city ?? '',
      region: profile.region ?? '',
      postalCode: profile.postalCode ?? '',
      country: profile.country ?? '',
      logoUrl: profile.logoUrl ?? '',
      logoAlt: profile.logoAlt ?? '',
    })
  }, [profile])

  function updateProfileDraft(key: keyof typeof profileDraft, value: string): void {
    setProfileDraft(current => ({ ...current, [key]: value }))
  }

  function normalizeInput(value: string) {
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }

  async function handleSaveProfile(event?: React.FormEvent) {
    event?.preventDefault()
    if (!storeId) return

    if (!isOwner) {
      publish({
        message: 'Only the workspace owner can update details.',
        tone: 'error',
      })
      return
    }

    try {
      setIsSavingProfile(true)
      const updatedAt = Timestamp.now()
      const ref = doc(db, 'stores', storeId)

      const payload = {
        displayName: normalizeInput(profileDraft.displayName),
        name: normalizeInput(profileDraft.displayName),
        email: normalizeInput(profileDraft.email),
        // ✅ keep ownerEmail in sync so billing can always use it
        ownerEmail: normalizeInput(profileDraft.email),
        phone: normalizeInput(profileDraft.phone),
        addressLine1: normalizeInput(profileDraft.addressLine1),
        addressLine2: normalizeInput(profileDraft.addressLine2),
        city: normalizeInput(profileDraft.city),
        region: normalizeInput(profileDraft.region),
        postalCode: normalizeInput(profileDraft.postalCode),
        country: normalizeInput(profileDraft.country),
        logoUrl: normalizeInput(profileDraft.logoUrl),
        logoAlt: normalizeInput(profileDraft.logoAlt),
        updatedAt,
      }

      await setDoc(ref, payload, { merge: true })

      setProfile(current =>
        current
          ? {
              ...current,
              displayName: payload.displayName,
              name: payload.name ?? current.displayName ?? current.name ?? null,
              email: payload.email,
              ownerEmail: payload.ownerEmail ?? current.ownerEmail ?? payload.email ?? null,
              phone: payload.phone,
              addressLine1: payload.addressLine1,
              addressLine2: payload.addressLine2,
              city: payload.city,
              region: payload.region,
              postalCode: payload.postalCode,
              country: payload.country,
              logoUrl: payload.logoUrl,
              logoAlt: payload.logoAlt,
              updatedAt,
            }
          : current,
      )

      publish({ message: 'Workspace details updated.', tone: 'success' })
      setIsEditingProfile(false)
    } catch (error) {
      console.error('[account] Failed to save workspace profile', error)
      publish({
        message: 'Unable to save workspace details. Please try again.',
        tone: 'error',
      })
    } finally {
      setIsSavingProfile(false)
    }
  }

  const Heading = headingLevel as keyof JSX.IntrinsicElements

  if (storeError) {
    return <div role="alert">{storeError}</div>
  }

  if (storeLoading) {
    return (
      <div className="account-overview">
        <Heading>Account overview</Heading>
        <p role="status" aria-live="polite">
          Loading workspace…
        </p>
      </div>
    )
  }

  if (!storeId) {
    return (
      <div className="account-overview" role="status">
        <Heading>Account overview</Heading>
        <p>Select a workspace to view account details.</p>
      </div>
    )
  }

  const isBusy =
    membershipsLoading || profileLoading || subscriptionLoading || rosterLoading

  const contractStatus =
    subscriptionProfile?.status ?? profile?.contractStatus ?? profile?.status ?? null

  const billingPlan = subscriptionProfile?.plan ?? profile?.billingPlan ?? null

  const isTrial = contractStatus === 'trial' || billingPlan === 'trial'

  const lastPaymentDisplay = formatTimestamp(
    subscriptionProfile?.lastPaymentAt ?? subscriptionProfile?.currentPeriodStart ?? null,
  )

  const expiryDisplay = formatTimestamp(subscriptionProfile?.currentPeriodEnd ?? null)

  // 🔹 Trial end (from store billing)
  const trialEndDisplay = formatTimestamp(profile?.trialEndsAt ?? null)

  // 🔹 Period start (from subscription)
  const periodStartDisplay = formatTimestamp(subscriptionProfile?.currentPeriodStart ?? null)

  function updatePromoDraft(key: keyof typeof promoDraft, value: string): void {
    setPromoDraft(current => ({ ...current, [key]: value }))
  }

  const promoSlug = buildPromoSlug(profile?.promoSlug, profile?.displayName, profile?.name, storeId)

  async function handleSavePromo() {
    if (!storeId) return
    if (!isOwner) {
      publish({
        message: 'Only the workspace owner can update promotions.',
        tone: 'error',
      })
      return
    }

    try {
      setIsSavingPromo(true)
      const ref = doc(db, 'stores', storeId)
      const payload = {
        promoEnabled: true,
        promoTitle: normalizeInput(promoDraft.title),
        promoSummary: normalizeInput(promoDraft.summary),
        promoStartDate: normalizeInput(promoDraft.startDate),
        promoEndDate: normalizeInput(promoDraft.endDate),
        promoSlug,
        promoWebsiteUrl: normalizeInput(promoDraft.websiteUrl),
        promoImageUrl: normalizeInput(promoDraft.imageUrl),
        promoImageAlt: normalizeInput(promoDraft.imageAlt),
        updatedAt: Timestamp.now(),
      }

      await setDoc(ref, payload, { merge: true })

      setProfile(current =>
        current
          ? {
              ...current,
              promoEnabled: true,
              promoTitle: payload.promoTitle,
              promoSummary: payload.promoSummary,
              promoStartDate: payload.promoStartDate,
              promoEndDate: payload.promoEndDate,
              promoSlug: payload.promoSlug,
              promoWebsiteUrl: payload.promoWebsiteUrl,
              promoImageUrl: payload.promoImageUrl,
              promoImageAlt: payload.promoImageAlt,
              updatedAt: payload.updatedAt,
            }
          : current,
      )

      publish({ message: 'Upcoming promo saved.', tone: 'success' })
    } catch (error) {
      console.error('[account] Failed to save upcoming promo', error)
      publish({
        message: 'Unable to save upcoming promo. Please try again.',
        tone: 'error',
      })
    } finally {
      setIsSavingPromo(false)
    }
  }

  async function handleUploadPromoImage() {
    if (!storeId) {
      setPromoImageUploadError('Select a store before uploading promo images.')
      return
    }
    if (!promoImageFile) {
      setPromoImageUploadError('Choose an image file before uploading.')
      return
    }

    setPromoImageUploadError(null)
    setIsUploadingPromoImage(true)
    try {
      const uploadedUrl = await uploadProductImage(promoImageFile, {
        storagePath: buildStableStoreImagePath(storeId, 'promo'),
      })
      setPromoDraft(current => ({ ...current, imageUrl: uploadedUrl }))
      setPromoImageFile(null)
      publish({ tone: 'success', message: 'Promo image uploaded successfully.' })
    } catch (error) {
      console.error('[account] Failed to upload promo image', error)
      setPromoImageUploadError(buildUploadErrorMessage(error))
    } finally {
      setIsUploadingPromoImage(false)
    }
  }

  function handleDeletePromoImage() {
    setPromoImageFile(null)
    setPromoDraft(current => ({ ...current, imageUrl: '' }))
    publish({ tone: 'success', message: 'Promo image removed. Save the promo to apply this change.' })
  }

  function updatePromoGalleryDraft(
    id: string,
    key: keyof Omit<PromoGalleryDraftItem, 'id'>,
    value: string | number | boolean,
  ) {
    setPromoGalleryDraft(current =>
      current.map(item => (item.id === id ? { ...item, [key]: value } : item)),
    )
  }

  function handleAddPromoGalleryItem() {
    if (promoGalleryDraft.length >= MAX_PROMO_GALLERY_ITEMS) {
      publish({
        message: `You can upload up to ${MAX_PROMO_GALLERY_ITEMS} gallery photos per store.`,
        tone: 'error',
      })
      return
    }
    setPromoGalleryDraft(current => [
      ...current,
      {
        id: `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        url: '',
        alt: '',
        caption: '',
        sortOrder: current.length,
        isPublished: true,
      },
    ])
  }

  async function handleDeletePromoGalleryItem(itemId: string) {
    if (!storeId) return
    const isDraftOnly = itemId.startsWith('draft-')
    const item = promoGalleryDraft.find(entry => entry.id === itemId)
    try {
      if (item?.url) {
        await deleteUploadedImageByUrl(item.url)
      }
      if (!isDraftOnly) {
        await deleteDoc(doc(db, 'stores', storeId, 'promoGallery', itemId))
      }
      setPromoGalleryDraft(current => current.filter(item => item.id !== itemId))
      publish({ message: 'Gallery item removed.', tone: 'success' })
    } catch (error) {
      console.error('[account] Failed to delete promo gallery item', error)
      publish({ message: 'Unable to remove gallery item.', tone: 'error' })
    }
  }

  async function handleSavePromoGallery() {
    if (!storeId || !isOwner) return
    if (promoGalleryDraft.length > MAX_PROMO_GALLERY_ITEMS) {
      publish({
        message: `Save only ${MAX_PROMO_GALLERY_ITEMS} gallery photos to control storage costs.`,
        tone: 'error',
      })
      return
    }

    const trimmedItems = promoGalleryDraft
      .map(item => ({
        ...item,
        url: item.url.trim(),
        alt: item.alt.trim(),
        caption: item.caption.trim(),
      }))
      .filter(item => item.url)

    try {
      setIsSavingPromoGallery(true)
      await Promise.all(
        trimmedItems.map(item => {
          const basePayload = {
            url: item.url,
            alt: item.alt || null,
            caption: item.caption || null,
            sortOrder: Number.isFinite(item.sortOrder) ? item.sortOrder : 0,
            isPublished: item.isPublished,
            updatedAt: serverTimestamp(),
          }
          if (item.id.startsWith('draft-')) {
            return addDoc(collection(db, 'stores', storeId, 'promoGallery'), {
              ...basePayload,
              createdAt: serverTimestamp(),
            })
          }
          return setDoc(doc(db, 'stores', storeId, 'promoGallery', item.id), basePayload, { merge: true })
        }),
      )
      publish({ message: 'Promo gallery saved.', tone: 'success' })

      const galleryQuery = query(
        collection(db, 'stores', storeId, 'promoGallery'),
        orderBy('sortOrder', 'asc'),
        limit(MAX_PROMO_GALLERY_ITEMS),
      )
      const snapshot = await getDocs(galleryQuery)
      setPromoGalleryDraft(
        snapshot.docs.map(itemDoc => {
          const data = itemDoc.data() as Record<string, unknown>
          return {
            id: itemDoc.id,
            url: typeof data.url === 'string' ? data.url : '',
            alt: typeof data.alt === 'string' ? data.alt : '',
            caption: typeof data.caption === 'string' ? data.caption : '',
            sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : 0,
            isPublished: data.isPublished === true,
          } satisfies PromoGalleryDraftItem
        }),
      )
    } catch (error) {
      console.error('[account] Failed to save promo gallery', error)
      publish({ message: 'Unable to save promo gallery.', tone: 'error' })
    } finally {
      setIsSavingPromoGallery(false)
    }
  }

  async function handleUploadPromoGalleryImage(itemId: string) {
    if (!storeId) {
      setPromoGalleryImageUploadError('Select a store before uploading gallery images.')
      return
    }
    if (!promoGalleryImageFile || promoGalleryUploadTargetId !== itemId) {
      setPromoGalleryImageUploadError('Choose an image file for this gallery item before uploading.')
      return
    }

    setPromoGalleryImageUploadError(null)
    setIsUploadingPromoGalleryImage(true)
    try {
      const uploadedUrl = await uploadProductImage(promoGalleryImageFile, {
        storagePath: buildPromoGalleryImagePath(storeId, itemId),
      })
      updatePromoGalleryDraft(itemId, 'url', uploadedUrl)
      setPromoGalleryImageFile(null)
      setPromoGalleryUploadTargetId(null)
      publish({ tone: 'success', message: 'Gallery image uploaded successfully.' })
    } catch (error) {
      console.error('[account] Failed to upload promo gallery image', error)
      setPromoGalleryImageUploadError(buildUploadErrorMessage(error))
    } finally {
      setIsUploadingPromoGalleryImage(false)
    }
  }

  async function handleUploadLogoImage() {
    if (!storeId) {
      setLogoImageUploadError('Select a store before uploading a logo.')
      return
    }
    if (!logoImageFile) {
      setLogoImageUploadError('Choose an image file before uploading.')
      return
    }

    setLogoImageUploadError(null)
    try {
      setIsUploadingLogoImage(true)
      const uploadedUrl = await uploadProductImage(logoImageFile, {
        storagePath: buildStableStoreImagePath(storeId, 'logo'),
      })
      setProfileDraft(current => ({ ...current, logoUrl: uploadedUrl }))
      setLogoImageFile(null)
      publish({ tone: 'success', message: 'Logo uploaded successfully.' })
    } catch (error) {
      console.error('[account] Failed to upload logo image', error)
      setLogoImageUploadError(buildUploadErrorMessage(error))
    } finally {
      setIsUploadingLogoImage(false)
    }
  }

  async function handleDeleteWorkspaceData() {

    if (!storeId) return

    if (!isOwner) {
      publish({
        message: 'Only the workspace owner can delete workspace data.',
        tone: 'error',
      })
      return
    }

    const confirmed = window.confirm(
      'This will permanently delete all workspace data, including products, sales, customers, expenses, team members and activity. This action cannot be undone. Continue?',
    )

    if (!confirmed) return

    try {
      setIsDeletingWorkspace(true)
      await deleteWorkspaceData(storeId)
      publish({
        message: 'All workspace data deleted.',
        tone: 'success',
      })
    } catch (error) {
      console.error('[account] Failed to delete workspace data', error)
      publish({
        message: 'Unable to delete workspace data. Please try again.',
        tone: 'error',
      })
    } finally {
      setIsDeletingWorkspace(false)
    }
  }

  async function handleCopyApiToken() {
    if (!user) {
      publish({ message: 'You need to be signed in to copy an API token.', tone: 'error' })
      return
    }

    try {
      setIsCopyingApiToken(true)
      const token = await user.getIdToken()
      await navigator.clipboard.writeText(token)
      publish({ message: 'API token copied.', tone: 'success' })
    } catch (error) {
      console.error('[account] Failed to copy API token', error)
      publish({
        message: 'Unable to copy API token. Please try again.',
        tone: 'error',
      })
    } finally {
      setIsCopyingApiToken(false)
    }
  }

  async function copyTextToClipboard(value: string, successMessage: string) {
    await navigator.clipboard.writeText(value)
    publish({ message: successMessage, tone: 'success' })
  }

  async function handleCreateIntegrationApiKey() {
    if (!integrationKeyName.trim()) {
      publish({ message: 'Provide a key name first.', tone: 'error' })
      return
    }

    try {
      setIsCreatingIntegrationKey(true)
      const callable = httpsCallable(functions, 'createIntegrationApiKey')
      const response = await callable({ name: integrationKeyName.trim() })
      const data = (response.data ?? {}) as { token?: unknown }
      const token = typeof data.token === 'string' ? data.token : ''

      if (token) {
        setLatestIntegrationToken(token)
        await copyTextToClipboard(
          token,
          'Integration API key created. It was copied to your clipboard and is shown below once.',
        )
      } else {
        publish({
          message: 'Integration API key created, but token was unavailable.',
          tone: 'warning',
        })
      }

      setIntegrationKeyName('')
      await refreshIntegrationApiKeys()
    } catch (error) {
      console.error('[account] Failed to create integration API key', error)
      const errorMessage =
        typeof (error as { message?: unknown })?.message === 'string'
          ? (error as { message: string }).message
          : ''
      publish({
        message: errorMessage
          ? `Unable to create integration API key: ${errorMessage}`
          : 'Unable to create integration API key.',
        tone: 'error',
      })
    } finally {
      setIsCreatingIntegrationKey(false)
    }
  }

  async function handleRevokeIntegrationApiKey(keyId: string) {
    try {
      setActioningKeyId(keyId)
      const callable = httpsCallable(functions, 'revokeIntegrationApiKey')
      await callable({ keyId })
      publish({ message: 'Integration API key revoked.', tone: 'success' })
      await refreshIntegrationApiKeys()
    } catch (error) {
      console.error('[account] Failed to revoke integration API key', error)
      publish({ message: 'Unable to revoke integration API key.', tone: 'error' })
    } finally {
      setActioningKeyId(null)
    }
  }

  async function handleRotateIntegrationApiKey(keyId: string) {
    try {
      setActioningKeyId(keyId)
      const callable = httpsCallable(functions, 'rotateIntegrationApiKey')
      const response = await callable({ keyId })
      const data = (response.data ?? {}) as { token?: unknown }
      const token = typeof data.token === 'string' ? data.token : ''
      if (token) {
        setLatestIntegrationToken(token)
        await copyTextToClipboard(
          token,
          'Integration API key rotated. The new key was copied to your clipboard and is shown below once.',
        )
      } else {
        publish({
          message: 'Key rotated, but the new token was unavailable.',
          tone: 'warning',
        })
      }
      await refreshIntegrationApiKeys()
    } catch (error) {
      console.error('[account] Failed to rotate integration API key', error)
      publish({ message: 'Unable to rotate integration API key.', tone: 'error' })
    } finally {
      setActioningKeyId(null)
    }
  }

  async function handleTestEndpoint() {
    const endpoint = endpointToTest.trim()

    if (!endpoint) {
      setEndpointTestStatus('Enter an endpoint URL to test.')
      return
    }

    try {
      new URL(endpoint)
    } catch {
      setEndpointTestStatus('Enter a valid URL (including https://) and try again.')
      return
    }

    try {
      setIsTestingEndpoint(true)
      setEndpointTestStatus(null)

      const response = await fetch(endpoint, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
      })

      if (response.ok) {
        setEndpointTestStatus(`Endpoint is reachable (${response.status}).`)
      } else {
        setEndpointTestStatus(`Endpoint returned ${response.status}.`)
      }
    } catch (error) {
      console.error('[account] Endpoint test failed', error)
      setEndpointTestStatus(
        'Endpoint test failed. Ensure the endpoint allows CORS (Access-Control-Allow-Origin) and accepts browser GET requests.',
      )
    } finally {
      setIsTestingEndpoint(false)
    }
  }

  async function handleTestSedifexProducts() {
    try {
      const listStoreProducts = httpsCallable(functions, 'listStoreProducts')
      await listStoreProducts({})
      publish({ message: 'Sedifex products endpoint test passed.', tone: 'success' })
    } catch (error) {
      console.error('[account] listStoreProducts test failed', error)
      publish({
        message: 'Sedifex products endpoint test failed.',
        tone: 'error',
      })
    }
  }

  async function handleDeleteAccount() {
    if (!user) {
      publish({
        message: 'You need to be signed in to delete your account.',
        tone: 'error',
      })
      return
    }

    const confirmed = window.confirm(
      'This will permanently delete your Sedifex account and remove you from all workspaces. This action cannot be undone. Continue?',
    )

    if (!confirmed) return

    try {
      setIsDeletingAccount(true)

      const membershipQuery = query(
        collection(db, 'teamMembers'),
        where('uid', '==', user.uid),
      )
      const membershipSnapshot = await getDocs(membershipQuery)

      await Promise.all(
        membershipSnapshot.docs.map(snapshot =>
          deleteDoc(doc(db, 'teamMembers', snapshot.id)),
        ),
      )

      await deleteUser(user)

      publish({
        message: 'Your account has been deleted.',
        tone: 'success',
      })
    } catch (error) {
      console.error('[account] Failed to delete account', error)

      const errorCode = (error as { code?: unknown })?.code
      const message =
        errorCode === 'auth/requires-recent-login'
          ? 'Please sign in again to delete your account.'
          : 'Unable to delete your account. Please try again.'

      publish({ message, tone: 'error' })
    } finally {
      setIsDeletingAccount(false)
    }
  }

  async function handleApprovePending(member: RosterMember) {
    if (!storeId || !isOwner) return

    setPendingActionId(member.id)
    try {
      await setDoc(
        doc(db, 'teamMembers', member.id),
        { status: 'active', updatedAt: serverTimestamp() },
        { merge: true },
      )
      setRoster(current =>
        current.map(entry =>
          entry.id === member.id
            ? { ...entry, status: 'active', updatedAt: Timestamp.now() }
            : entry,
        ),
      )
      publish({
        message: `Approved ${member.email ?? 'staff member'}.`,
        tone: 'success',
      })
    } catch (error) {
      console.warn('[account] Failed to approve pending staff', error)
      publish({
        message: 'Unable to approve this staff member. Please try again.',
        tone: 'error',
      })
    } finally {
      setPendingActionId(null)
    }
  }

  async function handleRejectPending(member: RosterMember) {
    if (!storeId || !isOwner) return

    setPendingActionId(member.id)
    try {
      await setDoc(
        doc(db, 'teamMembers', member.id),
        { status: 'inactive', updatedAt: serverTimestamp() },
        { merge: true },
      )
      setRoster(current =>
        current.map(entry =>
          entry.id === member.id
            ? { ...entry, status: 'inactive', updatedAt: Timestamp.now() }
            : entry,
        ),
      )
      publish({
        message: `Removed ${member.email ?? 'staff member'} from your workspace.`,
        tone: 'success',
      })
    } catch (error) {
      console.warn('[account] Failed to reject pending staff', error)
      publish({
        message: 'Unable to remove this staff member. Please try again.',
        tone: 'error',
      })
    } finally {
      setPendingActionId(null)
    }
  }

  return (
    <div className="account-overview">
      <Heading>{isPromotionsView ? 'Public page' : 'Account overview'}</Heading>

      {profile && (
        <p className="account-overview__subtitle">
          Workspace <strong>{profile.displayName ?? profile.name ?? '—'}</strong>
          {activeMembership && (
            <>
              {' · '}Your role <strong>{isOwner ? 'Owner' : 'Staff'}</strong>
            </>
          )}
        </p>
      )}

      {isTrial && (
        <div
          className="account-overview__banner account-overview__banner--trial"
          role="status"
          aria-live="polite"
        >
          <p>
            You’re currently on a <strong>trial</strong> plan.
            {profile?.trialEndsAt && (
              <>
                {' '}
                Your trial ends on <strong>{trialEndDisplay}</strong>.
              </>
            )}
            {isOwner
              ? ' Set up billing to avoid interruptions.'
              : ' Ask the workspace owner to set up billing to avoid interruptions.'}
          </p>
        </div>
      )}

      {(membershipsError || profileError || subscriptionError || rosterError) && (
        <div className="account-overview__error" role="alert">
          {membershipsError && <p>We could not load your memberships.</p>}
          {profileError && <p>{profileError}</p>}
          {subscriptionError && <p>{subscriptionError}</p>}
          {rosterError && <p>{rosterError}</p>}
        </div>
      )}

      {isBusy && (
        <p role="status" aria-live="polite">
          Loading account details…
        </p>
      )}


      {!isPromotionsView && (
        <nav className="account-overview__tabs" aria-label="Account sections">
          <button
            type="button"
            className={`account-overview__tab ${activeTab === 'workspace' ? 'is-active' : ''}`}
            aria-pressed={activeTab === 'workspace'}
            onClick={() => setActiveTab('workspace')}
          >
            Workspace
          </button>
          <button
            type="button"
            className={`account-overview__tab ${activeTab === 'integrations' ? 'is-active' : ''}`}
            aria-pressed={activeTab === 'integrations'}
            onClick={() => setActiveTab('integrations')}
          >
            Integrations
          </button>
          <button
            type="button"
            className={`account-overview__tab ${activeTab === 'operations' ? 'is-active' : ''}`}
            aria-pressed={activeTab === 'operations'}
            onClick={() => setActiveTab('operations')}
          >
            Billing & team
          </button>
        </nav>
      )}

      {profile && !isPromotionsView && activeTab === 'workspace' && (
        <section aria-labelledby="account-overview-profile" id="store-profile">
          <div className="account-overview__section-header">
            <h2 id="account-overview-profile">Store profile</h2>

            {isOwner && (
              <div className="account-overview__actions account-overview__actions--profile">
                <button
                  type="button"
                  className="button button--secondary"
                  data-testid="account-edit-store"
                  onClick={() => {
                    setIsEditingProfile(current => !current)
                  }}
                >
                  {isEditingProfile ? 'Close workspace details' : 'Edit workspace details'}
                </button>
              </div>
            )}
          </div>

          <dl className="account-overview__grid">
            <div>
              <dt>Workspace name</dt>
              <dd>{formatValue(profile.displayName ?? profile.name)}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{formatValue(profile.email)}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{formatValue(profile.phone)}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{formatValue(profile.status)}</dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>
                {[
                  profile.addressLine1,
                  profile.addressLine2,
                  profile.city,
                  profile.region,
                  profile.postalCode,
                  profile.country,
                ]
                  .filter(Boolean)
                  .join(', ') || '—'}
              </dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatTimestamp(profile.createdAt)}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{formatTimestamp(profile.updatedAt)}</dd>
            </div>
          </dl>

          {isOwner && isEditingProfile && (
            <form
              className="account-overview__profile-form"
              onSubmit={handleSaveProfile}
              data-testid="account-profile-form"
            >
              <div className="account-overview__form-grid">
                <label>
                  <span>Workspace name</span>
                  <input
                    type="text"
                    value={profileDraft.displayName}
                    onChange={event => updateProfileDraft('displayName', event.target.value)}
                    placeholder="e.g. Sedifex Coffee"
                    data-testid="account-profile-name"
                  />
                </label>

                <label>
                  <span>Contact email</span>
                  <input
                    type="email"
                    value={profileDraft.email}
                    onChange={event => updateProfileDraft('email', event.target.value)}
                    placeholder="you@example.com"
                    data-testid="account-profile-email"
                  />
                </label>

                <label>
                  <span>Phone number</span>
                  <input
                    type="tel"
                    value={profileDraft.phone}
                    onChange={event => updateProfileDraft('phone', event.target.value)}
                    placeholder="+233 20 123 4567"
                    data-testid="account-profile-phone"
                  />
                </label>

                <label>
                  <span>Address line 1</span>
                  <input
                    type="text"
                    value={profileDraft.addressLine1}
                    onChange={event =>
                      updateProfileDraft('addressLine1', event.target.value)
                    }
                    placeholder="Street and house number"
                    data-testid="account-profile-address1"
                  />
                </label>

                <label>
                  <span>Address line 2</span>
                  <input
                    type="text"
                    value={profileDraft.addressLine2}
                    onChange={event =>
                      updateProfileDraft('addressLine2', event.target.value)
                    }
                    placeholder="Apartment, suite, etc."
                    data-testid="account-profile-address2"
                  />
                </label>

                <label>
                  <span>City</span>
                  <input
                    type="text"
                    value={profileDraft.city}
                    onChange={event => updateProfileDraft('city', event.target.value)}
                    placeholder="Nairobi"
                    data-testid="account-profile-city"
                  />
                </label>

                <label>
                  <span>Region / State</span>
                  <input
                    type="text"
                    value={profileDraft.region}
                    onChange={event => updateProfileDraft('region', event.target.value)}
                    placeholder="Nairobi County"
                    data-testid="account-profile-region"
                  />
                </label>

                <label>
                  <span>Postal code</span>
                  <input
                    type="text"
                    value={profileDraft.postalCode}
                    onChange={event =>
                      updateProfileDraft('postalCode', event.target.value)
                    }
                    placeholder="00100"
                    data-testid="account-profile-postal"
                  />
                </label>

                <label>
                  <span>Country</span>
                  <input
                    type="text"
                    value={profileDraft.country}
                    onChange={event => updateProfileDraft('country', event.target.value)}
                    placeholder="Kenya or Ghana"
                    data-testid="account-profile-country"
                  />
                </label>

                <label>
                  <span>Store logo (optional)</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={event => {
                      const file = event.target.files?.[0] ?? null
                      setLogoImageFile(file)
                    }}
                  />
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="button button--secondary"
                      onClick={handleUploadLogoImage}
                      disabled={isUploadingLogoImage}
                    >
                      {isUploadingLogoImage ? 'Uploading logo…' : 'Upload logo'}
                    </button>
                    <button
                      type="button"
                      className="button button--secondary"
                      onClick={() => {
                        setLogoImageFile(null)
                        updateProfileDraft('logoUrl', '')
                      }}
                    >
                      Clear logo
                    </button>
                  </div>
                  {logoImageUploadError ? (
                    <p role="alert" style={{ color: '#dc2626', marginTop: 6 }}>
                      {logoImageUploadError}
                    </p>
                  ) : null}
                </label>

                <label>
                  <span>Logo URL</span>
                  <input
                    type="url"
                    value={profileDraft.logoUrl}
                    onChange={event => updateProfileDraft('logoUrl', event.target.value)}
                    placeholder="https://example.com/logo.png"
                  />
                </label>

                <label>
                  <span>Logo alt text</span>
                  <input
                    type="text"
                    value={profileDraft.logoAlt}
                    onChange={event => updateProfileDraft('logoAlt', event.target.value)}
                    placeholder="Store logo"
                  />
                </label>
              </div>

              <div className="account-overview__actions">
                <p className="account-overview__hint">
                  Update your workspace name and contact details for invoices and public listings.
                </p>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <button
                    type="submit"
                    className="button button--primary"
                    disabled={isSavingProfile}
                  >
                    {isSavingProfile ? 'Saving…' : 'Save workspace details'}
                  </button>
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={() => setIsEditingProfile(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          )}
        </section>
      )}


      {profile && !isPromotionsView && activeTab === 'integrations' && (
        <section aria-labelledby="account-overview-integrations">
          <div className="account-overview__section-header">
            <h2 id="account-overview-integrations">Website integrations</h2>
            <p className="account-overview__subtitle">
              Use this tab for WordPress or Next.js (Vercel) setup guides, API keys, and endpoint tests.
            </p>
          </div>

          <div className="account-overview__website-sync" role="status" aria-live="polite">
            <p className="account-overview__website-sync-title">Choose your integration tutorial.</p>
            <p className="account-overview__hint">
              Sedifex supports both WordPress and Next.js storefronts.
              {' '}
              <a href="/docs/integration-quickstart" target="_blank" rel="noreferrer">
                Next.js + Vercel tutorial
              </a>
              {' · '}
              <a href="/docs/wordpress-install-guide" target="_blank" rel="noreferrer">
                WordPress tutorial
              </a>
            </p>
            <div className="account-overview__website-sync-actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={handleCopyApiToken}
                disabled={isCopyingApiToken}
              >
                {isCopyingApiToken ? 'Copying token…' : 'Copy API token'}
              </button>
              <button
                type="button"
                className="button button--secondary"
                onClick={handleTestSedifexProducts}
              >
                Test Sedifex endpoint
              </button>
            </div>
            {isOwner && (
              <div className="account-overview__website-sync-test">
                <label>
                  <span>New integration key name</span>
                  <input
                    type="text"
                    value={integrationKeyName}
                    onChange={event => setIntegrationKeyName(event.target.value)}
                    placeholder="Website production key"
                  />
                </label>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={handleCreateIntegrationApiKey}
                  disabled={isCreatingIntegrationKey}
                >
                  {isCreatingIntegrationKey ? 'Creating…' : 'Create integration key'}
                </button>
              </div>
            )}
            {isOwner && latestIntegrationToken && (
              <div className="account-overview__integration-token-notice" role="status" aria-live="polite">
                <p>
                  <strong>This is your integration key.</strong>
                  {' '}
                  It starts with <code>sedx_</code>, was copied automatically, and is shown only this time.
                  Save it now.
                </p>
                <code className="account-overview__integration-token-value">{latestIntegrationToken}</code>
              </div>
            )}
            {isOwner && (
              <div className="account-overview__website-sync-keys">
                <p className="account-overview__hint">Active integration keys</p>
                {integrationKeysLoading ? (
                  <p className="account-overview__hint">Loading integration keys…</p>
                ) : integrationApiKeys.length === 0 ? (
                  <p className="account-overview__hint">No integration keys yet.</p>
                ) : (
                  <ul className="account-overview__integration-key-list">
                    {integrationApiKeys.map(key => (
                      <li key={key.id} className="account-overview__integration-key-item">
                        <div>
                          <strong>{key.name}</strong>
                          <p className="account-overview__hint">
                            {key.keyPreview}
                            {' · '}
                            {key.status}
                            {' · '}
                            Created {formatTimestamp(key.createdAt)}
                          </p>
                        </div>
                        <div className="account-overview__website-sync-actions">
                          <button
                            type="button"
                            className="button button--secondary"
                            onClick={() => handleRotateIntegrationApiKey(key.id)}
                            disabled={actioningKeyId === key.id || key.status === 'revoked'}
                          >
                            Rotate
                          </button>
                          <button
                            type="button"
                            className="button button--secondary"
                            onClick={() => handleRevokeIntegrationApiKey(key.id)}
                            disabled={actioningKeyId === key.id || key.status === 'revoked'}
                          >
                            Revoke
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="account-overview__website-sync-test">
              <label>
                <span>Test your endpoint</span>
                <input
                  type="url"
                  value={endpointToTest}
                  onChange={event => setEndpointToTest(event.target.value)}
                  placeholder="https://example.com/api/sedifex-sync"
                />
              </label>
              <button
                type="button"
                className="button button--secondary"
                onClick={handleTestEndpoint}
                disabled={isTestingEndpoint}
              >
                {isTestingEndpoint ? 'Testing…' : 'Test endpoint'}
              </button>
            </div>
            {endpointTestStatus && <p className="account-overview__hint">{endpointTestStatus}</p>}
          </div>
        </section>
      )}

      {profile && (isPromotionsView || activeTab === 'promotions') && (
        <section aria-labelledby="account-overview-promotions">
          <div className="account-overview__section-header">
            <h2 id="account-overview-promotions">Upcoming promos</h2>
            <p className="account-overview__subtitle">
              This page gives your business SEO visibility with a free Sedifex URL. Updates to your
              promo, gallery, and catalog content will appear automatically on the public page.
            </p>
          </div>

          <nav className="account-overview__tabs" aria-label="Public page settings sections">
            <button
              type="button"
              className={`account-overview__tab ${publicPageTab === 'overview' ? 'is-active' : ''}`}
              aria-pressed={publicPageTab === 'overview'}
              onClick={() => setPublicPageTab('overview')}
            >
              Overview
            </button>
            <button
              type="button"
              className={`account-overview__tab ${publicPageTab === 'promo' ? 'is-active' : ''}`}
              aria-pressed={publicPageTab === 'promo'}
              onClick={() => setPublicPageTab('promo')}
            >
              Promo
            </button>
            <button
              type="button"
              className={`account-overview__tab ${publicPageTab === 'gallery' ? 'is-active' : ''}`}
              aria-pressed={publicPageTab === 'gallery'}
              onClick={() => setPublicPageTab('gallery')}
            >
              Gallery
            </button>
            <button
              type="button"
              className={`account-overview__tab ${publicPageTab === 'website-sync' ? 'is-active' : ''}`}
              aria-pressed={publicPageTab === 'website-sync'}
              onClick={() => setPublicPageTab('website-sync')}
            >
              Website sync
            </button>
          </nav>

          {publicPageTab === 'overview' && (
            <div className="account-overview__card">
              <p className="account-overview__hint">
                Use this page to manage your public Sedifex profile. Your store name, promo details,
                gallery images, and available products/services are organized for customers at your
                free link.
              </p>
              <p className="account-overview__hint">
                You can also reuse this same data on your own website. Contact the Sedifex team if
                you want updates made here to auto-sync to your website integration.
              </p>
              <p className="account-overview__promo-link">
                Public URL:{' '}
                <a
                  href={`https://www.sedifex.com/${encodeURIComponent(promoSlug)}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  www.sedifex.com/{promoSlug}
                </a>
              </p>
            </div>
          )}

          {isOwner ? (
            <>
              {publicPageTab === 'promo' && (
              <div className="account-overview__grid">
                <div>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span>Promo title</span>
                  <input
                    type="text"
                    value={promoDraft.title}
                    onChange={e => updatePromoDraft('title', e.target.value)}
                    placeholder="Weekend 15% off sale"
                    data-testid="account-promo-title"
                  />
                </label>
                <p style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
                  This data is stored on your store document so your own website can also read and
                  update it from Firebase.
                </p>
              </div>

              <div>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span>Promo summary</span>
                  <textarea
                    rows={3}
                    value={promoDraft.summary}
                    onChange={e => updatePromoDraft('summary', e.target.value)}
                    placeholder="Tell customers what the promo includes and any limits."
                    style={{ width: '100%', resize: 'vertical' }}
                    data-testid="account-promo-summary"
                  />
                </label>
              </div>

              <div>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span>Promo start date</span>
                  <input
                    type="date"
                    value={promoDraft.startDate}
                    onChange={e => updatePromoDraft('startDate', e.target.value)}
                    data-testid="account-promo-start"
                  />
                </label>
              </div>

              <div>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span>Promo end date</span>
                  <input
                    type="date"
                    value={promoDraft.endDate}
                    onChange={e => updatePromoDraft('endDate', e.target.value)}
                    data-testid="account-promo-end"
                  />
                </label>
              </div>

              <div>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span>Promo URL slug</span>
                  <input
                    type="text"
                    value={promoSlug}
                    readOnly
                    aria-readonly="true"
                    data-testid="account-promo-slug-constant"
                  />
                </label>
                <p className="account-overview__promo-link">
                  Free route preview:{' '}
                  <a
                    href={`https://www.sedifex.com/${encodeURIComponent(promoSlug)}`}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    www.sedifex.com/{promoSlug}
                  </a>
                </p>
              </div>

              <div>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span>Your website URL (optional)</span>
                  <input
                    type="url"
                    value={promoDraft.websiteUrl}
                    onChange={e => updatePromoDraft('websiteUrl', e.target.value)}
                    placeholder="https://yourstore.com/promotions"
                    data-testid="account-promo-website"
                  />
                </label>
              </div>
              <div>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span>Promo image (optional)</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={event => {
                      const file = event.target.files?.[0] ?? null
                      setPromoImageFile(file)
                    }}
                  />
                </label>
                <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={handleUploadPromoImage}
                    disabled={isUploadingPromoImage}
                  >
                    {isUploadingPromoImage ? 'Uploading image…' : 'Upload image'}
                  </button>
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => {
                      setPromoImageFile(null)
                      updatePromoDraft('imageUrl', '')
                    }}
                  >
                    Clear image
                  </button>
                  {promoDraft.imageUrl.trim().length > 0 ? (
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={handleDeletePromoImage}
                    >
                      Delete uploaded image
                    </button>
                  ) : null}
                </div>
                {promoImageUploadError ? (
                  <p role="alert" style={{ color: '#dc2626', marginTop: 6 }}>
                    {promoImageUploadError}
                  </p>
                ) : null}
              </div>
              <div>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span>Promo image URL</span>
                  <input
                    type="url"
                    value={promoDraft.imageUrl}
                    onChange={e => updatePromoDraft('imageUrl', e.target.value)}
                    placeholder="https://..."
                  />
                </label>
              </div>
              <div>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span>Promo image alt text</span>
                  <input
                    type="text"
                    value={promoDraft.imageAlt}
                    onChange={e => updatePromoDraft('imageAlt', e.target.value)}
                    placeholder="Describe your promo image"
                  />
                </label>
              </div>

                <div>
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={handleSavePromo}
                    disabled={isSavingPromo}
                  >
                    {isSavingPromo ? 'Saving…' : 'Save upcoming promo'}
                  </button>
                </div>
              </div>
              )}
              {publicPageTab === 'gallery' && (
              <div style={{ marginTop: 20 }}>
                <div className="account-overview__section-header" style={{ marginBottom: 10 }}>
                  <h3>Promo gallery</h3>
                  <p className="account-overview__subtitle">
                    Manage gallery uploads and quickly preview what customers will see.
                  </p>
                </div>
                <nav className="account-overview__tabs" aria-label="Promo gallery sections">
                  <button
                    type="button"
                    className={`account-overview__tab ${promoGalleryTab === 'upload' ? 'is-active' : ''}`}
                    aria-pressed={promoGalleryTab === 'upload'}
                    onClick={() => setPromoGalleryTab('upload')}
                  >
                    Upload images
                  </button>
                  <button
                    type="button"
                    className={`account-overview__tab ${promoGalleryTab === 'view' ? 'is-active' : ''}`}
                    aria-pressed={promoGalleryTab === 'view'}
                    onClick={() => setPromoGalleryTab('view')}
                  >
                    View images
                  </button>
                </nav>
                {promoGalleryLoading ? <p>Loading gallery…</p> : null}
                {promoGalleryTab === 'upload' ? (
                  <>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="button button--secondary"
                        onClick={handleAddPromoGalleryItem}
                        disabled={promoGalleryDraft.length >= MAX_PROMO_GALLERY_ITEMS}
                      >
                        Add image slot
                      </button>
                      <button
                        type="button"
                        className="button button--primary"
                        onClick={handleSavePromoGallery}
                        disabled={isSavingPromoGallery}
                      >
                        {isSavingPromoGallery ? 'Saving gallery…' : 'Save gallery'}
                      </button>
                    </div>
                    <p className="account-overview__hint" style={{ marginTop: 0 }}>
                      To save storage costs, each store can upload up to {MAX_PROMO_GALLERY_ITEMS} photos.
                    </p>
                    {promoGalleryDraft.length === 0 && !promoGalleryLoading ? (
                      <p className="account-overview__hint">No gallery items yet. Add an image slot to begin.</p>
                    ) : null}
                    <div style={{ display: 'grid', gap: 12 }}>
                      {promoGalleryDraft.map(item => (
                    <div
                      key={item.id}
                      className="account-overview__gallery-item"
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: 12,
                        padding: 12,
                        display: 'grid',
                        gap: 10,
                      }}
                    >
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span className="account-overview__gallery-label">Image URL</span>
                        <input
                          type="url"
                          className="account-overview__gallery-input"
                          value={item.url}
                          onChange={event =>
                            updatePromoGalleryDraft(item.id, 'url', event.target.value)
                          }
                          placeholder="https://..."
                        />
                      </label>
                      {item.url.trim().length > 0 ? (
                        <img
                          src={item.url}
                          alt={item.alt || 'Gallery image'}
                          style={{ width: '100%', maxWidth: 280, maxHeight: 180, objectFit: 'cover', borderRadius: 8, border: '1px solid #e5e7eb' }}
                          loading="lazy"
                        />
                      ) : null}
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span className="account-overview__gallery-label">Alt text</span>
                        <input
                          type="text"
                          className="account-overview__gallery-input"
                          value={item.alt}
                          onChange={event =>
                            updatePromoGalleryDraft(item.id, 'alt', event.target.value)
                          }
                          placeholder="Describe this image"
                        />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span className="account-overview__gallery-label">Caption</span>
                        <input
                          type="text"
                          className="account-overview__gallery-input"
                          value={item.caption}
                          onChange={event =>
                            updatePromoGalleryDraft(item.id, 'caption', event.target.value)
                          }
                          placeholder="Optional caption"
                        />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span className="account-overview__gallery-label">Sort order</span>
                        <input
                          type="number"
                          className="account-overview__gallery-input"
                          value={item.sortOrder}
                          onChange={event =>
                            updatePromoGalleryDraft(item.id, 'sortOrder', Number(event.target.value))
                          }
                        />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span className="account-overview__gallery-label">Upload image</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="account-overview__gallery-input"
                          onChange={event => {
                            setPromoGalleryImageFile(event.target.files?.[0] ?? null)
                            setPromoGalleryUploadTargetId(item.id)
                            setPromoGalleryImageUploadError(null)
                          }}
                        />
                      </label>
                      {promoGalleryUploadTargetId === item.id && promoGalleryImageFile ? (
                        <p className="account-overview__hint" style={{ margin: 0 }}>
                          Selected: {promoGalleryImageFile.name}
                        </p>
                      ) : null}
                      <div>
                        <button
                          type="button"
                          className="button button--secondary"
                          onClick={() => handleUploadPromoGalleryImage(item.id)}
                          disabled={
                            isUploadingPromoGalleryImage ||
                            !promoGalleryImageFile ||
                            promoGalleryUploadTargetId !== item.id
                          }
                        >
                          {isUploadingPromoGalleryImage && promoGalleryUploadTargetId === item.id
                            ? 'Uploading image…'
                            : 'Upload image'}
                        </button>
                      </div>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={item.isPublished}
                          onChange={event =>
                            updatePromoGalleryDraft(item.id, 'isPublished', event.target.checked)
                          }
                        />
                        Published
                      </label>
                      <div>
                        <button
                          type="button"
                          className="button button--ghost"
                          onClick={() => handleDeletePromoGalleryItem(item.id)}
                        >
                          Remove item
                        </button>
                      </div>
                    </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    {promoGalleryDraft.filter(item => item.url.trim().length > 0).length === 0 ? (
                      <p className="account-overview__hint">No gallery images uploaded yet.</p>
                    ) : (
                      <div style={{ marginBottom: 12 }}>
                        <p className="account-overview__hint" style={{ marginTop: 0 }}>
                          Uploaded gallery images preview
                        </p>
                        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
                          {promoGalleryDraft
                            .filter(item => item.url.trim().length > 0)
                            .map(item => (
                              <figure
                                key={`preview-${item.id}`}
                                style={{
                                  margin: 0,
                                  border: '1px solid #e5e7eb',
                                  borderRadius: 10,
                                  overflow: 'hidden',
                                  background: '#fff',
                                }}
                              >
                                <img
                                  src={item.url}
                                  alt={item.alt || 'Gallery image preview'}
                                  style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }}
                                  loading="lazy"
                                />
                                <figcaption style={{ padding: '6px 8px', fontSize: 12, color: '#4b5563' }}>
                                  {item.caption || item.alt || 'Gallery image'}
                                </figcaption>
                              </figure>
                            ))}
                        </div>
                      </div>
                    )}
                    <a
                      className="button button--ghost"
                      href={`https://www.sedifex.com/${encodeURIComponent(promoSlug)}#promo-gallery`}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      Open public gallery
                    </a>
                  </>
                )}
                {promoGalleryImageUploadError ? (
                  <p role="alert" style={{ color: '#dc2626', marginTop: 4 }}>
                    {promoGalleryImageUploadError}
                  </p>
                ) : null}
              </div>
              )}
              {publicPageTab === 'website-sync' && (
                <div className="account-overview__card">
                  <p className="account-overview__hint" style={{ marginBottom: 8 }}>
                    Need your website to update automatically when you edit this page?
                  </p>
                  <p className="account-overview__hint">
                    Contact the Sedifex team to connect your website so promo, gallery, and catalog
                    changes sync automatically.
                  </p>
                  <p className="account-overview__hint" style={{ marginTop: 8 }}>
                    Existing integrations can fetch this data using your integration API keys in the
                    <Link to="/settings#website-sync"> Integrations tab</Link>.
                  </p>
                </div>
              )}
            </>
          ) : (
            <p role="note">Only the workspace owner can change promo settings.</p>
          )}
        </section>
      )}

      {!isPromotionsView && activeTab === 'operations' && (
        <>
      {/* ✅ Billing summary: prefer profile.ownerEmail, fallback to auth email */}
      <AccountBillingSection
        storeId={storeId}
        ownerEmail={profile?.ownerEmail ?? user?.email ?? null}
        isOwner={isOwner}
        contractStatus={contractStatus}
        billingPlan={billingPlan}
        paymentProvider={subscriptionProfile?.provider ?? profile?.paymentProvider ?? 'Paystack'}
        contractEndDate={expiryDisplay}
      />

      {/* Billing history */}
      <section aria-labelledby="account-overview-billing-history">
        <div className="account-overview__section-header">
          <h2 id="account-overview-billing-history">Billing history</h2>
        </div>

        {subscriptionProfile ? (
          <dl className="account-overview__grid">
            <div>
              <dt>Last payment</dt>
              <dd>{lastPaymentDisplay}</dd>
            </div>
            <div>
              <dt>Current period starts</dt>
              <dd>{periodStartDisplay}</dd>
            </div>
            <div>
              <dt>Current period ends</dt>
              <dd>{expiryDisplay}</dd>
            </div>
            <div>
              <dt>Receipt</dt>
              <dd>
                {subscriptionProfile.receiptUrl ? (
                  <a
                    href={subscriptionProfile.receiptUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="button button--ghost"
                  >
                    Download receipt
                  </a>
                ) : (
                  '—'
                )}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-gray-600">
            No billing history yet. We’ll show receipts and renewal dates after your first
            successful payment.
          </p>
        )}
      </section>

      <section aria-labelledby="account-overview-deletion">
        <div className="account-overview__section-header">
          <h2 id="account-overview-deletion">Data controls</h2>
          <p className="account-overview__subtitle">
            Delete your workspace data instantly when you no longer want to keep it.
          </p>
        </div>

        <div className="account-overview__data-grid">
          <article className="account-overview__card">
            <h3>Delete workspace data</h3>
            <p className="account-overview__hint">
              Remove products, customers, sales, expenses, team members, the activity log, and your
              workspace profile from Sedifex. This action cannot be undone.
            </p>
            <div className="account-overview__danger-actions">
              <button
                type="button"
                className="button button--danger"
                onClick={handleDeleteWorkspaceData}
                disabled={!isOwner || isDeletingWorkspace}
                data-testid="account-delete-data"
              >
                {isDeletingWorkspace ? 'Deleting workspace data…' : 'Delete all workspace data'}
              </button>
              {!isOwner && (
                <p className="account-overview__hint" role="note">
                  Only the workspace owner can delete data.
                </p>
              )}
            </div>
          </article>

          <article className="account-overview__card">
            <h3>Delete your account</h3>
            <p className="account-overview__hint">
              Remove your Sedifex account and leave all workspaces. You may need to sign in again
              before deleting. This action cannot be undone.
            </p>
            <div className="account-overview__danger-actions">
              <button
                type="button"
                className="button button--danger"
                onClick={handleDeleteAccount}
                disabled={!user || isDeletingAccount}
                data-testid="account-delete-account"
              >
                {isDeletingAccount ? 'Deleting account…' : 'Delete my account'}
              </button>
              {!user && (
                <p className="account-overview__hint" role="note">
                  Sign in to delete your account.
                </p>
              )}
            </div>
          </article>
        </div>
      </section>

      <section aria-labelledby="account-overview-roster">
        <h2 id="account-overview-roster">Team roster</h2>

        {isOwner && pendingMembers.length > 0 && (
          <div
            className="account-overview__alert"
            role="alert"
            aria-live="polite"
            data-testid="account-pending-approvals"
          >
            <p className="account-overview__eyebrow">Action needed</p>
            <p className="account-overview__subtitle">
              These people signed up with your Store ID. Approve to grant access or reject to block
              it.
            </p>
            <div className="account-overview__approvals">
              {pendingMembers.map(member => (
                <article
                  key={member.id}
                  className="account-overview__approval-card"
                  data-testid={`account-roster-pending-${member.id}`}
                >
                  <div className="account-overview__approval-meta">
                    <p className="account-overview__approval-email">
                      {formatValue(member.email ?? member.firstSignupEmail)}
                    </p>
                    <p className="account-overview__hint">
                      Pending approval · Requested access as staff
                    </p>
                  </div>
                  <div className="account-overview__approval-actions">
                    <button
                      type="button"
                      className="button button--primary button--small"
                      onClick={() => handleApprovePending(member)}
                      disabled={pendingActionId === member.id}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="button button--ghost button--small"
                      onClick={() => handleRejectPending(member)}
                      disabled={pendingActionId === member.id}
                    >
                      Reject
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {isOwner ? (
          !rosterLoading && roster.length > 0 ? (
            <div className="account-overview__actions">
              <p className="account-overview__subtitle">
                Team members are saved in Firebase. Edit existing teammates directly.
              </p>
              <Link to="/staff" className="button button--secondary" data-testid="account-edit-team">
                Edit team members
              </Link>
            </div>
          ) : (
            <p role="note">Team members will appear here once they are available.</p>
          )
        ) : (
          <p role="note">You have read-only access to the team roster.</p>
        )}

        <table className="account-overview__roster" aria-label="Team roster">
          <thead>
            <tr>
              <th scope="col">Email</th>
              <th scope="col">Role</th>
              <th scope="col">Status</th>
              <th scope="col">Invited by</th>
              <th scope="col">Updated</th>
            </tr>
          </thead>
          <tbody>
            {roster.length === 0 && !rosterLoading ? (
              <tr className="account-overview__roster-empty">
                <td colSpan={5}>No team members found.</td>
              </tr>
            ) : (
              roster.map(member => (
                <tr
                  key={member.id}
                  data-testid={`account-roster-${member.id}`}
                  data-uid={member.uid}
                  data-store-id={member.storeId ?? undefined}
                  data-phone={member.phone ?? undefined}
                  data-status={member.status ?? undefined}
                  data-first-signup-email={member.firstSignupEmail ?? undefined}
                >
                  <td>{formatValue(member.email)}</td>
                  <td>{member.role === 'owner' ? 'Owner' : 'Staff'}</td>
                  <td>
                    <span className="account-overview__status" data-variant={member.status ?? 'active'}>
                      {formatStatus(member.status)}
                    </span>
                  </td>
                  <td>{formatValue(member.invitedBy)}</td>
                  <td>{formatTimestamp(member.updatedAt ?? member.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
        </>
      )}
    </div>
  )
}
