import { chatgptScopes } from '../../shared/chatgpt-scopes.js'
import type { VercelRequest,VercelResponse } from '@vercel/node'
export default function handler(req:VercelRequest,res:VercelResponse){
 if(req.method!=='GET')return res.status(405).end()
 const issuer=process.env.SEDIFEX_OAUTH_ISSUER?.replace(/\/$/,'')
 if(!issuer)return res.status(503).json({error:'not_configured'})
 return res.json({issuer,authorization_endpoint:issuer+'/api/chatgpt-oauth-authorize',token_endpoint:issuer+'/api/chatgpt-oauth-token',jwks_uri:issuer+'/api/chatgpt-oauth-jwks',response_types_supported:['code'],revocation_endpoint:issuer+'/api/chatgpt-oauth-revoke',grant_types_supported:['authorization_code','refresh_token'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none'],scopes_supported:chatgptScopes})
}
