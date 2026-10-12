import {sourceGuards} from './guards.server';
import type {RequestContext} from '../authority/ports';
import type {RevisionRef} from '../../contracts/primitives';
import type {EvidenceLink} from './contracts';
import type {EvidenceDependencies,ProposalActionPort} from './ports';
import {createSourceService} from './source.server';
import {createUlid,hash,proposals,insert,node,edges,nodes,eq,and} from './shared.server';
import {exists} from '../admission/sql.server';
const currentNode=(id:string)=>exists(nodes,and(eq(nodes,'id',id),eq(nodes,'invalidated_at',null),eq(nodes,'erased_at',null)));
export function createProposalService(deps:EvidenceDependencies,actions:ProposalActionPort){
 const sources=createSourceService(deps);
 async function prepare(ctx:RequestContext,input:{commandId:string;action:string;subject:RevisionRef;input:unknown;evidence:EvidenceLink[];claimIds?:string[];reason:string;expiresAt:string}){
  if(!input.reason.trim()||input.expiresAt<=ctx.now||!input.evidence.length)throw new Error('Proposal requires current evidence, reason and expiry');
  await sources.validateLinks(ctx,input.evidence);
  await actions.prepare(ctx,input.action,input.subject,input.input,input.evidence);
  const id=createUlid(),n=node(input.subject.ref.appId,'proposal',id,1,ctx.now),parents=new Set<string>();
  for(const e of input.evidence){
   const parent=await deps.db.prepare("SELECT id FROM evidence_nodes WHERE kind='source' AND object_id=? AND object_version=? AND invalidated_at IS NULL AND erased_at IS NULL").bind(e.sourceId,e.sourceVersion).first<{id:string}>();
   if(!parent)throw new Error('Stale evidence');parents.add(parent.id);
  }
  for(const claimId of new Set(input.claimIds??[])){
   const claim=await deps.db.prepare("SELECT c.evidence_json,n.id FROM evidence_claims c JOIN evidence_nodes n ON n.kind='claim' AND n.object_id=c.id AND n.object_version=c.version WHERE c.id=? AND c.app_id=? AND c.state IN ('proposed','corroborated','disputed') AND n.invalidated_at IS NULL AND n.erased_at IS NULL").bind(claimId,input.subject.ref.appId).first<{id:string;evidence_json:string}>();
   if(!claim)throw new Error('Claim is unavailable or stale');
   const stored=JSON.parse(claim.evidence_json) as EvidenceLink[]|{links:EvidenceLink[]},links=Array.isArray(stored)?stored:stored.links;
   await sources.validateLinks(ctx,links);
   if(links.some(link=>!input.evidence.some(e=>e.sourceId===link.sourceId&&e.sourceVersion===link.sourceVersion)))throw new Error('Proposal evidence omits claim provenance');
   parents.add(claim.id);
  }
  const mutations=[insert(proposals,{id,app_id:input.subject.ref.appId,version:1,action:input.action,subject_json:JSON.stringify(input.subject),input_json:JSON.stringify(input.input),evidence_json:JSON.stringify(input.evidence),reason:input.reason,expires_at:input.expiresAt,state:'proposed',created_at:ctx.now,updated_at:ctx.now}),n.mutation,...[...parents].map(parent=>insert(edges,{id:createUlid(),parent_id:parent,child_id:n.id}))];
  const inputHash=await hash(JSON.stringify(input)),permit=await deps.policy.authorize(ctx,{appId:input.subject.ref.appId,action:'proposal.prepare',expected:[input.subject],cost:[],inputHash,commandId:input.commandId});
  return deps.admission.commit(ctx,{commandId:input.commandId,appId:input.subject.ref.appId,action:'proposal.prepare',canonicalInputHash:inputHash,permit,guards:[...sourceGuards(input.evidence),...[...parents].map(currentNode)],mutations,audit:[],events:[],outbox:[],committedResult:{id,state:'proposed'}});
 }
 async function accept(ctx:RequestContext,input:{id:string;version:number;commandId:string}){
  const r=await deps.db.prepare('SELECT * FROM evidence_proposals WHERE id=?').bind(input.id).first<{app_id:string;version:number;subject_json:string;input_json:string;evidence_json:string;action:string;state:string;expires_at:string}>();
  if(!r)throw new Error('Proposal not found');
  const subject=JSON.parse(r.subject_json) as RevisionRef,evidence=JSON.parse(r.evidence_json) as EvidenceLink[];
  await deps.access.checkReference(ctx,subject.ref,[],'read');
  if(r.state!=='proposed'||r.version!==input.version||r.expires_at<=ctx.now)throw new Error('Proposal is stale');
  const parent=await deps.db.prepare("SELECT id FROM evidence_nodes WHERE kind='proposal' AND object_id=? AND object_version=1 AND invalidated_at IS NULL AND erased_at IS NULL").bind(input.id).first<{id:string}>();
  if(!parent)throw new Error('Proposal lineage is stale');
  await sources.validateLinks(ctx,evidence);
  const change=await actions.prepare(ctx,r.action,subject,JSON.parse(r.input_json),evidence),inputHash=await hash(JSON.stringify(input)),permit=await deps.policy.authorize(ctx,{appId:r.app_id,action:r.action,expected:[subject],cost:[],inputHash,commandId:input.commandId});
  const command=node(r.app_id,'command',input.commandId,1,ctx.now);
  return deps.admission.commit(ctx,{commandId:input.commandId,appId:r.app_id,action:r.action,canonicalInputHash:inputHash,permit,guards:[...change.guards,...sourceGuards(evidence),currentNode(parent.id),exists(proposals,and(eq(proposals,'id',input.id),eq(proposals,'version',input.version),eq(proposals,'state','proposed')))],mutations:[...change.mutations,{kind:'update',table:proposals,set:{state:'accepted',version:r.version+1,updated_at:ctx.now},where:eq(proposals,'id',input.id),expectedRows:1},command.mutation,insert(edges,{id:createUlid(),parent_id:parent.id,child_id:command.id})],audit:change.audit,events:[{name:'proposal.accepted',version:1,subject:subject.ref,payload:{proposalId:input.id,commandId:input.commandId},causeRunIds:[]}],outbox:[],committedResult:change.next});
 }
 return{prepare,accept};
}
