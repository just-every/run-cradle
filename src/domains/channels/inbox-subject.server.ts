import {launchDescriptors} from '../../apps/launch/descriptors.server'
import {LAUNCH_APP_ID} from '../../apps/launch/contracts'
import {automationRunLink} from '../automations/failure-details'
import type {PolicyPort,RequestContext} from '../authority/ports'
import {baseAccess} from '../records/manual/base-access.server'
import {assertGuards} from '../records/fence.server'

const denied=(error:unknown)=>error instanceof Error&&'code'in error&&['forbidden','not_found'].includes(String(error.code))
/** A base appears in Records only while at least one of its tables is readable. */
async function readableBase(db:D1Database,ctx:RequestContext,policy:PolicyPort,appId:string){
 try{await baseAccess(db,ctx,appId)}catch(error){if(denied(error))return false;throw error}
 const tables=appId===LAUNCH_APP_ID?launchDescriptors.map(d=>({id:d.schema.id})):(await db.prepare("SELECT id FROM record_schemas s WHERE app_id=? AND NOT EXISTS(SELECT 1 FROM record_trash t WHERE t.app_id=s.app_id AND t.entity_id=s.id AND t.kind='table')").bind(appId).all<{id:string}>()).results
 for(const table of tables){
  try{const scope=await policy.scope(ctx,{appId,entityId:table.id,purpose:'read'});await assertGuards(db,scope.currentAuthorityGuards);return true}
  catch(error){if(!denied(error))throw error}
 }
 return false
}
/** Resolve retained Launch subjects without offering links to removed records. */
export async function launchInboxSubject(db:D1Database,row:{kind:string;subject_type?:string|null;subject_id:string|null;campaign_id:string|null},ctx:RequestContext,policy:PolicyPort):Promise<string|null>{
 if(!row.subject_id)return null
 const subject=encodeURIComponent(row.subject_id)
 if(row.kind==='progress'&&['base-import','warehouse-export'].includes(row.subject_type??'')){
  const job=row.subject_type==='base-import'
   ?await db.prepare('SELECT json_array(destination) AS bases FROM ik_jobs WHERE id=?').bind(row.subject_id).first<{bases:string}>()
   :await db.prepare("SELECT bases_json AS bases FROM warehouse_exports WHERE id=? AND state<>'removed'").bind(row.subject_id).first<{bases:string}>()
  if(!job)return null
  const bases=JSON.parse(job.bases) as string[]
  if(!bases.length)return null
  for(const base of bases)if(!await readableBase(db,ctx,policy,base))return null
  return '/app/settings'
 }
 if(row.kind==='outage'&&row.subject_type==='connection')return '/app/settings'
 if(row.kind==='outage'&&row.subject_type==='automation-stop'){const run=await db.prepare('SELECT r.automation_id,b.app_id FROM automation_runs r JOIN record_automation_bindings b ON b.automation_id=r.automation_id WHERE r.id=?').bind(row.subject_id).first<{automation_id:string;app_id:string}>();return run?automationRunLink(run.app_id,run.automation_id,row.subject_id):null}
 if(row.kind==='weekly-digest')return '/app/overview'
 if(row.kind==='automation-failed')return await db.prepare('SELECT 1 FROM automation_runs WHERE id=?').bind(row.subject_id).first()?'/app/automations':null
 const target=({'decision-assigned':['decisions','decisions'],'decision-overdue':['decisions','decisions'],'critical-risk-escalated':['risks','risks'],'readiness':['milestones','milestones'],'record-automation':['campaigns','campaigns'],'outage':['campaigns','campaigns']} as Record<string,[string,string]>)[row.kind]
 return target&&await db.prepare(`SELECT 1 FROM ${target[0]} WHERE id=?`).bind(row.subject_id).first()?`/app/${target[1]}/${subject}`:null
}
