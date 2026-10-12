import { createLaunchAnalysisReader } from './analysis-reader.server'
import type { RequestContext,PolicyPort } from '../../domains/authority/ports'
import type { AdmissionPort,SqlMutation,SqlPredicate } from '../../domains/admission/ports'
import type { Ref } from '../../contracts/primitives'
import type { LaunchIntegration } from './ports'
import type { LegacyAnalysisPorts } from './analysis.server'
import type { LegacyAutomationPorts } from './automation-runtime.server'
import { createLegacyAutomationRuntime } from './automation-runtime.server'
import { createLegacyAutomationAuthority } from './service-authority.server'
import { createLaunchHandlers } from './registry.server'
import { createLaunchReader } from './reader.server'
import { createLegacyImportAdapter } from './import.server'
import { createImportService } from '../../domains/portability/import.server'
import { prepareAnalysisRequest,executeAnalysisRequest } from './analysis-requests.server'
import { LAUNCH_APP_ID,launchEntities } from './contracts'
export type LaunchRuntimeDependencies={
 db:D1Database;policy:PolicyPort;admission:AdmissionPort;releaseId:string
 channels:Pick<LaunchIntegration,'notification'|'withdrawNotification'|'withdrawCampaign'|'deleteCampaign'>
 erasure(ctx:RequestContext,subject:Ref):Promise<{guards:SqlPredicate[];mutations:SqlMutation[]}>
 analysis:LegacyAnalysisPorts
 /** Explicit X/N grant-bound implementation for the other declared automation actions. */
 delegatedAutomation:Pick<LegacyAutomationPorts,'authority'|'context'|'external'>
}
/** Full mount requires every actual capability; callers may mount manual handlers separately while dependencies are unavailable. */
export function createLaunchRuntime(deps:LaunchRuntimeDependencies){
 for(const key of ['db','policy','admission','releaseId','channels','erasure','analysis','delegatedAutomation'] as const)if(!deps[key])throw new Error(`Launch runtime requires actual ${key}`)
 for(const key of ['notification','withdrawNotification','withdrawCampaign','deleteCampaign'] as const)if(!deps.channels[key])throw new Error(`Launch runtime requires actual channel ${key}`)
 const context={db:deps.db,policy:deps.policy,releaseId:deps.releaseId,integration:{...deps.channels,async deleteCampaign(ctx:RequestContext,id:string){const [channels,erasure]=await Promise.all([deps.channels.deleteCampaign(ctx,id),deps.erasure(ctx,{appId:LAUNCH_APP_ID,entityId:launchEntities.campaign,recordId:id})]);return{guards:[...channels.guards,...erasure.guards],mutations:[...channels.mutations,...erasure.mutations]}}}}
 const service=createLegacyAutomationAuthority(context),bounded=(key:unknown)=>key==='critical-risk'||key==='launch-readiness'
 const automation=createLegacyAutomationRuntime(context,deps.admission,{releaseId:deps.releaseId,authority:(ctx,input)=>(bounded(input.run.definition.shipped_key)?service:deps.delegatedAutomation).authority(ctx,input),context:(ctx,run)=>(bounded(run.definition.shipped_key)?service:deps.delegatedAutomation).context(ctx,run),external:deps.delegatedAutomation.external})
 const handlers={...createLaunchHandlers(context),'analysis.request':(ctx:RequestContext,input:Parameters<typeof prepareAnalysisRequest>[2])=>prepareAnalysisRequest(context,ctx,input,deps.releaseId)}
 return{context,handlers,reader:createLaunchReader(deps.db,deps.policy),automation,service,analysis:{...createLaunchAnalysisReader(deps.db,deps.policy),execute:(ctx:RequestContext,id:string)=>executeAnalysisRequest(context,deps.analysis,deps.admission,ctx,id)},imports:Object.fromEntries((['campaign','deliverable','milestone'] as const).map(kind=>[kind,createImportService(deps.db,deps.policy,deps.admission,createLegacyImportAdapter(context,kind))]))}
}
