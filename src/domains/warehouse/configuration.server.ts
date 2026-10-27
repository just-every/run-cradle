import {z} from 'zod'
import type {PlatformBindings} from '../../core/platform/bindings'
import {destinationSchema,accessSchema,sealWarehouseAccess,validateWarehouseDestination,validateWarehouseCredentials} from './destination.server'
import type {SqlMutation} from '../admission/ports'
import type {Json} from '../../contracts/primitives'
import type {RequestContext} from '../authority/ports'
import type {ServerFoundation} from '../../core/app/foundation.server'
import {ownerDelegationSnapshot} from '../authority/delegation.server'
import {registerTable,trustedPredicate} from '../admission/sql.server'
import {canonicalHash} from '../admission/canonical'
import {AdmissionError} from '../admission/errors'
import {parseSchedule} from '../../apps/launch/schedule'
import {idSchema,refSchema} from '../records/validators'
import {LAUNCH_APP_ID} from '../../apps/launch/contracts'
const columns=['id','name','owner_id','bases_json','mode','format','destination_json','sealed_json','local_rule','timezone','state','version','watermark_json','last_slot','running_id','created_at','updated_at']
const objectsTable=registerTable('warehouse_objects',['object_key','export_id','run_id','created_at','destination_json','sealed_json','metadata_json','dispatch_state'])
const exportsTable=registerTable('warehouse_exports',columns)
export type ExportRow={id:string;name:string;owner_id:string;bases_json:string;mode:'full'|'incremental';format:'csv'|'parquet';destination_json:string;sealed_json:string|null;local_rule:string;timezone:string;state:string;version:number;watermark_json:string;last_slot:string|null;running_id:string|null;running_started_at:string|null;running_at:string|null;running_slot:string|null;running_revision:number|null;running_failures:number;running_stalls:number;running_objects:number;running_stopped_slot:string|null;updated_at:string}
const save=z.object({id:idSchema,name:z.string().trim().min(1).max(100),bases:z.array(idSchema).min(1).max(50),mode:z.enum(['full','incremental']),format:z.enum(['csv','parquet']).default('csv'),destination:destinationSchema.default({kind:'r2'}),access:accessSchema.optional(),localRule:z.string().max(50),timezone:z.string().max(100),version:z.number().int().nonnegative()}).strict()
const remove=z.object({id:idSchema,version:z.number().int().positive()}).strict()
export function warehouseConfiguration(db:D1Database,foundation:ServerFoundation,bucket:R2Bucket,env:PlatformBindings){
 const {descriptors}=foundation
 const baseIds=()=>[...new Set(descriptors.list().filter(d=>d.schema.physicalRevision==='launch-retained-v1'||d.schema.physicalRevision.startsWith('manual_')).map(d=>d.schema.appId))]
 async function owner(ctx:RequestContext,appId=LAUNCH_APP_ID){return ownerDelegationSnapshot(db,ctx,appId)}
 async function read(ctx:RequestContext){
  await owner(ctx)
  const bases=[]
  for(const id of baseIds()){
   try{await owner(ctx,id);const base=await db.prepare('SELECT name FROM manual_record_bases WHERE id=?').bind(id).first<{name:string}>();bases.push({id,name:base?.name??'Launch'})}catch(error){if(!(error instanceof Error&&'code'in error))throw error}
  }
  const rows=await db.prepare("SELECT * FROM warehouse_exports WHERE state<>'removed' ORDER BY created_at,id").all<ExportRow>()
  return {bases,exports:rows.results.map(row=>({id:row.id,name:row.name,bases:JSON.parse(row.bases_json) as string[],mode:row.mode,format:row.format,destination:JSON.parse(row.destination_json),credentialsConfigured:!!row.sealed_json,localRule:row.local_rule,timezone:row.timezone,state:row.state,version:row.version}))}
 }
 for(const operation of ['save','remove'] as const){
  const action=`warehouse.${operation}`,input=operation==='save'?save:remove
  const envelope=z.object({commandId:idSchema,expected:z.array(z.object({ref:refSchema,version:z.number().int().positive()}).strict()).max(0),input}).strict()
  foundation.commands.register({action,description:operation==='save'?'Schedule CSV or Parquet exports to your own R2 or S3 bucket.':'Remove a scheduled bucket export.',input:envelope,inputSchema:z.toJSONSchema(envelope) as Json,
   visible:async ctx=>{try{await owner(ctx);return true}catch{return false}},
   replayIdentity:async(_ctx,c)=>({appId:LAUNCH_APP_ID,canonicalInputHash:await canonicalHash(c.input)}),
   prepare:async(ctx,c)=>{
    const snapshot=await owner(ctx),hash=await canonicalHash(c.input),before=await db.prepare('SELECT * FROM warehouse_exports WHERE id=?').bind(c.input.id).first<ExportRow>()
    if((before?.version??0)!==c.input.version||before?.state==='removed')throw new AdmissionError('version_conflict','The export changed. Reload its current version.')
    if(before?.running_id)throw new AdmissionError('version_conflict','An export is running. Try again after it completes.')
    const guards=[snapshot.guard,trustedPredicate('NOT EXISTS(SELECT 1 FROM warehouse_exports WHERE id=? AND running_id IS NOT NULL)',[c.input.id])]
    let row:Record<string,string|number|null>
    if(operation==='save'){
     const value=save.parse(c.input)
     let destination;try{destination=validateWarehouseDestination(value.destination)}catch(error){throw new AdmissionError('validation',error instanceof Error?error.message:'Choose a valid destination.')}
     if(destination.kind==='r2'&&!bucket?.put)throw new AdmissionError('unconfigured','WAREHOUSE R2 binding is required for R2 exports.')
     if(destination.kind!=='r2'&&(!env.CONNECTION_ENCRYPTION_KEY||!env.EGRESS_RELAY_URL||!env.EGRESS_RELAY_SECRET))throw new AdmissionError('unconfigured','Configure the connection encryption key and trusted egress relay before saving remote warehouse exports.')
     if(value.access){try{validateWarehouseCredentials(destination,value.access)}catch{throw new AdmissionError('validation','Enter the credentials required by the selected destination.')}}
     const unchanged=before&&before.destination_json===JSON.stringify(destination),sealed=destination.kind==='r2'?null:value.access?await sealWarehouseAccess(env,value.id,value.access):unchanged?before.sealed_json:null
     if(destination.kind!=='r2'&&!sealed)throw new AdmissionError('validation','Enter destination credentials when choosing or changing the destination.')
     if(!parseSchedule(value.localRule))throw new AdmissionError('validation','Schedule must be hourly, daily HH:mm or weekly d HH:mm; schedules below one hour are refused.')
     try{new Intl.DateTimeFormat('en',{timeZone:value.timezone})}catch{throw new AdmissionError('validation','Choose an IANA timezone.')}
     if(new Set(value.bases).size!==value.bases.length||value.bases.some(id=>!baseIds().includes(id)))throw new AdmissionError('validation','Choose existing bases without duplicates.')
     for(const base of value.bases)guards.push((await owner(ctx,base)).guard)
     row={name:value.name,owner_id:ctx.principal.id,bases_json:JSON.stringify(value.bases),mode:value.mode,format:value.format,destination_json:JSON.stringify(destination),sealed_json:sealed,local_rule:value.localRule,timezone:value.timezone,state:'active',version:value.version+1,watermark_json:'{}',last_slot:null,updated_at:ctx.now}
    }else{if(!before)throw new AdmissionError('not_found','Export not found.');row={state:'removed',sealed_json:null,version:before.version+1,updated_at:ctx.now}}
    const mutations:SqlMutation[]=before?[{kind:'update' as const,table:exportsTable,set:row,where:trustedPredicate('id=? AND version=? AND running_id IS NULL',[c.input.id,c.input.version]),expectedRows:1}]:[{kind:'insert' as const,table:exportsTable,row:{id:c.input.id,...row,running_id:null,created_at:ctx.now}}]
    if(operation==='save'&&row.sealed_json){
     const count=await db.prepare('SELECT COUNT(*) AS n FROM warehouse_objects WHERE export_id=? AND destination_json=? AND sealed_json IS NULL').bind(c.input.id,String(row.destination_json)).first<number>('n')
     if(count)mutations.push({kind:'update',table:objectsTable,set:{sealed_json:row.sealed_json},where:trustedPredicate('export_id=? AND destination_json=? AND sealed_json IS NULL',[c.input.id,String(row.destination_json)]),expectedRows:count})
    }
    return {commandId:c.commandId,action,appId:LAUNCH_APP_ID,canonicalInputHash:hash,permit:{actor:{id:ctx.principal.id,kind:ctx.principal.kind},action,appId:LAUNCH_APP_ID,grantId:null,grantVersion:null,policyVersion:snapshot.row.policy_version,validUntil:ctx.principal.expiresAt,guards,reservationMutations:[],reservationIds:[]},guards,mutations,audit:[{action,subject:null,changes:[{fieldId:c.input.id,before:{state:'value' as const,value:before?JSON.stringify({id:before.id,name:before.name,bases:JSON.parse(before.bases_json),mode:before.mode,format:before.format,localRule:before.local_rule,timezone:before.timezone,state:before.state,version:before.version}):null},after:{state:'value' as const,value:JSON.stringify({...c.input,...'access'in c.input?{access:undefined,credentialsConfigured:!!c.input.access}:{},...operation==='remove'?{state:'removed'}:{state:'active'}})}}],sourceIds:[],personalContentRefs:[ctx.principal.id]}],events:[],outbox:[],committedResult:{id:c.input.id,version:c.input.version+1}}
   }})
 }
 return {read}
}
