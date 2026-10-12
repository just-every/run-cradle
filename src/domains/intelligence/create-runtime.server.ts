import type {RequestContext,PolicyPort} from '../authority/ports';
import type {AdmissionPort} from '../admission/ports';
import type {EvidencePort,EvidenceAccessPort} from '../evidence/ports';
import type {ModelPort} from '../execution/model-ports';
import type {ConstructionService} from '../construction/service.server';
import type {RunnerClient} from '../construction/runner-client.server';
import type {RepairDependencies} from '../../apps/repairs/ports';
import type {IntelligenceArtifactPort,StrategyExecutionPort} from './ports';
import type {SourceReader,PortfolioStatePort} from './source-adapter.server';
import {EvidencePortfolioSources} from './source-adapter.server';
import {IntelligenceRepository} from './repository.server';
import {IntelligenceService} from './service.server';
import {ExpertService,type InvestigationExecutionPort} from './expert.server';
import {IsolatedOptimizer} from './runner.server';
import {createIntelligenceRoutes} from './http.server';
import {createPortfolioDecisionCatalogue} from './decisions.server';
import {KnowledgeService} from '../knowledge/service.server';
import {createKnowledgeRoutes} from '../knowledge/http.server';
import type {ProcedureEvaluationPort} from '../knowledge/evaluator.server';
import type {Money} from '../../contracts/primitives';
export type IntelligenceRuntimeDependencies={db:D1Database;policy:PolicyPort;admission:AdmissionPort;evidence:EvidencePort;sourceReader:SourceReader;evidenceAccess:EvidenceAccessPort;portfolioState:PortfolioStatePort;strategyExecution:StrategyExecutionPort;investigationExecution:InvestigationExecutionPort;repairs:RepairDependencies;model:ModelPort|null;construction:ConstructionService|null;runner:{client:RunnerClient;artifacts:IntelligenceArtifactPort}|null;routing:ConstructorParameters<typeof IntelligenceService>[6];explorationProfiles:{profileId:string;fieldIds:string[];maximumCost:Money}[];procedureEvaluator:ProcedureEvaluationPort|null;authenticate(request:Request):Promise<RequestContext>};
/** Runtime composition contains real domain ports. Unconfigured generation stays explicit; manual source tools remain usable. */
export function createIntelligenceRuntime(d:IntelligenceRuntimeDependencies){
 const repository=new IntelligenceRepository(d.db,d.policy,d.admission),sources=new EvidencePortfolioSources(d.sourceReader,d.evidenceAccess,d.portfolioState,d.policy,d.db),optimizer=d.runner?new IsolatedOptimizer(d.runner.client,d.runner.artifacts):null;
 const service=new IntelligenceService(repository,sources,d.evidence,d.model,optimizer,d.strategyExecution,d.routing),expert=new ExpertService(service,d.construction,d.investigationExecution),knowledge=new KnowledgeService(repository,sources,d.procedureEvaluator,optimizer),decisions=createPortfolioDecisionCatalogue(repository,d.repairs);
 return{repository,sources,service,expert,knowledge,decisions,routes:createIntelligenceRoutes({service,expert,decisions,explorationProfiles:d.explorationProfiles,authenticate:d.authenticate}),knowledgeRoutes:createKnowledgeRoutes({service:knowledge,authenticate:d.authenticate})};
}
