import type { VercelRequest,VercelResponse } from '@vercel/node'
import { createPublicKey,createPrivateKey } from 'node:crypto'
import { exportJWK } from 'jose'
export default async function handler(req:VercelRequest,res:VercelResponse){
 if(req.method!=='GET')return res.status(405).end()
 const pem=process.env.SEDIFEX_OAUTH_PRIVATE_KEY?.replace(/\\n/g,'\n'),kid=process.env.SEDIFEX_OAUTH_KEY_ID
 if(!pem||!kid)return res.status(503).json({error:'not_configured'})
 const jwk=await exportJWK(createPublicKey(createPrivateKey(pem)))
 return res.status(200).json({keys:[{...jwk,kid,alg:'RS256',use:'sig'}]})
}
