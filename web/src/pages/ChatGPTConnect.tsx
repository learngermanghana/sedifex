import { scopeDescriptions } from '../../shared/chatgpt-scopes'
import { useEffect, useState } from 'react'
import { auth } from '../firebase'
import { onAuthStateChanged, signInWithEmailAndPassword } from 'firebase/auth'

export default function ChatGPTConnect() {
 const params = new URLSearchParams(window.location.search)
 const [signedIn,setSignedIn]=useState(Boolean(auth.currentUser))
 useEffect(()=>onAuthStateChanged(auth,user=>setSignedIn(Boolean(user))),[])
 const [email,setEmail]=useState('')
 const [password,setPassword]=useState('')
 const [error,setError]=useState('')
 const [busy,setBusy]=useState(false)
 const scope=params.get('scope')||''
 const valid= params.get('response_type')==='code' && params.get('code_challenge_method')==='S256' && !!params.get('state') && !!params.get('client_id')
 async function approve() {
  setBusy(true);setError('')
  try {
   let user=auth.currentUser
   if(!user) {
    if(!email||!password) throw new Error('Sign in to Sedifex first.')
    user=(await signInWithEmailAndPassword(auth,email,password)).user
   }
   const token=await user.getIdToken()
   const response=await fetch('/api/chatgpt-oauth-authorize',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(Object.fromEntries(params.entries()))})
   const data=await response.json()
   if(!response.ok||!data.redirect_url)throw new Error(data.error||'Connection failed')
   const destination=new URL(data.redirect_url)
   if(destination.protocol!=='https:')throw new Error('Invalid redirect')
   window.location.assign(destination.toString())
  }catch(e){setError(e instanceof Error?e.message:'Unable to connect')}finally{setBusy(false)}
 }
 return <main style={{maxWidth:480,margin:'6vh auto',padding:24}}>
  <h1>Connect Sedifex to ChatGPT</h1>
  <p>ChatGPT requests the Sedifex permissions listed below. Business management actions apply only to stores you own. Booking access is limited to appointments you create through ChatGPT.</p>
  <p><strong>Permissions:</strong> {scope.split(' ').filter(Boolean).map(s => scopeDescriptions[s as keyof typeof scopeDescriptions] || s).join(' ')}</p>
  <p>Your password is sent only to Firebase Authentication, never to ChatGPT.</p>
  {!signedIn&&<form onSubmit={e=>{e.preventDefault();void approve()}}>
   <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label>
   <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required /></label>
   <button disabled={busy||!valid} type="submit">Sign in and approve</button>
  </form>}
  {signedIn&&<button disabled={busy||!valid} onClick={()=>void approve()}>Approve connection</button>}
  <button type="button" onClick={()=>window.location.assign('/dashboard')}>Cancel</button>
  {!valid&&<p>Invalid authorization request.</p>}
  {error&&<p role="alert">{error}</p>}
 </main>
}
