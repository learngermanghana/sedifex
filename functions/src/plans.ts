// functions/src/plans.ts

export type PlanId = 'starter' | 'growth' | 'scale'

export type Plan = {
  id: PlanId
  label: string
  months: number
  monthlyPriceGhs: number
  totalPriceGhs: number
  discountPercent: number | null
  isDefault?: boolean
}

export const DEFAULT_PLAN_ID: PlanId = 'starter'

const PLAN_CATALOG: Record<PlanId, Plan> = {
  starter: {
    id: 'starter',
    label: 'Starter',
    months: 1,
    monthlyPriceGhs: 20,
    totalPriceGhs: 20,
    discountPercent: null,
    isDefault: true,
  },
  growth: {
    id: 'growth',
    label: 'Growth',
    months: 1,
    monthlyPriceGhs: 50,
    totalPriceGhs: 50,
    discountPercent: null,
  },
  scale: {
    id: 'scale',
    label: 'Scale',
    months: 1,
    monthlyPriceGhs: 100,
    totalPriceGhs: 100,
    discountPercent: null,
  },
}

export function getBillingConfig() {
  return {
    trialDays: 14,
    defaultPlanId: DEFAULT_PLAN_ID,
    plans: PLAN_CATALOG,
  }
}

const PLAN_ALIAS_MAP: Record<string, PlanId> = {
  starter: 'starter',
  growth: 'growth',
  scale: 'scale',
}

export function normalizePlanId(raw: unknown): PlanId | null {
  if (!raw || typeof raw !== 'string') return null
  const key = raw.trim().toLowerCase()
  return PLAN_ALIAS_MAP[key] ?? null
}

export function getPlanById(planId?: PlanId | null): Plan | null {
  const id = planId ?? DEFAULT_PLAN_ID
  return PLAN_CATALOG[id] ?? PLAN_CATALOG[DEFAULT_PLAN_ID]
}

export async function upsertPlanCatalog(): Promise<void> {
  return
}
