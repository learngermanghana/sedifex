"use strict";
// functions/src/plans.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PLAN_ID = void 0;
exports.getBillingConfig = getBillingConfig;
exports.normalizePlanId = normalizePlanId;
exports.getPlanById = getPlanById;
exports.upsertPlanCatalog = upsertPlanCatalog;
exports.DEFAULT_PLAN_ID = 'starter';
const PLAN_CATALOG = {
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
    scale_plus: {
        id: 'scale_plus',
        label: 'Scale Plus',
        months: 1,
        monthlyPriceGhs: 2000,
        totalPriceGhs: 2000,
        discountPercent: null,
    },
};
function getBillingConfig() {
    return {
        trialDays: 14,
        defaultPlanId: exports.DEFAULT_PLAN_ID,
        plans: PLAN_CATALOG,
    };
}
const PLAN_ALIAS_MAP = {
    starter: 'starter',
    growth: 'growth',
    scale: 'scale',
    scale_plus: 'scale_plus',
    'scale-plus': 'scale_plus',
    'scale plus': 'scale_plus',
};
function normalizePlanId(raw) {
    if (!raw || typeof raw !== 'string')
        return null;
    const key = raw.trim().toLowerCase();
    return PLAN_ALIAS_MAP[key] ?? null;
}
function getPlanById(planId) {
    const id = planId ?? exports.DEFAULT_PLAN_ID;
    return PLAN_CATALOG[id] ?? PLAN_CATALOG[exports.DEFAULT_PLAN_ID];
}
async function upsertPlanCatalog() {
    return;
}
