import {z} from 'zod'
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
const columns=['id','name','owner_id','bases_json','mode','local_rule','timezone','state','version','watermark_json','last_slot','running_id','created_at','updated_at']
const exportsTable=registerTable('warehouse_exports',columns)
export type ExportRow={id:string;name:string;owner_id:string;bases_json:string;mode:'full'|'incremental';local_rule:string;timezone:string;state:string;version:number;watermark_json:string;last_slot:string|null;running_id:string|null;updated_at:string}
const save=z.object({id:idSchema,name:z.string().trim().min(1).max(100),bases:z.array(idSchema).min(1).max(50),mode:z.enum(['full','incremental']),localRule:z.string().max(50),timezone:z.string().max(100),version:z.number().int().nonnegative()}).strict()
const remove=z.object({id:idSchema,version:z.number().int().positive()}).strict()
export function warehouseConfiguration(db:D1Database,foundation:ServerFoundation,bucket:R2Bucket){
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
  return {bases,exports:rows.results.map(row=>({id:row.id,name:row.name,bases:JSON.parse(row.bases_json) as string[],mode:row.mode,localRule:row.local_rule,timezone:row.timezone,state:row.state,version:row.version}))}
 }
 for(const operation of ['save','remove'] as const){
  const action=`warehouse.${operation}`,input=operation==='save'?save:remove
  const envelope=z.object({commandId:idSchema,expected:z.array(z.object({ref:refSchema,version:z.number().int().positive()}).strict()).max(0),input}).strict()
  foundation.commands.register({action,description:operation==='save'?'Schedule CSV exports to your own R2 bucket.':'Remove a scheduled bucket export.',input:envelope,inputSchema:z.toJSONSchema(envelope) as Json,
   visible:async ctx=>{try{await owner(ctx);return true}catch{return false}},
   replayIdentity:async(_ctx,c)=>({appId:LAUNCH_APP_ID,canonicalInputHash:await canonicalHash(c.input)}),
   prepare:async(ctx,c)=>{
    if(!bucket?.put)throw new AdmissionError('unconfigured','WAREHOUSE R2 binding is required for scheduled bucket exports.')
    const snapshot=await owner(ctx),hash=await canonicalHash(c.input),before=await db.prepare('SELECT * FROM warehouse_exports WHERE id=?').bind(c.input.id).first<ExportRow>()
    if((before?.version??0)!==c.input.version||before?.state==='removed')throw new AdmissionError('version_conflict','The export changed. Reload its current version.')
    if(before?.running_id)throw new AdmissionError('version_conflict','An export is running. Try again after it completes.')
    const guards=[snapshot.guard,trustedPredicate('NOT EXISTS(SELECT 1 FROM warehouse_exports WHERE id=? AND running_id IS NOT NULL)',[c.input.id])]
    let row:Record<string,string|number|null>
    if(operation==='save'){
     const value=save.parse(c.input)
     if(!parseSchedule(value.localRule))throw new AdmissionError('validation','Schedule must be hourly, daily HH:mm or weekly d HH:mm; schedules below one hour are refused.')
     try{new Intl.DateTimeFormat('en',{timeZone:value.timezone})}catch{throw new AdmissionError('validation','Choose an IANA timezone.')}
     if(new Set(value.bases).size!==value.bases.length||value.bases.some(id=>!baseIds().includes(id)))throw new AdmissionError('validation','Choose existing bases without duplicates.')
     for(const base of value.bases)guards.push((await owner(ctx,base)).guard)
     row={name:value.name,owner_id:ctx.principal.id,bases_json:JSON.stringify(value.bases),mode:value.mode,local_rule:value.localRule,timezone:value.timezone,state:'active',version:value.version+1,watermark_json:'{}',last_slot:null,updated_at:ctx.now}
    }else{if(!before)throw new AdmissionError('not_found','Export not found.');row={state:'removed',version:before.version+1,updated_at:ctx.now}}
    const mutations=before?[{kind:'update' as const,table:exportsTable,set:row,where:trustedPredicate('id=? AND version=? AND running_id IS NULL',[c.input.id,c.input.version]),expectedRows:1}]:[{kind:'insert' as const,table:exportsTable,row:{id:c.input.id,...row,running_id:null,created_at:ctx.now}}]
    return {commandId:c.commandId,action,appId:LAUNCH_APP_ID,canonicalInputHash:hash,permit:{actor:{id:ctx.principal.id,kind:ctx.principal.kind},action,appId:LAUNCH_APP_ID,grantId:null,grantVersion:null,policyVersion:snapshot.row.policy_version,validUntil:ctx.principal.expiresAt,guards,reservationMutations:[],reservationIds:[]},guards,mutations,audit:[{action,subject:null,changes:[{fieldId:c.input.id,before:{state:'value' as const,value:before?JSON.stringify({id:before.id,name:before.name,bases:JSON.parse(before.bases_json),mode:before.mode,localRule:before.local_rule,timezone:before.timezone,state:before.state,version:before.version}):null},after:{state:'value' as const,value:JSON.stringify({...c.input,...operation==='remove'?{state:'removed'}:{state:'active'}})}}],sourceIds:[],personalContentRefs:[ctx.principal.id]}],events:[],outbox:[],committedResult:{id:c.input.id,version:c.input.version+1}}
   }})
 }
 return {read}
}
