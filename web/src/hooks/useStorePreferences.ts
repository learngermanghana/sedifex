import { useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { CustomNavItem, Industry, NavigationLabelPolicy } from '../config/navigation'

export type ProductDefaults = {
  defaultItemType: 'product' | 'service' | 'made_to_order'
  enableManufacturerFields: boolean
  enableNonInventoryMode: boolean
}

export type StorePreferences = {
  productDefaults: ProductDefaults
  navigation: {
    industry: Industry
    labelPolicy: NavigationLabelPolicy
    enabledModules: string[]
    customLabels: Partial<Record<string, string>>
    customNavItems: CustomNavItem[]
  }
}

const DEFAULT_PREFERENCES: StorePreferences = {
  productDefaults: {
    defaultItemType: 'product',
    enableManufacturerFields: false,
    enableNonInventoryMode: false,
  },
  navigation: {
    industry: 'shop',
    labelPolicy: 'shared',
    enabledModules: [],
    customLabels: {},
    customNavItems: [],
  },
}

function mergePreferences(raw: Record<string, unknown> | undefined | null): StorePreferences {
  const productDefaults: ProductDefaults = {
    defaultItemType:
      raw?.productDefaults &&
      typeof (raw.productDefaults as any).defaultItemType === 'string' &&
      ['product', 'service', 'made_to_order'].includes(
        (raw.productDefaults as any).defaultItemType,
      )
        ? ((raw.productDefaults as any).defaultItemType as ProductDefaults['defaultItemType'])
        : DEFAULT_PREFERENCES.productDefaults.defaultItemType,
    enableManufacturerFields:
      raw?.productDefaults?.enableManufacturerFields === true ??
      DEFAULT_PREFERENCES.productDefaults.enableManufacturerFields,
    enableNonInventoryMode:
      raw?.productDefaults?.enableNonInventoryMode === true ??
      DEFAULT_PREFERENCES.productDefaults.enableNonInventoryMode,
  }

  const allowedIndustries: Industry[] = ['shop', 'travel', 'ngo', 'school']
  const industry =
    raw?.navigation &&
    typeof (raw.navigation as any).industry === 'string' &&
    allowedIndustries.includes((raw.navigation as any).industry)
      ? ((raw.navigation as any).industry as Industry)
      : DEFAULT_PREFERENCES.navigation.industry

  const labelPolicy =
    raw?.navigation &&
    typeof (raw.navigation as any).labelPolicy === 'string' &&
    ['shared', 'industry_aliases'].includes((raw.navigation as any).labelPolicy)
      ? ((raw.navigation as any).labelPolicy as NavigationLabelPolicy)
      : DEFAULT_PREFERENCES.navigation.labelPolicy

  const customLabels =
    raw?.navigation && typeof (raw.navigation as any).customLabels === 'object'
      ? (Object.entries((raw.navigation as any).customLabels as Record<string, unknown>).reduce(
          (acc, [key, value]) => {
            if (typeof value === 'string') {
              const trimmed = value.trim()
              if (trimmed) acc[key] = trimmed
            }
            return acc
          },
          {} as Partial<Record<string, string>>,
        ) as Partial<Record<string, string>>)
      : DEFAULT_PREFERENCES.navigation.customLabels


  const enabledModules =
    raw?.navigation && Array.isArray((raw.navigation as any).enabled_modules)
      ? ((raw.navigation as any).enabled_modules as unknown[]).reduce<string[]>((acc, value) => {
          if (typeof value === 'string' && value.trim()) acc.push(value.trim())
          return acc
        }, [])
      : DEFAULT_PREFERENCES.navigation.enabledModules

  const customNavItems =
    raw?.navigation && Array.isArray((raw.navigation as any).custom_nav_items)
      ? ((raw.navigation as any).custom_nav_items as Record<string, unknown>[]).reduce<CustomNavItem[]>((acc, item) => {
          const id = typeof item.id === 'string' ? item.id.trim() : ''
          const label = typeof item.label === 'string' ? item.label.trim() : ''
          const type = item.type
          const target = typeof item.target === 'string' ? item.target.trim() : ''
          const sortOrder = typeof item.sort_order === 'number' ? item.sort_order : 0
          const rolesAllowed = Array.isArray(item.roles_allowed)
            ? item.roles_allowed.filter(role => role === 'owner' || role === 'staff')
            : []

          if (!id || !label || !target || rolesAllowed.length === 0) return acc
          if (type !== 'module' && type !== 'internal' && type !== 'external') return acc

          acc.push({
            id,
            label,
            type,
            target,
            sort_order: sortOrder,
            roles_allowed: rolesAllowed as Array<'owner' | 'staff'>,
          })
          return acc
        }, [])
      : DEFAULT_PREFERENCES.navigation.customNavItems

  return {
    productDefaults,
    navigation: { industry, labelPolicy, enabledModules, customLabels, customNavItems },
  }

}

export function useStorePreferences(storeId: string | null) {
  const [preferences, setPreferences] = useState<StorePreferences>(DEFAULT_PREFERENCES)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!storeId) {
      setPreferences(DEFAULT_PREFERENCES)
      return undefined
    }

    setLoading(true)
    const ref = doc(db, 'storeSettings', storeId)
    const unsubscribe = onSnapshot(
      ref,
      snapshot => {
        const data = snapshot.data() as Record<string, unknown> | undefined
        setPreferences(mergePreferences(data))
        setLoading(false)
      },
      () => setLoading(false),
    )

    return unsubscribe
  }, [storeId])

  const updatePreferences = useMemo(
    () =>
      async (changes: Partial<StorePreferences>) => {
        if (!storeId) return
        await setDoc(doc(db, 'storeSettings', storeId), changes, { merge: true })
      },
    [storeId],
  )

  return { preferences, loading, updatePreferences }
}
