import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHash, createPrivateKey } from 'node:crypto'
import { SignJWT } from 'jose'
import { db } from '../../api/_firebase-admin.js'
const hash = (s:string) => createHash('sha256').update(s).digest('base64url')
export default async function handler(req:VercelRequest,res:VercelResponse) {
 res.setHeader('Cache-Control','no-store')
 if(req.method!=='POST')return res.status(405).end()
 const body = typeof req.body==='string'?Object.fromEntries(new URLSearchParams(req.body)):req.body||{}
 const {grant_type,code,code_verifier,client_id,redirect_uri}=body
 const issuer=process.env.SEDIFEX_OAUTH_ISSUER?.replace(/\/$/,'')
 const audience=process.env.SEDIFEX_MCP_RESOURCE_URL
 const pem=process.env.SEDIFEX_OAUTH_PRIVATE_KEY?.replace(/\\n/g,'\n')
 const kid=process.env.SEDIFEX_OAUTH_KEY_ID
 if(!issuer||!audience||!pem||!kid||!process.env.SEDIFEX_OAUTH_CLIENT_ID)return res.status(503).json({error:'server_unavailable'})
 if(grant_type!=='authorization_code'||client_id!==process.env.SEDIFEX_OAUTH_CLIENT_ID||typeof code!=='string'||typeof code_verifier!=='string'||!/^[A-Za-z0-9._~-]{43,128}$/.test(code_verifier)||typeof redirect_uri!=='string')return res.status(400).json({error:'invalid_request'})
 try{
  const ref=db().collection('chatgpt_oauth_codes').doc(hash(code))
  const uid=await db().runTransaction(async tx=>{
   const snap=await tx.get(ref),data=snap.data()
   if(!data||data.expiresAt<Date.now()||data.clientId!==client_id||data.redirectUri!==redirect_uri||data.challenge!==hash(code_verifier)||data.resource!==audience)throw Error('invalid_grant')
   const allowed=(process.env.SEDIFEX_MCP_TEST_UIDS||'').split(',').map(x=>x.trim())
   if(!allowed.includes(data.uid))throw Error('invalid_grant')
   tx.delete(ref)
   return {uid:data.uid,scope:data.scope}
  })
  const token=await new SignJWT({scope:uid.scope}).setProtectedHeader({alg:'RS256',kid}).setIssuer(issuer).setAudience(audience).setSubject(uid.uid).setIssuedAt().setExpirationTime('15m').sign(createPrivateKey(pem))
  return res.status(200).json({access_token:token,token_type:'Bearer',expires_in:900,scope:uid.scope})
 }catch{return res.status(400).json({error:'invalid_grant'})}
}
