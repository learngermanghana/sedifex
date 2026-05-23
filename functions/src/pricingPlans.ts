import * as functions from 'firebase-functions/v1'

export type SedifexPlanId = 'starter' | 'business' | 'growth_website'

export type SedifexPlanEntitlements = {
  id: SedifexPlanId
  name: string
  monthlyPriceGhs: number
  yearlyPriceGhs: number | null
  staffUsers: number
  productServiceLimit: number | null
  productServiceLimitLabel: string
  productServiceFairUse: boolean
  receiptInvoiceMonthlyLimit: number | null
  workspace: {
    includedOwnedWorkspaces: number
    extraWorkspaceAllowed: boolean
    extraWorkspacePriceGhs: number | null
    invitedWorkspaceSwitching: boolean
  }
  features: {
    publicSedifexPage: boolean
    qrPublicLink: boolean
    sedifexBranding: boolean
    limitedReports: boolean
    basicReports: boolean
    basicWebsiteBuilder: boolean
    fullWebsiteBuilder: boolean
    websiteTemplateLibrary: boolean
    customDomain: boolean
    seoSettings: boolean
    socialLinks: boolean
    quickPay: boolean
    sedifexMarketSync: boolean
    sedifexMarketSalesSync: boolean
    websiteCheckout: boolean
    productsApi: boolean
    bookingsApi: boolean
    websiteSalesReport: boolean
    marketplaceSalesReport: boolean
    brandedSms: boolean
  }
  sms: {
    brandedSmsAvailable: boolean
    requiresPurchasedCredits: boolean
    includedMonthlyCredits: number
    creditModel: 'pay_as_you_go'
    note: string
  }
}

export const SEDIFEX_PRICING_PLANS: Record<SedifexPlanId, SedifexPlanEntitlements> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    monthlyPriceGhs: 0,
    yearlyPriceGhs: null,
    staffUsers: 1,
    productServiceLimit: 50,
    productServiceLimitLabel: 'Up to 50 products/services',
    productServiceFairUse: false,
    receiptInvoiceMonthlyLimit: 30,
    workspace: {
      includedOwnedWorkspaces: 1,
      extraWorkspaceAllowed: false,
      extraWorkspacePriceGhs: null,
      invitedWorkspaceSwitching: true,
    },
    features: {
      publicSedifexPage: true,
      qrPublicLink: true,
      sedifexBranding: true,
      limitedReports: true,
      basicReports: false,
      basicWebsiteBuilder: false,
      fullWebsiteBuilder: false,
      websiteTemplateLibrary: false,
      customDomain: false,
      seoSettings: false,
      socialLinks: false,
      quickPay: false,
      sedifexMarketSync: false,
      sedifexMarketSalesSync: false,
      websiteCheckout: false,
      productsApi: false,
      bookingsApi: false,
      websiteSalesReport: false,
      marketplaceSalesReport: false,
      brandedSms: true,
    },
    sms: {
      brandedSmsAvailable: true,
      requiresPurchasedCredits: true,
      includedMonthlyCredits: 0,
      creditModel: 'pay_as_you_go',
      note: 'Branded SMS is available when SMS credits are purchased. No monthly SMS credits are bundled with the plan.',
    },
  },
  business: {
    id: 'business',
    name: 'Business',
    monthlyPriceGhs: 99,
    yearlyPriceGhs: 999,
    staffUsers: 2,
    productServiceLimit: null,
    productServiceLimitLabel: 'Unlimited products/services under fair use',
    productServiceFairUse: true,
    receiptInvoiceMonthlyLimit: null,
    workspace: {
      includedOwnedWorkspaces: 1,
      extraWorkspaceAllowed: true,
      extraWorkspacePriceGhs: 49,
      invitedWorkspaceSwitching: true,
    },
    features: {
      publicSedifexPage: true,
      qrPublicLink: true,
      sedifexBranding: false,
      limitedReports: false,
      basicReports: true,
      basicWebsiteBuilder: true,
      fullWebsiteBuilder: false,
      websiteTemplateLibrary: false,
      customDomain: false,
      seoSettings: false,
      socialLinks: true,
      quickPay: true,
      sedifexMarketSync: true,
      sedifexMarketSalesSync: true,
      websiteCheckout: false,
      productsApi: false,
      bookingsApi: false,
      websiteSalesReport: false,
      marketplaceSalesReport: false,
      brandedSms: true,
    },
    sms: {
      brandedSmsAvailable: true,
      requiresPurchasedCredits: true,
      includedMonthlyCredits: 0,
      creditModel: 'pay_as_you_go',
      note: 'Branded SMS is available when SMS credits are purchased. No monthly SMS credits are bundled with the plan.',
    },
  },
  growth_website: {
    id: 'growth_website',
    name: 'Growth Website',
    monthlyPriceGhs: 199,
    yearlyPriceGhs: 1999,
    staffUsers: 5,
    productServiceLimit: null,
    productServiceLimitLabel: 'Unlimited products/services under fair use',
    productServiceFairUse: true,
    receiptInvoiceMonthlyLimit: null,
    workspace: {
      includedOwnedWorkspaces: 1,
      extraWorkspaceAllowed: true,
      extraWorkspacePriceGhs: 99,
      invitedWorkspaceSwitching: true,
    },
    features: {
      publicSedifexPage: true,
      qrPublicLink: true,
      sedifexBranding: false,
      limitedReports: false,
      basicReports: true,
      basicWebsiteBuilder: true,
      fullWebsiteBuilder: true,
      websiteTemplateLibrary: true,
      customDomain: true,
      seoSettings: true,
      socialLinks: true,
      quickPay: true,
      sedifexMarketSync: true,
      sedifexMarketSalesSync: true,
      websiteCheckout: true,
      productsApi: true,
      bookingsApi: true,
      websiteSalesReport: true,
      marketplaceSalesReport: true,
      brandedSms: true,
    },
    sms: {
      brandedSmsAvailable: true,
      requiresPurchasedCredits: true,
      includedMonthlyCredits: 0,
      creditModel: 'pay_as_you_go',
      note: 'Branded SMS is available when SMS credits are purchased. No monthly SMS credits are bundled with the plan.',
    },
  },
}

const LEGACY_PLAN_MAP: Record<string, SedifexPlanId> = {
  free: 'starter',
  trial: 'starter',
  old_starter: 'starter',
  starter_monthly: 'starter',
  growth: 'business',
  old_growth: 'business',
  scale: 'growth_website',
  scale_plus: 'growth_website',
  old_scale: 'growth_website',
  old_scale_plus: 'growth_website',
}

export function normalizePlanId(planId: string | null | undefined): SedifexPlanId {
  const normalized = String(planId || 'starter').trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_')
  if (normalized === 'starter' || normalized === 'business' || normalized === 'growth_website') {
    return normalized
  }
  return LEGACY_PLAN_MAP[normalized] ?? 'starter'
}

export function getPlanEntitlements(planId: string | null | undefined): SedifexPlanEntitlements {
  return SEDIFEX_PRICING_PLANS[normalizePlanId(planId)]
}

export function isLegacyPlanId(planId: string | null | undefined): boolean {
  const normalized = String(planId || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_')
  return Boolean(normalized && LEGACY_PLAN_MAP[normalized])
}

export function canUploadProduct(planId: string | null | undefined, currentProductCount: number): boolean {
  const plan = getPlanEntitlements(planId)
  if (plan.productServiceLimit === null) return true
  return currentProductCount < plan.productServiceLimit
}

export function canUseBrandedSms(planId: string | null | undefined, smsCreditBalance: number): boolean {
  const plan = getPlanEntitlements(planId)
  return plan.sms.brandedSmsAvailable && smsCreditBalance > 0
}

export const getPricingPlans = functions.https.onCall(async () => ({
  ok: true,
  plans: Object.values(SEDIFEX_PRICING_PLANS),
  legacyPlanMap: LEGACY_PLAN_MAP,
  rules: {
    productUpload: 'Starter is limited to 50 products/services. Paid plans are unlimited under fair use.',
    brandedSms: 'Branded SMS is available on all plans when SMS credits are purchased.',
    workspace: 'One subscription includes one owned workspace. Paid plans can add extra owned workspaces at the configured add-on price.',
    legacyContracts: 'Existing paid legacy contracts keep access until their current period ends. On renewal, customers choose Business or Growth Website.',
  },
}))
