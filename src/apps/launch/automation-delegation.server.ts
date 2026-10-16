import type {LaunchContext} from './domain.server'
import type {LegacyAutomationRun} from './automation-runtime.server'
import type {RequestContext,Principal} from '../../domains/authority/ports'
import {LAUNCH_APP_ID,launchEntities} from './contracts'
import {launchFieldIds} from './descriptors.server'
import {AdmissionError} from '../../domains/admission/errors'
import {trustedPredicate} from '../../domains/admission/sql.server'
/** Owner-authored definitions retain the original session identity, never a bearer credential. */
export async function automationDelegation(base:LaunchContext,ctx:RequestContext,run:LegacyAutomationRun){
 const row=await base.db.prepare('SELECT principal_json FROM launch_automation_authorities WHERE automation_id=? AND definition_version=?').bind(run.automationId,run.definitionVersion).first<{principal_json:string|null}>()
 if(!row?.principal_json)throw new AdmissionError('forbidden','Automation must be saved by a current operator before it can execute')
 const human={...ctx,principal:JSON.parse(row.principal_json) as Principal}
 const permit=await base.policy.authorize(human,{appId:LAUNCH_APP_ID,action:'launch.automation.save',expected:[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities.automation,recordId:run.automationId},version:run.definition.version}],fieldIds:Object.values(launchFieldIds.automation),cost:[],inputHash:'',commandId:ctx.requestId})
 return{human,guards:[...permit.guards,trustedPredicate('EXISTS(SELECT 1 FROM launch_automation_authorities WHERE automation_id=? AND definition_version=? AND principal_json=?)',[run.automationId,run.definitionVersion,row.principal_json])]}
}
