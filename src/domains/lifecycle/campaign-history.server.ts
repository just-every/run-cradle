import type {Effects} from './changes.server'
import {removeRows,updateRows} from './changes.server'
/** Preserve action/count history while dropping copied campaign content and undo sources. */
export async function redactCampaignHistory(db:D1Database,change:Effects,ids:string,anonymousId:string,now:string){
 const contains=(column:string)=>`EXISTS(SELECT 1 FROM json_tree(${column}) WHERE value IN (SELECT value FROM json_each(?)))`
 await removeRows(db,change,'launch_sample_records','record_id IN (SELECT value FROM json_each(?))',[ids])
 await removeRows(db,change,'launch_bulk',contains('snapshot_json'),[ids])
 await removeRows(db,change,'slack_app_actions','record_id IN (SELECT value FROM json_each(?))',[ids])
 await removeRows(db,change,'sms_messages','record_id IN (SELECT value FROM json_each(?))',[ids])
 const runs=(await db.prepare(`SELECT id,state FROM automation_runs WHERE subject_id IN (SELECT value FROM json_each(?)) OR ${contains('definition_json')}`).bind(ids,ids).all<{id:string;state:string}>()).results
 for(const run of runs){
  await updateRows(db,change,'launch_automation_actions',{result_json:null,error_message:null},'run_id=?',[run.id])
  await updateRows(db,change,'automation_runs',{subject_id:anonymousId,definition_json:'{}',error_message:null,...(['Queued','Running','Waiting'].includes(run.state)?{state:'Cancelled',finished_at:Date.parse(now)}:{})},'id=?',[run.id])
 }
 const commands=(await db.prepare(`SELECT command_id,state,access_json FROM command_admissions WHERE ${contains('result_json')} OR ${contains('access_json')} OR command_id IN (SELECT command_id FROM admission_provenance_segments WHERE ${contains('subjects_json')})`).bind(ids,ids,ids).all<{command_id:string;state:string;access_json:string}>()).results
 for(const command of commands){
  const access=JSON.parse(command.access_json)
  await removeRows(db,change,'admission_provenance_segments','command_id=?',[command.command_id])
  await updateRows(db,change,'command_admissions',{result_json:JSON.stringify({commandId:command.command_id,state:command.state,value:null,changed:[],eventIds:[]}),access_json:JSON.stringify({policyVersion:access.policyVersion,grantId:access.grantId,grantVersion:access.grantVersion,subjects:[]})},'command_id=?',[command.command_id])
 }
 await updateRows(db,change,'admission_events',{subject_json:'null',payload_json:'null'},`${contains('subject_json')} OR ${contains('payload_json')}`,[ids,ids])
}
