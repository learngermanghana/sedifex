/**
 * Paystack Inline V2 must only resume access codes initialized by Sedifex's
 * server with its secret key. Never call setup/newTransaction with a public key.
 * See https://paystack.com/docs/developer-tools/inlinejs/#resume-transaction
 */
declare global {
  interface Window {
    PaystackPop?: new () => { resumeTransaction(accessCode: string): void }
  }
}

const SCRIPT_URL = 'https://js.paystack.co/v2/inline.js'
let loading: Promise<NonNullable<Window['PaystackPop']> | null> | null = null

export async function loadPaystackScript(): Promise<NonNullable<Window['PaystackPop']> | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null
  if (window.PaystackPop) return window.PaystackPop
  if (!loading) {
    loading = new Promise(resolve => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_URL}"]`)
      const script = existing ?? document.createElement('script')
      script.src = SCRIPT_URL
      script.async = true
      script.onload = () => resolve(window.PaystackPop ?? null)
      script.onerror = () => {
        loading = null
        if (!existing) script.remove()
        resolve(null)
      }
      if (!existing) document.body.appendChild(script)
    })
  }
  return loading
}

/** Returns false when inline checkout cannot open; callers can use the
 * server-returned Paystack authorizationUrl as a secure redirect fallback. */
export async function resumePaystackTransaction(accessCode: string): Promise<boolean> {
  if (!accessCode || !accessCode.trim()) return false
  const Popup = await loadPaystackScript()
  if (!Popup) return false
  try {
    const paystack = new Popup()
    paystack.resumeTransaction(accessCode)
    return true
  } catch {
    return false
  }
}

export interface PaystackBuyer {
  email?: string
  phone?: string
  name?: string
}
export interface PaystackResult {
  ok: boolean
  reference: string | null
  status?: string | null
  error?: string
}

/** Deprecated: fail closed rather than initializing a payment in the browser. */
export async function payWithPaystack(
  _amountGhs: number,
  _buyer?: PaystackBuyer,
): Promise<PaystackResult> {
  return {
    ok: false,
    reference: null,
    error: 'Direct browser-initiated payments are disabled. Use a Sedifex server-created checkout.',
  }
}
