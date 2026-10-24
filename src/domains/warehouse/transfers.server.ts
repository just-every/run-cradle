import type {PlatformBindings} from '../../core/platform/bindings'
import {LAUNCH_APP_ID} from '../../apps/launch/contracts'
import {environmentKeyring,open,seal,type Sealed} from '../connections/crypto.server'
import {AuthorityError} from '../authority/errors'

type Provider='r2'|'s3'|'bigquery'
type Transfer={uploadId:string;sha256:string}
type Envelope=Record<string,Transfer|{sealed:Sealed}>
export async function transferHash(body:Uint8Array<ArrayBuffer>){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',body)),value=>value.toString(16).padStart(2,'0')).join('')}
/** Only upload identities are retained here. BigQuery's session URL is a
 * capability and is sealed under the same private key as destination custody. */
export function warehouseTransfers(env:PlatformBindings){
 const version=env.CONNECTION_ENCRYPTION_KEY_VERSION??'v1',keyring=environmentKeyring(version,v=>v===version?env.CONNECTION_ENCRYPTION_KEY:undefined)
 async function read(key:string){
  const row=await env.DB.prepare('SELECT transfer_json FROM warehouse_objects WHERE object_key=?').bind(key).first<{transfer_json:string}>()
  if(!row)throw new AuthorityError('provider_unavailable','Warehouse transfer custody is missing.',503)
  return {raw:row.transfer_json,state:JSON.parse(row.transfer_json) as Envelope}
 }
 return {
  async get(provider:Provider,key:string):Promise<Transfer|null>{
   const value=(await read(key)).state[provider];if(!value)return null
   return 'sealed'in value?JSON.parse(await open(keyring,LAUNCH_APP_ID,key,'warehouse.transfer',value.sealed)) as Transfer:value
  },
  async set(provider:Provider,key:string,value:Transfer|null){
   const row=await read(key)
   if(value)row.state[provider]=provider==='bigquery'?{sealed:await seal(keyring,LAUNCH_APP_ID,key,'warehouse.transfer',JSON.stringify(value))}:value
   else delete row.state[provider]
   const updated=await env.DB.prepare('UPDATE warehouse_objects SET transfer_json=? WHERE object_key=? AND transfer_json=?').bind(JSON.stringify(row.state),key,row.raw).run()
   if(updated.meta.changes!==1)throw new AuthorityError('version_conflict','Warehouse transfer custody changed.',409)
  },
 }
}
