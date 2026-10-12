import {createRuntimeConfigurationAdapters} from './runtime-configuration.server';
import type {OperationsDependencies} from './ports';
import type {CanonicalEnvironmentDependencies} from './environment.server';
import type {RepairDependencies} from '../../apps/repairs/ports';
import type {EvidenceDependencies} from '../evidence/ports';
import type {ResourceBinding} from './portfolio-state.server';
import type {ImprovementEvidencePort} from '../improvements/service.server';
import type {ImprovementConfiguration} from '../scorecard/improvements.server';
import type {RequestContext} from '../authority/ports';
import {createCanonicalOperationsEnvironment} from './environment.server';
import {createOperationConfigurationService} from './configuration.server';
import {createOperationsService} from './service.server';
import {createOperationWorker} from './worker.server';
import {createOperationScheduler} from './scheduler.server';
import {createRepairCaseAdapter} from './repair-adapter.server';
import {repairObjectiveVerifier,launchObjectiveVerifier,createObjectiveVerifierCatalogue} from './verifiers.server';
import {createCaseCorrectionAdapter} from './correction.server';
import {createOperationInvalidationHandler} from './invalidation.server';
import {createTodayService} from '../today/service.server';
import {createScorecardService} from '../scorecard/service.server';
import {createImprovementEvidenceAdapter} from '../scorecard/improvements.server';
import {createPortfolioStateAdapter} from './portfolio-state.server';
import {createIntelligenceOperationAdapters} from './intelligence-adapter.server';
export type OperationsRuntimeDependencies=Omit<CanonicalEnvironmentDependencies,'configuration'|'correct'|'verifiers'|'actions'>&{
 admission:OperationsDependencies['admission'];model:OperationsDependencies['model'];cursorSecret:string;clock?:()=>string;
 registeredActions:CanonicalEnvironmentDependencies['actions'];evidenceDependencies:EvidenceDependencies;
 repairDependencies:(cases:ReturnType<typeof createRepairCaseAdapter>)=>RepairDependencies;
 resources?:ReadonlyMap<string,ResourceBinding>;
};
/** One fully composed domain runtime. Missing selected owner configuration is explicit at use, never replaced by sample data. */
export async function createOperationsRuntime(d:OperationsRuntimeDependencies){
 for(const name of ['db','policy','admission','records','evidence','execution','descriptors','registeredActions','evidenceDependencies','repairDependencies','cursorSecret'] as const)if(!d[name])throw new Error(`Operations runtime requires ${name}`);
 const configuration=createOperationConfigurationService(d),verifiers=createObjectiveVerifierCatalogue([launchObjectiveVerifier(d.db,d.policy)]);
 const environment=createCanonicalOperationsEnvironment({...d,actions:d.registeredActions,configuration:configuration.resolve,correct:createCaseCorrectionAdapter(d.evidenceDependencies),verifiers});
 const service=createOperationsService({...d,environment}),cases=createRepairCaseAdapter(service.repo),repairDependencies=d.repairDependencies(cases);verifiers.set('repair.accepted-and-handed-off',repairObjectiveVerifier(repairDependencies));
 const runtimeConfiguration=createRuntimeConfigurationAdapters(service.repo),resources=d.resources??await runtimeConfiguration.resourceBindings();
 const portfolioState=createPortfolioStateAdapter({...d,resources}),intelligence=createIntelligenceOperationAdapters(service.repo,portfolioState,d.evidence.source.bind(d.evidence));
 return{service,configuration,runtimeConfiguration,recovery:runtimeConfiguration.recovery,environment,cases,repairDependencies,worker:createOperationWorker(service.repo),scheduler:createOperationScheduler(service,runtimeConfiguration.backgroundContext),today:createTodayService(service.repo),scorecards:createScorecardService(service.repo),portfolioState,intelligence,invalidateSources:createOperationInvalidationHandler(service.repo),improvements:createImprovementEvidenceAdapter(service.repo,{evidence:d.evidence,model:d.model,configuration:runtimeConfiguration.improvementConfiguration,recoveryAuthorization:runtimeConfiguration.recoveryAuthorization,prepareRecoveryDecision:runtimeConfiguration.prepareRecoveryDecision})};
}
