import {createOwnerClaimHandler} from '../../../vendor/base/modules/owner-claim/index.mjs'
import {normalizeEmail} from '../../../vendor/base/modules/operator-auth/index.mjs'
import {configuredOwnerClaimRequest} from './owner-name.server'
import {localMailEnabled} from './local-auth.server'
import type {PlatformBindings} from './bindings'
import {authAllowList} from './allow-list.server'

/** Every trust value is installation configuration; a claim cannot set it. */
export async function signedOwnerClaim(request:Request,env:PlatformBindings){
 if(new URL(request.url).pathname!=='/auth/owner-claim')return null
 try{
  const origin=env.APP_ORIGIN??'',email=normalizeEmail(env.OWNER_EMAIL)
  const claim=createOwnerClaimHandler({db:env.DB,authConfig:{local:localMailEnabled(env),origin,OWNER_EMAIL:email,
   SESSION_SECRET:env.SESSION_SECRET??'',SETUP_TOKEN:env.SETUP_TOKEN,allowList:authAllowList(env.AUTH_ALLOW_LIST)},
   clientIp:(request:Request)=>request.headers.get('CF-Connecting-IP')??'',
   issuer:env.RER_OWNER_CLAIM_ISSUER??'',installationId:env.RER_OWNER_CLAIM_INSTALLATION_ID??'',appOrigin:env.RER_DEMO==='1'?origin:env.RER_OWNER_CLAIM_APP_ORIGIN??'',
   expectedEmail:email,publicKeys:JSON.parse(env.RER_OWNER_CLAIM_PUBLIC_KEYS??'null')})
  const configured=await configuredOwnerClaimRequest(request,env)
  return configured instanceof Response?configured:await claim(configured)
 }catch{return Response.json({error:'claim_unconfigured'},{status:503,headers:{'cache-control':'no-store','referrer-policy':'no-referrer'}})}
}
