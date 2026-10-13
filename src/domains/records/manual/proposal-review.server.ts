import type { AdmissionPort } from '../../admission/ports'
import type { RequestContext, PolicyPort } from '../../authority/ports'
import { AdmissionError } from '../../admission/errors'
import { canonicalHash } from '../../admission/canonical'
import { and, trustedPredicate } from '../../admission/sql.server'
import { createUlid } from '../../../core/shared/ids'
import { proposerGuard } from '../../authority/proposer.server'
import { manualAuthority, manualOwnerGuards } from './authority.server'
import { proposals, createProposalStore, parseStored } from './proposal-store.server'
import { metadataMutations } from './proposal-metadata.server'
import type { createReleaseCore } from './release.server'

/** The owner's side: see every proposal made with keys they issued, decline it, or adopt it as a release. */
export function createProposalReview(db:D1Database,policy:PolicyPort,admission:AdmissionPort,core:ReturnType<typeof createReleaseCore>){
 const store=createProposalStore(db)
 async function owner(ctx:RequestContext){
  if(ctx.principal.kind!=='human'||!ctx.principal.sessionId)throw new AdmissionError('forbidden','A current owner session is required to review proposals.')
  const check=and(...manualOwnerGuards(ctx))
  if(!await db.prepare(`SELECT 1 WHERE ${check.sql}`).bind(...check.values).first())throw new AdmissionError('forbidden','Current installation owner authority is required.')
 }
 const keyGuard=(row:{proposer_id:string;credential_id:string})=>[proposerGuard(row.proposer_id),trustedPredicate("EXISTS(SELECT 1 FROM authority_credentials WHERE id=? AND principal_id=? AND revoked_at IS NULL AND expires_at>unixepoch('subsec')*1000)",[row.credential_id,row.proposer_id])]
 return {
  async list(ctx:RequestContext){await owner(ctx);return {items:await store.list('issuer_id',ctx.principal.id,ctx.now)}},
  async detail(ctx:RequestContext,id:string){await owner(ctx);return store.owner(await store.row('issuer_id',ctx.principal.id,id),ctx.now)},
  async decline(ctx:RequestContext,commandId:string,id:string,note:string){
   await owner(ctx)
   const row=await store.row('issuer_id',ctx.principal.id,id),hash=await canonicalHash({kind:'agent_proposal_decline',id,note})
   const replay=await admission.replay(ctx,commandId,'schema.decline',row.app_id,hash);if(replay)return replay.result
   if(row.state!=='pending')throw new AdmissionError('invalid_transition','Only a pending proposal can be declined.')
   const permit={actor:{id:ctx.principal.id,kind:'human' as const},action:'schema.decline',appId:row.app_id,grantId:null,grantVersion:null,policyVersion:0,validUntil:ctx.principal.expiresAt,guards:manualOwnerGuards(ctx),reservationMutations:[],reservationIds:[]}
   return (await admission.commit(ctx,{commandId,action:'schema.decline',appId:row.app_id,canonicalInputHash:hash,permit,guards:[],mutations:[{kind:'update',table:proposals,set:{state:'declined',note,decided_by:ctx.principal.id,decided_at:ctx.now},where:trustedPredicate("id=? AND issuer_id=? AND state='pending'",[id,ctx.principal.id]),expectedRows:1}],
    audit:[{action:'schema.decline',subject:null,changes:[],sourceIds:[],personalContentRefs:[id]}],events:[],outbox:[],committedResult:{id,state:'declined' as const}})).result
  },
  /** release.adopt for a proposal: the owner's session, the stored preview's fences and a current proposing key. */
  async adopt(ctx:RequestContext,commandId:string,id:string){
   const row=await store.row('issuer_id',ctx.principal.id,id),detail=parseStored(row),hash=await canonicalHash({kind:'agent_proposal',proposalId:id})
   const replay=await admission.replay(ctx,commandId,'release.adopt',row.app_id,hash);if(replay)return replay
   if(row.state==='declined'||row.state==='withdrawn')throw new AdmissionError('invalid_transition',`This proposal was ${row.state} and cannot be adopted.`)
   if(row.state!=='pending'||detail.expiresAt<=ctx.now)throw new AdmissionError('version_conflict','Preview has expired or was already adopted.')
   const key=keyGuard(row),current=and(...key)
   if(!await db.prepare(`SELECT 1 WHERE ${current.sql}`).bind(...current.values).first())throw new AdmissionError('version_conflict','This proposal came from a key that is revoked or expired, so it cannot be adopted. Ask the agent to propose again with a current key.')
   const permit=await manualAuthority(db,policy,ctx,row.app_id,hash)
   if(await canonicalHash({schemas:detail.schemas,impacts:detail.impacts,metadata:detail.metadata,views:detail.views,forms:detail.forms,note:detail.note})!==row.preview_hash)throw new AdmissionError('internal','The stored proposal does not match its preview.')
   const guards=[...detail.guards,...key]
   await core.assertGuards([...permit.guards,...guards])
   const releaseId=createUlid()
   return core.applyRelease(ctx,{commandId,hash,releaseId,detail:{...detail,guards},previewId:id,permit,
    mutations:[{kind:'update',table:proposals,set:{state:'adopted',release_id:releaseId,decided_by:ctx.principal.id,decided_at:ctx.now},where:trustedPredicate("id=? AND issuer_id=? AND state='pending'",[id,ctx.principal.id]),expectedRows:1},...metadataMutations(row.app_id,ctx.principal.id,ctx.now,detail.views,detail.forms)],
    audit:[{action:'release.adopt',subject:null,changes:[],sourceIds:[],personalContentRefs:[id,row.credential_id]}],
    provenance:{proposalId:id,credentialId:row.credential_id,proposerId:row.proposer_id,previewHash:row.preview_hash}})
  },
 }
}
