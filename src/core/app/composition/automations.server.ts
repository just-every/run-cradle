import {smsSettings} from '../../../domains/sms/settings.server'
import {createAutomationTriggers} from '../../../domains/automations/triggers.server'
import {createAutomationFailureAlerts} from '../../../domains/automations/failure-alerts.server'
import {createAutomationRetry} from '../../../domains/automations/retry.server'
import type { Platform } from '../../platform'
import type { ServerFoundation } from '../foundation.server'
import { createRecordAutomationConfiguration } from '../../../domains/automations/configuration.server'
import { createRecordAutomationHistory } from '../../../domains/automations/history.server'
import { createAutomationDestinations } from '../../../domains/automations/destinations.server'
import { createAutomationEffects } from '../../../domains/automations/effects.server'
import { createRecordAutomationRuntime } from '../../../domains/automations/runtime.server'
import { recordAutomationsHttp } from '../../../domains/automations/http.server'
import { ownerDelegationSnapshot } from '../../../domains/authority/delegation.server'
import { and } from '../../../domains/admission/sql.server'
import {createAutomationTests} from '../../../domains/automations/test-runs.server'
import type {createRecordServices} from '../../../domains/records/service.server'
import { createUlid } from '../../shared/ids'

export function createAutomationsComposition(platform:Platform,foundation:ServerFoundation,services:ReturnType<typeof createRecordServices>,clock=()=>new Date(),slack?:ReturnType<typeof import('../../../domains/slack-app/service.server').createSlackApp>) {
 const db=platform.bindings.DB,{policy,admission,descriptors,entities,commands}=foundation,{reader,templates}=services
 const destinations=createAutomationDestinations(platform.bindings,policy,admission)
 const configuration=createRecordAutomationConfiguration(db,policy,admission,descriptors,platform.auth.configuration.appOrigin,slack,templates)
 const history=createRecordAutomationHistory(db,policy,descriptors)
 const effects=createAutomationEffects({templates,env:platform.bindings,entities,admission,commands,destinations,reader,descriptors,policy,slack,appOrigin:platform.auth.configuration.appOrigin})
 const failures=createAutomationFailureAlerts(platform.bindings,foundation,platform.auth.configuration.appOrigin,clock)
 const runner=createRecordAutomationRuntime({db,appOrigin:platform.auth.configuration.appOrigin,policy,descriptors,reader,effects,clock})
 const triggers=createAutomationTriggers(platform.bindings,foundation,reader,platform.auth.configuration.appOrigin,clock)
 const runtime={async tick(commandId?:string,ingress:'queue'|'schedule'='schedule'){if(ingress==='schedule')await triggers.tick();await runner.tick(commandId,ingress);await failures.tick()}}
 const tests=createAutomationTests(platform.bindings,foundation,reader,destinations,effects,templates)
 const http=recordAutomationsHttp({slack,sms:smsSettings(platform.bindings,platform.auth.configuration.appOrigin),retry:createAutomationRetry(db,foundation),tests,configuration,history,destinations,authenticate:request=>foundation.authenticate(request,'http',createUlid()),
  async recipients(ctx,appId,entityId) {
   const owner=await ownerDelegationSnapshot(db,ctx,appId),scope=await policy.scope(ctx,{appId,entityId,purpose:'read'})
   const guard=and(owner.guard,...scope.currentAuthorityGuards)
   return (await db.prepare(`SELECT DISTINCT o.id,o.name AS displayName FROM operators o
    JOIN authority_principals p ON p.human_id=o.id AND p.kind='human' AND p.state='active'
    JOIN authority_memberships m ON m.principal_id=p.id AND m.app_id=? AND m.state='active'
    JOIN cradle_base_operators mapping ON mapping.principal_id=p.id
    JOIN oa_operators base ON base.id=mapping.base_id AND base.status='active'
    WHERE o.active=1 AND (${guard.sql}) ORDER BY o.name LIMIT 100`)
    .bind(appId,...guard.values).all<{id:string;displayName:string}>()).results
  },
 })
 return {configuration,history,destinations,runtime,http}
}
