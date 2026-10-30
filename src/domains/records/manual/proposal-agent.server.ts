import { createUlid } from '../../../core/shared/ids'
import type { AdmissionPlan } from '../../admission/ports'
import type { RequestContext, PolicyPort } from '../../authority/ports'
import { AdmissionError } from '../../admission/errors'
import { canonical, canonicalHash } from '../../admission/canonical'
import { trustedPredicate } from '../../admission/sql.server'
import { principalGuards } from '../../authority/guards.server'
import { issuerView } from '../../authority/proposer.server'
import type { DescriptorRegistry } from '../descriptors.server'
import type { RuleCondition, ValidationRule } from '../contracts'
import { assertGuards } from '../fence.server'
import type { SchemaDraft } from './contracts'
import { proposals, createProposalStore, proposalCommitment, type StoredProposal } from './proposal-store.server'
import { checkProposedMetadata } from './proposal-metadata.server'
import type { createReleaseCore, StoredPreview } from './release.server'
import type { AgentProposal, ProposalInput } from './proposal-contracts'
const PROPOSAL_LIFETIME=7*86400000,PENDING_LIMIT=20

/** Rule operands may name private records, even when the issuer can read them. */
function agentRules(rules:ValidationRule[]){
 const projected=structuredClone(rules)
 function redact(condition:RuleCondition){
  if(condition.kind!=='condition'){condition.conditions.forEach(redact);return}
  const values=Array.isArray(condition.value)?condition.value:[condition.value]
  if(values.some(value=>value!==null&&typeof value==='object'&&'recordId'in value))delete condition.value
 }
 for(const rule of projected){redact(rule.when);redact(rule.require)}
 return projected
}

/** What a proposing key does: read its base's schema, propose, and follow or withdraw its own proposals. */
export function createProposalAgent(db:D1Database,policy:PolicyPort,registry:DescriptorRegistry,core:ReturnType<typeof createReleaseCore>){
 const store=createProposalStore(db)
 const proposerOf=(ctx:RequestContext)=>{const p=ctx.principal.proposer;if(!p)throw new AdmissionError('not_found','Unknown command.');return p}
 /** The base belongs to the issuer, or the key's new base does not exist yet. */
 async function baseFence(appId:string,issuerId:string){
  const base=await db.prepare('SELECT owner_id,name FROM manual_record_bases WHERE id=?').bind(appId).first<{owner_id:string;name:string}>()
  if(base&&base.owner_id!==issuerId||!base&&registry.list(appId).length)throw new AdmissionError('not_found','Application not found.')
  return {base,guard:base?trustedPredicate('EXISTS(SELECT 1 FROM manual_record_bases WHERE id=? AND owner_id=?)',[appId,issuerId]):trustedPredicate('NOT EXISTS(SELECT 1 FROM record_schemas WHERE app_id=?) AND NOT EXISTS(SELECT 1 FROM authority_memberships WHERE app_id=?) AND NOT EXISTS(SELECT 1 FROM manual_record_bases WHERE id=?)',[appId,appId,appId])}
 }
 async function schema(ctx:RequestContext){
  const {appId,issuerId}=proposerOf(ctx),view=await issuerView(db,ctx),{base,guard}=await baseFence(appId,issuerId),guards=[...principalGuards(ctx),guard]
  const descriptors=registry.list(appId).filter(d=>d.schema.physicalRevision.startsWith('manual_'))
  for(const d of descriptors){const scope=await policy.scope(view,{appId,entityId:d.schema.id,purpose:'read'});if(!scope.unrestrictedRows||d.schema.fields.some(f=>!scope.readableFieldIds.includes(f.id)))throw new AdmissionError('forbidden','Schema editing requires full current table access.');guards.push(...scope.currentAuthorityGuards)}
  const views=(await db.prepare("SELECT id,entity_id,definition_json FROM record_views WHERE app_id=? AND visibility='app' ORDER BY id").bind(appId).all<{id:string;entity_id:string;definition_json:string}>()).results.map(row=>{const v=JSON.parse(row.definition_json) as {name:string;display:string};return {id:row.id,entityId:row.entity_id,name:v.name,display:v.display}})
  const forms=(await db.prepare('SELECT id,entity_id,definition_json FROM record_forms WHERE app_id=? ORDER BY id').bind(appId).all<{id:string;entity_id:string;definition_json:string}>()).results.map(row=>({id:row.id,entityId:row.entity_id,title:(JSON.parse(row.definition_json) as {title:string}).title}))
  await assertGuards(db,guards)
  return {appId,name:base?.name??null,tables:descriptors.map(d=>({id:d.schema.id,label:d.schema.label,...(d.schema.primaryFieldId?{primaryFieldId:d.schema.primaryFieldId}:{}),...(d.schema.incomingRelations?{incomingRelations:d.schema.incomingRelations}:{}),...(d.schema.validationRules?{validationRules:agentRules(d.schema.validationRules)}:{}),fields:structuredClone(d.schema.fields)})) as SchemaDraft['tables'],views,forms,newIds:Array.from({length:100},()=>createUlid())}
 }
 async function propose(ctx:RequestContext,commandId:string,input:ProposalInput):Promise<AdmissionPlan<AgentProposal>>{
  const {appId,issuerId}=proposerOf(ctx),hash=await canonicalHash({action:'schema.propose',input})
  // Naming another base, or one of its tables, answers as a missing application: nothing about it is disclosed.
  if(input.schema.appId!==appId||input.schema.tables.some(t=>registry.list().some(d=>d.schema.id===t.id&&d.schema.appId!==appId)))throw new AdmissionError('not_found','Application not found.')
  // Attachment fields connect to a person's own file store (FILE-002): only an owner's builder offers them, never an agent proposal.
  const attachment=input.schema.tables.flatMap(t=>t.fields).find(f=>f.type==='attachment');if(attachment)throw new AdmissionError('validation',`${attachment.label}: this builder does not support this type.`)
  const permit=await policy.authorize(ctx,{appId,action:'schema.propose',expected:[],cost:[],inputHash:hash,commandId})
  const view=await issuerView(db,ctx),{base,guard}=await baseFence(appId,issuerId),id=createUlid()
  const authentication=new Set([...principalGuards(ctx),...principalGuards(view)].map(g=>canonical({sql:g.sql,values:g.values})))
  const detail:StoredPreview=await core.buildPreview(input.schema,id,{permit:{...permit,guards:[...permit.guards,guard]},reader:view,ownerId:issuerId,expiresAt:new Date(Date.parse(ctx.now)+PROPOSAL_LIFETIME).toISOString()})
  const metadata=checkProposedMetadata(detail.schemas,input.views,input.forms)
  const stored:StoredProposal={...detail,calculationReportVersion:1,views:input.views,forms:input.forms,note:input.note,metadata,freshness:detail.guards.filter(g=>!authentication.has(canonical({sql:g.sql,values:g.values})))}
  const previewHash=await canonicalHash(proposalCommitment(stored))
  const row={id,app_id:appId,proposer_id:ctx.principal.id,credential_id:ctx.principal.credentialId!,issuer_id:issuerId,state:'pending',summary:summarize(stored),detail_json:canonical(stored),preview_hash:previewHash,note:null,release_id:null,decided_by:null,created_at:ctx.now,expires_at:stored.expiresAt,decided_at:null}
  const key=await db.prepare('SELECT label FROM authority_schema_proposers WHERE principal_id=?').bind(ctx.principal.id).first<{label:string}>()
  const committedResult=await store.agent({...row,state:'pending',key_name:key?.label??null,base_name:base?.name??null,key_current:1},ctx.now)
  return {commandId,action:'schema.propose',appId,canonicalInputHash:hash,permit,guards:[...detail.guards,trustedPredicate("(SELECT COUNT(*) FROM record_schema_proposals WHERE proposer_id=? AND state='pending')<?",[ctx.principal.id,PENDING_LIMIT])],
   mutations:[{kind:'insert',table:proposals,row}],audit:[{action:'schema.propose',subject:null,changes:[],sourceIds:[],personalContentRefs:[id]}],events:[],outbox:[],committedResult}
 }
 async function withdraw(ctx:RequestContext,commandId:string,proposalId:string):Promise<AdmissionPlan<{id:string;state:'withdrawn'}>>{
  const {appId}=proposerOf(ctx),hash=await canonicalHash({action:'schema.withdraw',proposalId})
  const permit=await policy.authorize(ctx,{appId,action:'schema.withdraw',expected:[],cost:[],inputHash:hash,commandId})
  const row=await store.row('proposer_id',ctx.principal.id,proposalId)
  if(row.state!=='pending')throw new AdmissionError('invalid_transition','Only a pending proposal can be withdrawn.')
  return {commandId,action:'schema.withdraw',appId,canonicalInputHash:hash,permit,guards:[],mutations:[{kind:'update',table:proposals,set:{state:'withdrawn',decided_at:ctx.now},where:trustedPredicate("id=? AND proposer_id=? AND state='pending'",[proposalId,ctx.principal.id]),expectedRows:1}],
   audit:[{action:'schema.withdraw',subject:null,changes:[],sourceIds:[],personalContentRefs:[proposalId]}],events:[],outbox:[],committedResult:{id:proposalId,state:'withdrawn'}}
 }
 async function current(ctx:RequestContext){const check=principalGuards(ctx);await assertGuards(db,check)}
 return {schema,propose,withdraw,
  async mine(ctx:RequestContext){proposerOf(ctx);await current(ctx);return {items:await store.list('proposer_id',ctx.principal.id,ctx.now)}},
  async one(ctx:RequestContext,proposalId:string){proposerOf(ctx);await current(ctx);return store.agent(await store.row('proposer_id',ctx.principal.id,proposalId),ctx.now)},
 }
}

/** One plain line: what the owner would get by adopting. */
export function summarize(d:StoredProposal){
 const tables=d.schemas.filter(s=>!d.prior.some(p=>p.id===s.id)),added=d.schemas.flatMap(s=>{const old=d.prior.find(p=>p.id===s.id);return s.fields.filter(f=>!old?.fields.some(o=>o.id===f.id))})
 const removed=Object.values(d.removals).flat().length,calculations=(d.calculations??[]).filter(calculation=>d.prior.find(schema=>schema.id===calculation.entityId)?.fields.some(field=>field.id===calculation.fieldId)).length,plural=(n:number,word:string)=>`${n} ${word}${n===1?'':'s'}`
 const parts=[tables.length?`${plural(tables.length,'new table')} (${tables.map(t=>t.label).join(', ')})`:'',added.length?`${plural(added.length,'new field')}`:'',removed?`${plural(removed,'removed field')}`:'',calculations?plural(calculations,'updated calculation'):'',d.views.length?plural(d.views.length,'view'):'',d.forms.length?plural(d.forms.length,'form'):''].filter(Boolean)
 return `${d.name}: ${parts.join(', ')||'renames only'}`
}
