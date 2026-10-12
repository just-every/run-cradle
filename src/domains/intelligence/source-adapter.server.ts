import {reserveBudgets} from '../authority/budget.server';
import {createUlid} from '../../core/shared/ids';
import type { RequestContext, PolicyPort } from '../authority/ports';
import type { SqlPredicate } from '../admission/ports';
import { trustedPredicate } from '../admission/sql.server';
import type { IntelligenceSourcePort } from './ports';
import type { Snapshot, CurrentVersions, CheckIssue } from './contracts';
import type { EvidenceAccessPort } from '../evidence/ports';
/** Canonical domain state supplies resource versions and authority; snapshot arrays cannot self-attest. */
export interface PortfolioStatePort {current(ctx:RequestContext,snapshot:Snapshot):Promise<CurrentVersions>;guards(ctx:RequestContext,snapshot:Snapshot):Promise<SqlPredicate[]>}
export interface SourceReader {read(ctx:RequestContext,id:string,version?:number,purpose?:'read'|'export'|'provider_context'):Promise<{id:string;version:number;sha256:string;content:string|null;known_at:string;effective_at:string|null;app_id:string;entity_id:string;record_id:string;field_ids:string}>}
export class EvidencePortfolioSources implements IntelligenceSourcePort {
 constructor(readonly reader:SourceReader,readonly access:EvidenceAccessPort,readonly state:PortfolioStatePort,readonly policy:PolicyPort,readonly db:D1Database){}
 async load(ctx:RequestContext,id:string,version:number){const r=await this.reader.read(ctx,id,version);if(r.content===null)throw new Error('source_content_unavailable');return{id:r.id,version:r.version,sha256:r.sha256,knownAt:r.known_at,effectiveAt:r.effective_at,payload:JSON.parse(r.content)};}
 async authorizeProjection(ctx:RequestContext,s:Snapshot,profileId:string,fieldIds:string[]){
  const allFields=new Set<string>();for(const source of s.sources){const r=await this.reader.read(ctx,source.id,source.version,'provider_context');const fields=JSON.parse(r.field_ids) as string[];fields.forEach(f=>allFields.add(f));await this.access.checkReference(ctx,{appId:r.app_id,entityId:r.entity_id,recordId:r.record_id},fields,'provider_context');}
  if([...allFields].some(f=>!fieldIds.includes(f)))throw new Error('incomplete_provider_field_projection');await this.access.egress(ctx,{appId:s.appId,profileId,purpose:s.provenance==='authorized_historical'?'historical.portfolio_formulation':'portfolio_formulation',fieldIds:[...allFields]});
 }
 current(ctx:RequestContext,s:Snapshot){return this.state.current(ctx,s);}
 async guards(ctx:RequestContext,s:Snapshot){if(s.provenance==='authorized_historical')return s.sources.map(x=>trustedPredicate('EXISTS(SELECT 1 FROM evidence_source_versions v JOIN evidence_sources s ON s.id=v.source_id WHERE s.id=? AND v.version=? AND v.sha256=? AND v.known_at<=? AND s.erased_at IS NULL)',[x.id,x.version,x.sha256,s.cutoff]));return[...await this.state.guards(ctx,s),...s.sources.map(x=>trustedPredicate('EXISTS(SELECT 1 FROM evidence_sources WHERE id=? AND current_version=? AND erased_at IS NULL)',[x.id,x.version]))];}
 async checkAuthority(ctx:RequestContext,s:Snapshot,selectedIds:string[]):Promise<{issues:CheckIssue[];guards:SqlPredicate[]}>{
  const issues:CheckIssue[]=[],guards:SqlPredicate[]=[];
  for(const choice of s.choices.filter(x=>selectedIds.includes(x.id)&&x.action!=='none')){
   if(!choice.subject||!choice.actionInputHash){issues.push({constraintId:choice.id,code:'authority_subject_missing',message:'Exact action subject and input hash are required.'});continue;}
   const grant=s.authority.find(x=>x.id===choice.authorityRef);
   try{const permit=await this.policy.authorize(ctx,{appId:s.appId,action:choice.action,expected:[choice.subject],cost:[choice.cost],inputHash:choice.actionInputHash,commandId:crypto.randomUUID(),...(grant?{grantId:grant.id,grantVersion:grant.version}:{})});guards.push(...permit.guards);}
   catch{issues.push({constraintId:choice.id,code:'authority_not_current',message:'Current policy, grant, exact quote or designated approval does not permit this action.'});}
  }
  for(const grant of s.authority){const choices=s.choices.filter(x=>selectedIds.includes(x.id)&&x.authorityRef===grant.id&&x.action!=='none');if(!choices.length)continue;const amounts=new Map<string,string>();for(const choice of choices){const unit=`money:${choice.cost.currency}:${choice.cost.scale}`;amounts.set(unit,String(BigInt(amounts.get(unit)??'0')+BigInt(choice.cost.minor)));}try{const budget=await reserveBudgets(this.db,{grantId:grant.id,grantVersion:grant.version,commandId:createUlid(),now:Date.parse(ctx.now),amounts});guards.push(...budget.guards);}catch{issues.push({constraintId:grant.id,code:'aggregate_authority_budget',message:'Combined alternatives exceed the current remaining grant budget.'});}}
  // The returned reservation mutations are deliberately not committed during read-only exploration.
  return {issues,guards};
 }
}
