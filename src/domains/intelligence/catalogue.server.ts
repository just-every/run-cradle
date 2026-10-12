import type {RequestContext} from '../authority/ports';
import type {Money,AllowedAction,Page} from '../../contracts/primitives';
import type {Decision} from '../decisions/contracts';
import type {IntelligenceService} from './service.server';
import type {StoredSnapshot} from './service-contracts';
import type {ExpertService} from './expert.server';
import {currentAtSnapshot} from './checker';
import {canonical} from './exact';
import {hiddenArtifact} from './visibility';
export interface PortfolioDecisionCatalogue {list(ctx:RequestContext,strategyId:string):Promise<(Decision&{label:string;expected:import('../../contracts/primitives').RevisionRef[]})[]>}
export async function snapshotCatalogue(s:IntelligenceService,ctx:RequestContext,appId:string,query:{limit?:number;cursor?:string}){
 const page=await s.repository.page<StoredSnapshot>(ctx,'snapshots',appId,query);
 const items=await Promise.all(page.items.map(async row=>{const snapshot=row.snapshot,current=snapshot.provenance==='operational'?await s.sources.current(ctx,snapshot):currentAtSnapshot(snapshot);return{id:row.id,version:row.version,label:`${snapshot.provenance==='operational'?'Current operations':snapshot.provenance==='authorized_historical'?'Historical replay':'Synthetic test'} · ${snapshot.cutoff}`,createdAt:row.createdAt,sourceVersions:snapshot.sources.map(({id,version,sha256})=>({id,version,sha256})),validity:canonical({...current,now:snapshot.cutoff})===canonical(currentAtSnapshot(snapshot))&&(snapshot.provenance!=='operational'||ctx.now<snapshot.horizonEnd)?'current' as const:'stale' as const,cutoff:snapshot.cutoff,horizonEnd:snapshot.horizonEnd,provenance:snapshot.provenance,constraints:snapshot.constraints};}));return{...page,items};
}
export async function investigationCatalogue(s:IntelligenceService,ctx:RequestContext,appId:string,query:{limit?:number;cursor?:string}){
 const page=await s.repository.page<Awaited<ReturnType<ExpertService['proposeInvestigation']>>>(ctx,'investigations',appId,query);
 const items=await Promise.all(page.items.map(async row=>{let reason:string|null=row.state!=='proposed'?'Investigation already started.':row.assessment.decision!=='investigate'?'Value of information or evidence prerequisites are not met.':!row.action?'No executable investigation action is specified.':null;
 if(!reason){try{await s.repository.policy.authorize(ctx,{appId,action:'investigation.start',expected:[],cost:[],inputHash:''});}catch(error){if(!hiddenArtifact(error))throw error;reason='Current authority does not permit this investigation.';}}
 // Cost is money only if the proposal explicitly declared exact canonical money units.
 const match=/^money:([A-Z]{3}):(\d+)$/.exec(row.value.unit);const cost:Money[]=match&&/^\d+$/.test(row.value.investigationCost)?[{minor:row.value.investigationCost,currency:match[1],scale:Number(match[2])}]:[];
 const allowedActions:AllowedAction[]=[{action:'investigation.start',enabled:reason===null,reason,requiredDecisionId:null}];return{id:row.id,version:row.version,label:row.question,description:row.question,state:row.state,problemId:row.problemId,cost,valuedCost:{amount:row.value.investigationCost,unit:row.value.unit},allowedActions,prerequisites:{assessment:row.assessment,evidenceAlreadyChecked:row.evidenceAlreadyChecked,action:row.action},runId:row.runId};}));return{...page,items};
}
export type SnapshotCatalogueItem=Awaited<ReturnType<typeof snapshotCatalogue>>['items'][number];
export type InvestigationCatalogueItem=Awaited<ReturnType<typeof investigationCatalogue>>['items'][number];
