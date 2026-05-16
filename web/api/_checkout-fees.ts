export type CheckoutUseCase = 'product' | 'service' | 'booking' | 'donation' | 'student_registration' | 'registration' | 'custom'

export type CheckoutFeePolicy = {
  policyKey: string
  currency: string
  baseAmountMajor: number
  customerProcessingFeePercent: number
  customerProcessingFeeMajor: number
  customerTotalMajor: number
  sedifexCommissionPercent: number
  sedifexCommissionMajor: number
  merchantGrossMajor: number
  merchantNetMajor: number
  customerPaysProcessingFee: boolean
  merchantPaysCommission: boolean
  useCase: CheckoutUseCase
}

const toNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export const resolveSedifexCommissionPercent = (useCase: CheckoutUseCase) => {
  if (useCase === 'service' || useCase === 'booking') return toNumber(process.env.SEDIFEX_SERVICE_COMMISSION_PERCENT, 5)
  if (useCase === 'donation') return toNumber(process.env.SEDIFEX_DONATION_COMMISSION_PERCENT, 0)
  if (useCase === 'student_registration' || useCase === 'registration') return toNumber(process.env.SEDIFEX_REGISTRATION_COMMISSION_PERCENT, 3)
  if (useCase === 'custom') return toNumber(process.env.SEDIFEX_CUSTOM_PAYMENT_COMMISSION_PERCENT, 3)
  return toNumber(process.env.SEDIFEX_PRODUCT_COMMISSION_PERCENT, 3)
}

export const calculateCheckoutFees = (input: { amount: number; currency?: string; useCase?: CheckoutUseCase }): CheckoutFeePolicy => {
  const baseAmountMajor = roundMoney(Math.max(0, Number.isFinite(input.amount) ? input.amount : 0))
  const currency = (input.currency || 'GHS').trim().toUpperCase() || 'GHS'
  const useCase = input.useCase || 'custom'
  const customerProcessingFeePercent = toNumber(process.env.SEDIFEX_CUSTOMER_PROCESSING_FEE_PERCENT, 1.95)
  const sedifexCommissionPercent = resolveSedifexCommissionPercent(useCase)
  const customerProcessingFeeMajor = roundMoney((baseAmountMajor * customerProcessingFeePercent) / 100)
  const customerTotalMajor = roundMoney(baseAmountMajor + customerProcessingFeeMajor)
  const sedifexCommissionMajor = roundMoney((baseAmountMajor * sedifexCommissionPercent) / 100)
  const merchantGrossMajor = baseAmountMajor
  const merchantNetMajor = roundMoney(Math.max(0, merchantGrossMajor - sedifexCommissionMajor))

  return {
    policyKey: 'sedifex_standard_v1',
    currency,
    baseAmountMajor,
    customerProcessingFeePercent,
    customerProcessingFeeMajor,
    customerTotalMajor,
    sedifexCommissionPercent,
    sedifexCommissionMajor,
    merchantGrossMajor,
    merchantNetMajor,
    customerPaysProcessingFee: true,
    merchantPaysCommission: true,
    useCase,
  }
}

export const toPaystackMinorAmount = (fees: CheckoutFeePolicy) => Math.round(fees.customerTotalMajor * 100)
