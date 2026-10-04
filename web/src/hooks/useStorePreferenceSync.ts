import { useCallback, useEffect, useRef } from 'react'

type StorePreferenceSyncOptions<T> = {
  storeId: string | null | undefined
  keyPrefix: string
  value: T
  defaultValue: T
  apply: (value: T) => void
  serialize: (value: T) => string
  deserialize: (raw: string) => T
  debugName: string
}

type HydrationState = {
  storageKey: string
  serializedValue: string
  pending: boolean
}

/**
 * Keeps workspace-scoped UI preferences in localStorage without allowing
 * React StrictMode's mount-effect replay to overwrite restored values.
 *
 * The owning screen keeps its normal React state. This hook only handles the
 * restore/persist lifecycle, so complex filter state does not need to be
 * rewritten around a storage abstraction.
 */
export function useStorePreferenceSync<T>({
  storeId,
  keyPrefix,
  value,
  defaultValue,
  apply,
  serialize,
  deserialize,
  debugName,
}: StorePreferenceSyncOptions<T>) {
  const applyRef = useRef(apply)
  const defaultValueRef = useRef(defaultValue)
  const serializeRef = useRef(serialize)
  const deserializeRef = useRef(deserialize)
  const debugNameRef = useRef(debugName)
  const hydrationRef = useRef<HydrationState | null>(null)

  applyRef.current = apply
  defaultValueRef.current = defaultValue
  serializeRef.current = serialize
  deserializeRef.current = deserialize
  debugNameRef.current = debugName

  const storageKey = storeId ? `${keyPrefix}${storeId}` : null
  const serializedValue = serialize(value)

  useEffect(() => {
    if (!storageKey) {
      hydrationRef.current = null
      return
    }

    let restored = defaultValueRef.current
    let restoredSerialized = serializeRef.current(restored)

    try {
      const stored = localStorage.getItem(storageKey)
      if (stored !== null) {
        restored = deserializeRef.current(stored)
        restoredSerialized = serializeRef.current(restored)
      }
    } catch (storageError) {
      console.warn(`[${debugNameRef.current}] Unable to load saved preference`, storageError)
    }

    hydrationRef.current = {
      storageKey,
      serializedValue: restoredSerialized,
      pending: true,
    }
    applyRef.current(restored)
  }, [storageKey])

  useEffect(() => {
    if (!storageKey) return

    const hydration = hydrationRef.current
    if (!hydration || hydration.storageKey !== storageKey) return

    if (hydration.pending) {
      if (serializedValue === hydration.serializedValue) {
        hydration.pending = false
      }
      return
    }

    if (serializedValue === hydration.serializedValue) return

    try {
      localStorage.setItem(storageKey, serializedValue)
      hydration.serializedValue = serializedValue
    } catch (storageError) {
      console.warn(`[${debugNameRef.current}] Unable to save preference`, storageError)
    }
  }, [serializedValue, storageKey])

  const clearPreference = useCallback(() => {
    const resetValue = defaultValueRef.current
    const resetSerialized = serializeRef.current(resetValue)

    if (storageKey) {
      try {
        localStorage.removeItem(storageKey)
      } catch (storageError) {
        console.warn(`[${debugNameRef.current}] Unable to clear saved preference`, storageError)
      }
      hydrationRef.current = {
        storageKey,
        serializedValue: resetSerialized,
        pending: false,
      }
    } else {
      hydrationRef.current = null
    }

    applyRef.current(resetValue)
  }, [storageKey])

  return { clearPreference }
}
