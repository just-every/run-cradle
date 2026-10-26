import type {RequestContext} from '../authority/ports'
import {trustedPredicate,registerTable} from '../admission/sql.server'
import {createAdmissionService} from '../admission/service.server'
import {canonicalHash} from '../admission/canonical'
import {delegationCommandId} from '../authority/user-delegation.server'
import {erasureAdmissionGuard} from '../lifecycle/file-writes.server'
import {NOTIFICATION_APP} from './mail-authority.server'
import {notificationContext,notificationPrincipalGuard} from './notification-authority.server'
import {createNotificationReplay} from './replay.server'
import {createChannelsIntegration} from './integration.server'

export type OwedProgress={eventId:string;subjectType:'base-import'|'warehouse-export';subjectId:string;starterId:string;outcome:'completed'|'failed'}
type Row={event_id:string;subject_type:OwedProgress['subjectType'];subject_id:string;starter_id:string;outcome:OwedProgress['outcome']}
const owedTable=registerTable('channel_progress_owed',['event_id','subject_type','subject_id','starter_id','outcome','created_at'])
const attemptsTable=registerTable('channel_progress_attempts',['event_id','token','live_until'])
const commandOf=(eventId:string)=>delegationCommandId(eventId,'progress')

/** Joins a job's outcome commit. An event already admitted is never owed again. */
export async function owedProgressStatement(db:D1Database,owed:OwedProgress){
 return db.prepare('INSERT OR IGNORE INTO channel_progress_owed(event_id,subject_type,subject_id,starter_id,outcome,created_at) SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM command_admissions WHERE command_id=?)')
  .bind(owed.eventId,owed.subjectType,owed.subjectId,owed.starterId,owed.outcome,new Date().toISOString(),await commandOf(owed.eventId))
}
export async function oweProgress(db:D1Database,owed:OwedProgress){await (await owedProgressStatement(db,owed)).run()}

/** A failure is journaled before work starts. A live attempt holds its debt
 * from publication; completion removes it atomically with the job checkpoint. */
export async function progressAttemptStatements(db:D1Database,owed:OwedProgress,token:string,liveUntil:string,claim?:{id:string;startedAt:string}){
 const statement=await owedProgressStatement(db,owed)
 const condition=claim?' AND EXISTS(SELECT 1 FROM warehouse_exports WHERE id=? AND running_id=? AND running_started_at=?)':''
 const values=claim?[claim.id,token,claim.startedAt]:[]
 // The export claim and these statements share one D1 batch. A losing claim
 // cannot replace the winning attempt's journal or lease.
 const insert=db.prepare(`INSERT OR IGNORE INTO channel_progress_owed(event_id,subject_type,subject_id,starter_id,outcome,created_at) SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM command_admissions WHERE command_id=?)${condition}`)
  .bind(owed.eventId,owed.subjectType,owed.subjectId,owed.starterId,owed.outcome,new Date().toISOString(),await commandOf(owed.eventId),...values)
 const attempt=db.prepare(`INSERT INTO channel_progress_attempts(event_id,token,live_until) SELECT ?,?,? WHERE 1${condition} ON CONFLICT(event_id) DO UPDATE SET token=excluded.token,live_until=excluded.live_until`)
  .bind(owed.eventId,token,liveUntil,...values)
 return [claim?insert:statement,attempt]
}
/** An export execution settles only while no later execution holds its run. */
export async function settleProgressAttempt(db:D1Database,eventId:string,token:string,failed:boolean,claim?:{id:string;startedAt:string}){
 const fence=claim?' AND NOT EXISTS(SELECT 1 FROM warehouse_exports WHERE id=? AND running_id=? AND running_started_at<>?)':'',values=claim?[claim.id,token,claim.startedAt]:[]
 await db.batch([
  ...failed?[]:[db.prepare(`DELETE FROM channel_progress_owed WHERE event_id=? AND EXISTS(SELECT 1 FROM channel_progress_attempts WHERE event_id=? AND token=?)${fence}`).bind(eventId,eventId,token,...values)],
  db.prepare(`DELETE FROM channel_progress_attempts WHERE event_id=? AND token=?${fence}`).bind(eventId,token,...values),
 ])
}

/** Publishes owed notices, one event or all, independently of any job schedule. */
export async function deliverOwedProgress(db:D1Database,ingress:RequestContext['ingress'],eventId?:string,now=new Date()){
 // An already-admitted failure still needs a live apply fence on a later
 // attempt, but its lease is transient even if that request terminates.
 await db.prepare('DELETE FROM channel_progress_attempts WHERE live_until<=? AND NOT EXISTS(SELECT 1 FROM channel_progress_owed WHERE event_id=channel_progress_attempts.event_id)').bind(now.toISOString()).run()
 const rows=(await db.prepare(`SELECT event_id,subject_type,subject_id,starter_id,outcome FROM channel_progress_owed${eventId?' WHERE event_id=?':''} ORDER BY created_at,event_id`).bind(...eventId?[eventId]:[]).all<Row>()).results
 for(const row of rows)await publish(db,{eventId:row.event_id,subjectType:row.subject_type,subjectId:row.subject_id,starterId:row.starter_id,outcome:row.outcome},ingress,now)
}

/** Async job facts use the same admission, recipient and delivery rules as other notices. */
async function publish(db:D1Database,input:OwedProgress,ingress:RequestContext['ingress'],now:Date){
 const commandId=await commandOf(input.eventId)
 // Owed rows are written only before admission, so this retires a concurrent publisher's leftover without replay.
 if(await db.prepare("SELECT 1 FROM command_admissions WHERE command_id=? AND state='committed'").bind(commandId).first()){await db.prepare('DELETE FROM channel_progress_owed WHERE event_id=?').bind(input.eventId).run();return}
 const starter=await db.prepare('SELECT human_id FROM authority_principals WHERE id=?').bind(input.starterId).first<{human_id:string|null}>()
 if(!starter?.human_id)throw new Error('Progress requires the retained human starter')
 // A crashed request becomes recoverable after its bounded attempt lease. An
 // interrupted export run that still holds its active export's claim for this
 // version and slot is not failed yet while its finite automatic recovery
 // continues: a later tick resumes that same run, which settles it. The lease
 // predicate is also admitted below, so a concurrent request cannot acquire the
 // attempt between this read and publication.
 const idle=trustedPredicate(`NOT EXISTS(SELECT 1 FROM channel_progress_attempts a WHERE a.event_id=? AND (a.live_until>? OR EXISTS(SELECT 1 FROM warehouse_exports w WHERE w.id=? AND w.state='active' AND w.running_id=a.token AND w.running_stopped_slot IS NULL AND ('warehouse-export:'||w.id||':'||w.version||':'||w.running_slot||':failed')=a.event_id)))`,[input.eventId,now.toISOString(),input.subjectId])
 if(!await db.prepare(`SELECT 1 WHERE ${idle.sql}`).bind(...idle.values).first())return
 const job=input.subjectType==='base-import'
  ?trustedPredicate(`EXISTS(SELECT 1 FROM ik_jobs WHERE id=? AND principal_id=? AND ${input.outcome==='completed'?"state='completed'":"state<>'completed'"})`,[input.subjectId,input.starterId])
  :trustedPredicate(`EXISTS(SELECT 1 FROM warehouse_exports WHERE id=? AND owner_id=?${input.outcome==='completed'?" AND state='active' AND ('warehouse-export:'||id||':'||version||':'||last_slot||':completed')=?":''})`,[input.subjectId,input.starterId,...input.outcome==='completed'?[input.eventId]:[]])
 const current=!!await db.prepare(`SELECT 1 WHERE ${job.sql}`).bind(...job.values).first()
 const ctx=await notificationContext(db,input.eventId,ingress)
 const effects=current?await createChannelsIntegration(db).notification(ctx,{kind:'progress',operatorId:starter.human_id,campaignId:null,subjectId:input.subjectId,subjectType:input.subjectType,eventId:input.eventId,actorId:null,progressOutcome:input.outcome}):{guards:[trustedPredicate(`NOT (${job.sql})`,job.values)],mutations:[],notificationId:undefined}
 if(current)effects.guards.push(job)
 effects.guards.push(idle)
 const attemptWhere=trustedPredicate('event_id=? OR event_id=?',[input.eventId,input.subjectType==='base-import'?`base-import:${input.subjectId}:failed`:input.eventId])
 const attemptCount=(await db.prepare(`SELECT count(*) n FROM channel_progress_attempts WHERE ${attemptWhere.sql}`).bind(...attemptWhere.values).first<{n:number}>())!.n
 effects.guards.push(trustedPredicate(`(SELECT count(*) FROM channel_progress_attempts WHERE ${attemptWhere.sql})=?`,[...attemptWhere.values,attemptCount]))
 const action='progress.notify',value={eventId:input.eventId,subjectId:input.subjectId,subjectType:input.subjectType,starterId:input.starterId,operatorId:starter.human_id,outcome:input.outcome,notificationId:effects.notificationId??null}
 // The debt identifies the event; the live job predicate above guards its
 // publication or retirement in this same admission.
 const owed=trustedPredicate('EXISTS(SELECT 1 FROM channel_progress_owed WHERE event_id=? AND subject_type=? AND subject_id=? AND starter_id=? AND outcome=?)',[input.eventId,input.subjectType,input.subjectId,input.starterId,input.outcome])
 const admission=createAdmissionService(db,{authorizeReplay:createNotificationReplay(db),additionalGuards:current=>[trustedPredicate("NOT EXISTS(SELECT 1 FROM portability_fences WHERE name IN ('restore','snapshot'))",[]),erasureAdmissionGuard(current.now)]})
 // A no-op completion is recorded too, so opting in never replays old success.
 // The owed row retires only inside this admission.
 await admission.commit(ctx,{commandId,action,appId:NOTIFICATION_APP,canonicalInputHash:await canonicalHash({eventId:input.eventId,subjectId:input.subjectId,subjectType:input.subjectType,starterId:input.starterId,outcome:input.outcome}),permit:{actor:{id:ctx.principal.id,kind:'system'},action,appId:NOTIFICATION_APP,grantId:null,grantVersion:null,policyVersion:1,validUntil:ctx.principal.expiresAt,guards:[notificationPrincipalGuard(ctx.principal.authenticationEpoch),owed],reservationMutations:[],reservationIds:[]},guards:effects.guards,mutations:[...effects.mutations,{kind:'delete',table:attemptsTable,where:attemptWhere,expectedRows:attemptCount},{kind:'delete',table:owedTable,where:trustedPredicate('event_id=?',[input.eventId]),expectedRows:1}],audit:[{action,subject:null,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:value})
}
