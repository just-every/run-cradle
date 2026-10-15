import type {PublicDocument} from '../public-document.server'
import {Link} from '@tanstack/react-router'
import {useState} from 'react'
import {useSeedConfig} from '../router'
import {PublicLayout} from '../ui/public-layout'

import {signInErrors,type SignInSearch} from './sign-in-search'

export function SignInPage({publicDocument,search}:{publicDocument:PublicDocument;search:SignInSearch}){
 const configured=useSeedConfig(),config={...configured,workspaceName:publicDocument.workspaceName??configured.workspaceName}
 const [error,setError]=useState(''),[email,setEmail]=useState(''),[submitting,setSubmitting]=useState(false),[accepted,setAccepted]=useState(false)
 const noticeError=search.notice&&Object.hasOwn(signInErrors,search.notice)?signInErrors[search.notice as keyof typeof signInErrors]:''
 const requestReceived=publicDocument.ownerClaimed&&publicDocument.magicLink&&(accepted||search.notice==='sent')
 // Defaults belong to the form, not the validated URL: adding search here
 // would make Start redirect the public bare /signin document.
 const returnTo=search.returnTo??(search.notice==='sent'?'/app':'/setup')
 const anotherAddress='/signin?'+new URLSearchParams({returnTo})
 async function submit(){
  if(submitting)return
  setSubmitting(true);setError('')
  try{
   const response=await fetch('/auth/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,returnTo})})
   if(!response.ok){const body=await response.json() as {error?:{message?:string}};throw new Error(body.error?.message??`Sign-in returned ${response.status}.`)}
   setAccepted(true)
  }catch(caught){setError(caught instanceof Error?caught.message:'Sign-in could not be requested.')}finally{setSubmitting(false)}
 }
 return <PublicLayout config={config}><section className="cr-identity">
  <p className="cr-eyebrow">{config.workspaceName}</p><h1>Sign in</h1>
  {!requestReceived&&(error||noticeError)&&<p className="cr-error" role="alert">{error||noticeError}</p>}
  {search.notice==='signed_out'&&<p role="status">You are signed out.</p>}
  {search.notice==='step_up_sent'&&<p role="status">A confirmation link has been requested. Open it in this browser to continue.</p>}
  {!publicDocument.ownerClaimed?<div role="status"><h2>Owner setup is incomplete</h2><p>The person hosting Cradle must run <code>rer deploy</code> again and wait for the owner claim to succeed. Then return here to sign in.</p><p>Running Cradle on this computer? Run <code>rer dev</code> to open your workspace.</p></div>:requestReceived?<div role="status"><h2>Check your email</h2><p>If this address is allowed, a sign-in link will arrive shortly. Open it in this browser to continue.</p><a className="cr-button cr-button--quiet" href={anotherAddress}>Use another address</a></div>:publicDocument.magicLink?
   <form method="post" action="/auth/magic-link" onSubmit={event=>{event.preventDefault();void submit()}}>
    <input type="hidden" name="returnTo" value={returnTo}/>
    <div className="cr-field"><label htmlFor="signin-email">Email address</label><input name="email" autoComplete="email" id="signin-email" type="email" value={email} onChange={event=>setEmail(event.target.value)} required/></div>
    <button className="cr-button cr-button--go" disabled={submitting}>{submitting?'Requesting link…':'Send sign-in link'}</button>
   </form>:<div role="status"><h2>Sign-in email is not configured</h2><p>The person hosting Cradle must configure the mail provider, sender and API key, then deploy again. For local use, run <code>rer dev</code> to open your workspace.</p></div>}
  {!requestReceived&&publicDocument.identityProviders?.map(provider=><form key={provider.startPath} method="post" action={provider.startPath}>
   <input type="hidden" name="returnTo" value={returnTo}/>
   <button className="cr-button cr-button--quiet">Continue with {provider.label}</button>
  </form>)}
  <div className="cr-identity-links">
   <a className="cr-link" href="/">Back to home</a>
  </div>
 </section></PublicLayout>
}
