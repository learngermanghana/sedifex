import { afterEach, describe, expect, it, vi } from 'vitest'
import { payWithPaystack, resumePaystackTransaction } from '../paystack'

describe('Paystack request-hashing readiness', () => {
  afterEach(() => {
    delete window.PaystackPop
    vi.restoreAllMocks()
  })

  it('never starts a Paystack transaction directly from the browser', async () => {
    const result = await payWithPaystack(25, { email: 'buyer@example.test' })
    expect(result.ok).toBe(false)
    expect(result.reference).toBeNull()
    expect(result.error).toMatch(/server-created checkout/i)
  })

  it('resumes only the access code issued by Sedifex backend', async () => {
    const resume = vi.fn()
    window.PaystackPop = class {
      resumeTransaction = resume
    }

    expect(await resumePaystackTransaction('server_access_code')).toBe(true)
    expect(resume).toHaveBeenCalledExactlyOnceWith('server_access_code')
  })

  it('rejects a missing access code', async () => {
    const resume = vi.fn()
    window.PaystackPop = class {
      resumeTransaction = resume
    }

    expect(await resumePaystackTransaction('')).toBe(false)
    expect(resume).not.toHaveBeenCalled()
  })
})
