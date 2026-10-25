import {automationRunLink} from '../automations/failure-details'
/** Resolve retained Launch subjects without offering links to removed records. */
export async function launchInboxSubject(db:D1Database,row:{kind:string;subject_type?:string|null;subject_id:string|null;campaign_id:string|null}):Promise<string|null>{
 if(!row.subject_id)return null
 const subject=encodeURIComponent(row.subject_id)
 if(row.kind==='outage'&&row.subject_type==='connection')return '/app/settings'
 if(row.kind==='outage'&&row.subject_type==='automation-stop'){const run=await db.prepare('SELECT r.automation_id,b.app_id FROM automation_runs r JOIN record_automation_bindings b ON b.automation_id=r.automation_id WHERE r.id=?').bind(row.subject_id).first<{automation_id:string;app_id:string}>();return run?automationRunLink(run.app_id,run.automation_id,row.subject_id):null}
 if(row.kind==='weekly-digest')return '/app/overview'
 if(row.kind==='automation-failed')return await db.prepare('SELECT 1 FROM automation_runs WHERE id=?').bind(row.subject_id).first()?'/app/automations':null
 if(row.kind==='comment-mentioned')return row.campaign_id&&await db.prepare('SELECT 1 FROM comments WHERE id=? AND campaign_id=? AND deleted_at IS NULL').bind(row.subject_id,row.campaign_id).first()?`/app/campaigns/${encodeURIComponent(row.campaign_id)}`:null
 const target=({'decision-assigned':['decisions','decisions'],'decision-overdue':['decisions','decisions'],'critical-risk-escalated':['risks','risks'],'readiness':['milestones','milestones'],'record-automation':['campaigns','campaigns'],'progress':['campaigns','campaigns'],'outage':['campaigns','campaigns']} as Record<string,[string,string]>)[row.kind]
 return target&&await db.prepare(`SELECT 1 FROM ${target[0]} WHERE id=?`).bind(row.subject_id).first()?`/app/${target[1]}/${subject}`:null
}
