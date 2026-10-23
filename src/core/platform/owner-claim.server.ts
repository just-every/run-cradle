import {createOwnerClaimHandler} from '../../../vendor/base/modules/owner-claim/index.mjs'
import {AuthError,normalizeEmail,securityHeaders} from '../../../vendor/base/modules/operator-auth/index.mjs'
import {localMailEnabled} from './local-auth.server'
import {namedOwnerClaim} from './owner-name.server'
import type {PlatformBindings} from './bindings'

/** Every trust value is installation configuration; a claim cannot set it. */
export async function signedOwnerClaim(request:Request,env:PlatformBindings){
 if(new URL(request.url).pathname!=='/auth/owner-claim')return null
 try{
  const origin=env.APP_ORIGIN??'',email=normalizeEmail(env.OWNER_EMAIL)
  const claim=createOwnerClaimHandler({db:env.DB,authConfig:{local:localMailEnabled(env),origin,OWNER_EMAIL:email,
   SESSION_SECRET:env.SESSION_SECRET??'',SETUP_TOKEN:env.SETUP_TOKEN},
   clientIp:(request:Request)=>request.headers.get('CF-Connecting-IP')??'',
   issuer:env.RER_OWNER_CLAIM_ISSUER??'',installationId:env.RER_OWNER_CLAIM_INSTALLATION_ID??'',appOrigin:env.RER_DEMO==='1'?origin:env.RER_OWNER_CLAIM_APP_ORIGIN??'',
   expectedEmail:email,publicKeys:JSON.parse(env.RER_OWNER_CLAIM_PUBLIC_KEYS??'null')})
  return await claim(await namedOwnerClaim(request,env))
 }catch(error){
  if(error instanceof AuthError)return Response.json({error:error.code},{status:error.status,headers:securityHeaders()})
  return Response.json({error:'claim_unconfigured'},{status:503,headers:{'cache-control':'no-store','referrer-policy':'no-referrer'}})
 }
}
