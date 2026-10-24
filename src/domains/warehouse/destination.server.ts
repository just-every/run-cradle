import type {PlatformBindings} from '../../core/platform/bindings'
import {environmentKeyring,open,seal,type Sealed} from '../connections/crypto.server'
import {LAUNCH_APP_ID} from '../../apps/launch/contracts'
import {AuthorityError} from '../authority/errors'
import {destinationSchema,accessSchema,bigQueryAccessSchema,snowflakeAccessSchema,warehouseAccessSchema,type WarehouseDestination,type WarehouseAccess} from './destination-configuration.server'
import type {WarehouseObjectMeta,WarehouseStage} from './provider-contracts'
import {createS3WarehouseStore} from './s3.server'
import {createBigQueryDestination} from './bigquery.server'
import {createSnowflakeDestination} from './snowflake.server'
export {destinationSchema,warehouseAccessSchema as accessSchema,validateWarehouseDestination,validateWarehouseCredentials} from './destination-configuration.server'
export type {WarehouseDestination} from './destination-configuration.server'
export type WarehouseStore=Omit<WarehouseStage,'put'>&{put(key:string,body:string|ArrayBuffer,options:{httpMetadata:{contentType:string};metadata?:WarehouseObjectMeta}):Promise<unknown>}
function keyring(env:PlatformBindings){const version=env.CONNECTION_ENCRYPTION_KEY_VERSION??'v1';return environmentKeyring(version,v=>v===version?env.CONNECTION_ENCRYPTION_KEY:undefined)}
export async function sealWarehouseAccess(env:PlatformBindings,id:string,access:WarehouseAccess){return JSON.stringify(await seal(keyring(env),LAUNCH_APP_ID,id,'warehouse.destination',JSON.stringify(access)))}
async function warehouseAccess(env:PlatformBindings,id:string,sealed:string){return warehouseAccessSchema.parse(JSON.parse(await open(keyring(env),LAUNCH_APP_ID,id,'warehouse.destination',JSON.parse(sealed) as Sealed)))}
type Custody={export_id:string;destination_json:string;sealed_json:string|null;metadata_json:string|null;dispatch_state:string}
export async function warehouseStore(env:PlatformBindings,bucket:R2Bucket,id:string,destination:WarehouseDestination,sealed:string|null):Promise<WarehouseStore>{
 if(destination.kind==='r2'){
  if(!bucket?.put)throw new AuthorityError('unconfigured','WAREHOUSE R2 binding is required for this export destination.',503)
  return bucket
 }
 if(!sealed)throw new AuthorityError('unconfigured','Reconnect this export destination in Settings before exported-copy custody can be confirmed.',503)
 const access=await warehouseAccess(env,id,sealed)
 if(destination.kind==='s3')return createS3WarehouseStore(env,destination,accessSchema.parse(access))
 const stage=destination.kind==='bigquery'?bucket:await createS3WarehouseStore(env,destination.stageStorage,accessSchema.parse({accessKeyId:'accessKeyId'in access?access.accessKeyId:'',secretAccessKey:'secretAccessKey'in access?access.secretAccessKey:''}))
 if(!stage?.put)throw new AuthorityError('unconfigured','WAREHOUSE R2 binding is required for BigQuery file staging.',503)
 const remote=destination.kind==='bigquery'?await createBigQueryDestination(env,destination,bigQueryAccessSchema.parse(access)):await createSnowflakeDestination(env,destination,snowflakeAccessSchema.parse(access),stage)
 return {
  async put(key,body,options){
   await stage.put(key,body,{httpMetadata:options.httpMetadata})
   if(options.metadata){
    await remote.prepare?.(key,options.metadata)
    await env.DB.prepare("UPDATE warehouse_objects SET dispatch_state='dispatching' WHERE object_key=? AND export_id=?").bind(key,id).run()
    await remote.write(key,typeof body==='string'?new TextEncoder().encode(body):new Uint8Array(body),options.metadata)
    await env.DB.prepare("UPDATE warehouse_objects SET dispatch_state='confirmed' WHERE object_key=? AND export_id=?").bind(key,id).run()
   }
  },
  get:key=>stage.get(key),head:key=>stage.head(key),
  async delete(key){
   const custody=await env.DB.prepare('SELECT metadata_json,dispatch_state FROM warehouse_objects WHERE object_key=? AND export_id=?').bind(key,id).first<{metadata_json:string|null;dispatch_state:string}>()
   if(!custody)throw new AuthorityError('provider_unavailable','Export delivery custody is missing; deletion cannot be confirmed.',503)
   if(custody.metadata_json&&custody.dispatch_state!=='prepared')await remote.erase(key,JSON.parse(custody.metadata_json) as WarehouseObjectMeta)
   await stage.delete(key)
  },
 }
}
export async function eraseWarehouseObject(env:PlatformBindings,bucket:R2Bucket,key:string){
 const custody=await env.DB.prepare('SELECT export_id,destination_json,sealed_json,metadata_json,dispatch_state FROM warehouse_objects WHERE object_key=?').bind(key).first<Custody>()
 if(!custody)throw new AuthorityError('provider_unavailable','Export erasure custody is missing; confirmation refused.',503)
 const store=await warehouseStore(env,bucket,custody.export_id,destinationSchema.parse(JSON.parse(custody.destination_json)),custody.sealed_json)
 await store.delete(key)
 if(await store.head(key))throw new AuthorityError('provider_unavailable','Export destination still contains the object; erasure confirmation refused.',503)
}
