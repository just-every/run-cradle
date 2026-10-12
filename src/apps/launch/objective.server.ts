import { z } from 'zod'
import type { RequestContext,PolicyPort } from '../../domains/authority/ports'
import type { SqlPredicate } from '../../domains/admission/ports'
import { trustedPredicate } from '../../domains/admission/sql.server'
import { LAUNCH_APP_ID,launchEntities } from './contracts'
import { launchFieldIds,type LaunchKind } from './descriptors.server'
const id=z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/)
const targetSchema=z.object({campaignId:id,requiredDeliverableIds:z.array(id).max(500),requiredMilestoneIds:z.array(id).max(500),requiredDecisionIds:z.array(id).max(500)}).strict()
export function createLaunchReadinessVerifier(db:D1Database,policy:PolicyPort){return {async check(ctx:RequestContext,campaignId:string,target:unknown){
 const parsed=targetSchema.safeParse(target),checks:{name:string;passed:boolean|null;message:string}[]=[],witnesses:{id:string;sourceId:string;sourceKind:'canonical_record';version:number;kind:string;independent:boolean;current:boolean}[]=[],guards:SqlPredicate[]=[]
 const result=()=>({state:checks.some(c=>c.passed===false)?'failed' as const:checks.some(c=>c.passed===null)?'inconclusive' as const:'passed' as const,checks,witnesses,guards})
 if(!parsed.success||parsed.data.campaignId!==campaignId){checks.push({name:'target',passed:false,message:'An exact owner-adopted campaign target is required'});return result()}
 const read=async(kind:'campaign'|'deliverable'|'milestone'|'decision',recordId:string)=>{
  const scope=await policy.scope(ctx,{appId:LAUNCH_APP_ID,entityId:launchEntities[kind],purpose:'read'}),table={campaign:'campaigns',deliverable:'deliverables',milestone:'milestones',decision:'decisions'}[kind]
  if(Object.values(launchFieldIds[kind]).some(field=>!scope.readableFieldIds.includes(field)))return null
  const row=await db.prepare(`SELECT * FROM ${table} WHERE id=? AND (${scope.rowPredicate.sql})`).bind(recordId,...scope.rowPredicate.values).first<Record<string,unknown>>()
  guards.push(...scope.currentAuthorityGuards)
  if(row)guards.push(trustedPredicate(`EXISTS(SELECT 1 FROM ${table} WHERE id=? AND version=?)`,[recordId,Number(row.version)]))
  return row
 }
 const campaign=await read('campaign',campaignId);checks.push({name:'campaign',passed:campaign?campaign.archived_at===null:null,message:campaign?'Campaign must remain non-archived':'Campaign is unavailable in current authority'})
 const entries=[...parsed.data.requiredDeliverableIds.map(id=>({kind:'deliverable' as const,id})),...parsed.data.requiredMilestoneIds.map(id=>({kind:'milestone' as const,id})),...parsed.data.requiredDecisionIds.map(id=>({kind:'decision' as const,id}))]
 if(!entries.length)checks.push({name:'targets',passed:false,message:'Readiness requires explicit completion or approval targets'})
 for(const entry of entries){const row=await read(entry.kind,entry.id);if(!row){checks.push({name:entry.id,passed:null,message:'Required record is unavailable'});continue}
  let passed=row.campaign_id===campaignId&&(entry.kind==='deliverable'?row.state==='Complete':entry.kind==='milestone'?row.status==='Complete':row.state==='Approved')
  let actor=entry.kind==='deliverable'?row.completed_by_id:entry.kind==='decision'?row.outcome_by_id:null
  if(entry.kind==='milestone'){
   const history=await db.prepare("SELECT actor_id FROM activity_entries WHERE subject_id=? AND field_name='status' AND next_value='Complete' ORDER BY created_at DESC,id DESC LIMIT 1").bind(entry.id).first<{actor_id:string|null}>();actor=history?.actor_id
   const dependencies=await db.prepare('SELECT p.id,p.version,p.status FROM milestone_dependencies d JOIN milestones p ON p.id=d.predecessor_id WHERE d.milestone_id=?').bind(entry.id).all<{id:string;version:number;status:string}>()
   guards.push(trustedPredicate('(SELECT COUNT(*) FROM milestone_dependencies WHERE milestone_id=?)=?',[entry.id,dependencies.results.length]))
   for(const dependency of dependencies.results){passed=passed&&dependency.status==='Complete';guards.push(trustedPredicate('EXISTS(SELECT 1 FROM milestones WHERE id=? AND version=?)',[dependency.id,dependency.version]))}
  }
  const human=actor?await db.prepare('SELECT id FROM operators WHERE id=?').bind(String(actor)).first():null
  passed=passed&&!!human;checks.push({name:entry.id,passed,message:passed?'Current canonical completion has human attribution':'Required completion, dependency or human attribution is missing'})
  if(passed)witnesses.push({id:entry.id,sourceId:entry.id,sourceKind:'canonical_record',version:Number(row.version),kind:entry.kind==='decision'?'human_approval':'human_completion',independent:true,current:true})
 }
 return result()
}}}
