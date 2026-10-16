import {devGate, devNotFound} from '../../../vendor/base/modules/operator-auth/index.mjs'
import {localMailEnabled} from './local-auth.server'
import type {PlatformBindings} from './bindings'

/** Local access uses the checkout key and dev identity; no mail viewer is served. */
export async function localKeyResponse(request:Request,env:PlatformBindings){
 const path=new URL(request.url).pathname
 if(path==='/__dev/outbox')return devNotFound()
 if(path!=='/__dev/key')return null
 if(!localMailEnabled(env))return devNotFound()
 return devGate({key:env.RER_DEV_KEY,origin:env.APP_ORIGIN??'',local:true})?.exchange(request)??devNotFound()
}
