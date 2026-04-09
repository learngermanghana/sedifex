import type { VercelRequest } from '@vercel/node'
import { getAuth } from 'firebase-admin/auth'
import { getAdmin } from './_firebase-admin.js'

export type ApiAuthedUser = {
  uid: string
  email: string
}

export async function requireApiUser(req: VercelRequest): Promise<ApiAuthedUser> {
  const authHeader = req.headers.authorization
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    throw new Error('missing-auth')
  }

  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) throw new Error('missing-auth')

  const decoded = await getAuth(getAdmin()).verifyIdToken(token)
  if (!decoded.uid) throw new Error('invalid-auth')

  return {
    uid: decoded.uid,
    email: typeof decoded.email === 'string' ? decoded.email : '',
  }
}
