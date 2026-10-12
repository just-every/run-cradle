import type {Ref} from '../../contracts/primitives';
import type {PolicyPort,RequestContext} from '../authority/ports';
import type {EvidenceDependencies} from './ports';
import {createErasureService,type ErasurePort} from './erasure.server';
import {hash,EvidenceError} from './shared.server';
import {trustedPredicate} from '../admission/sql.server';
export type CleanupScope={appId:string;inputHashes:string[]};
/** A server-held, job-bound capability. It grants no new erasure request, record read, or provider action. */
export async function createErasureCleanupCapability(db:D1Database,jobId:string,dependentScopes:CleanupScope[]=[],clock:()=>string=()=>new Date().toISOString()){
 const job=await db.prepare("SELECT subject_json,subject_hash FROM evidence_erasure_ledger WHERE id=? AND state='running'").bind(jobId).first<{subject_json:string;subject_hash:string}>();if(!job)throw new EvidenceError('not_found','No admitted erasure job',404);
 const subject=JSON.parse(job.subject_json) as Ref,now=clock(),expiresAt=new Date(Date.parse(now)+300000).toISOString(),ctx:RequestContext={principal:{id:jobId,kind:'system',humanId:null,sessionId:null,credentialId:null,issuedAt:now,expiresAt,authenticationEpoch:1},requestId:jobId,now,ingress:'schedule'};
 const allowed=[{appId:subject.appId,inputHashes:[await hash(jobId)]},...dependentScopes];
 const policy:PolicyPort={async scope(){throw new EvidenceError('forbidden','Cleanup capabilities cannot retrieve record data',403);},async authorize(current,request){
  if(current!==ctx||clock()>=expiresAt||request.action!=='privacy.erase'||request.cost.length||request.expected.length||!allowed.some(s=>s.appId===request.appId&&s.inputHashes.includes(request.inputHash)))throw new EvidenceError('forbidden','Cleanup capability does not cover this operation',403);
  const guard=trustedPredicate("EXISTS(SELECT 1 FROM evidence_erasure_ledger WHERE id=? AND state='running' AND subject_hash=?)",[jobId,job.subject_hash]);if(!await db.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first())throw new EvidenceError('forbidden','Erasure is no longer pending',403);
  return{actor:{id:jobId,kind:'system'},action:request.action,appId:request.appId,grantId:null,grantVersion:null,policyVersion:1,validUntil:expiresAt,guards:[guard],reservationMutations:[],reservationIds:[]};
 }};
 return{jobId,subject,ctx,policy};
}
export type ErasureCleanupCapability=Awaited<ReturnType<typeof createErasureCleanupCapability>>;
/** The aggregate supplies only scopes proven by already-admitted downstream cleanup intents. */
export function createErasureMaintenance(deps:EvidenceDependencies,ports:(capability:ErasureCleanupCapability)=>ErasurePort,dependentScopes:(jobId:string)=>Promise<CleanupScope[]>,clock:()=>string=()=>new Date().toISOString()){
 return async(limit=50)=>{if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('Invalid cleanup bound');const jobs=(await deps.db.prepare("SELECT id FROM evidence_erasure_ledger WHERE state='running' ORDER BY requested_at,id LIMIT ?").bind(limit).all<{id:string}>()).results;const results=[];for(const job of jobs){try{const cap=await createErasureCleanupCapability(deps.db,job.id,await dependentScopes(job.id),clock);results.push(await createErasureService({...deps,policy:cap.policy},ports(cap),clock).advance(cap.ctx,job.id));}catch(error){results.push({id:job.id,state:'failed',message:error instanceof Error?error.message:'Erasure failed'});}}return results;};
}
