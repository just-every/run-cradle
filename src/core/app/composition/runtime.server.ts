import { createInstalledLaunch } from './launch-runtime.server'
import {createLifecycleComposition} from './lifecycle.server'
import { validateAuthConfiguration } from '../../../domains/authority/product-auth.server'
import { createChannelsComposition } from './channels.server'
import type { Platform } from '../../platform'
import { createLaunchFoundation } from './launch.server'
import { createProvidersComposition } from './providers.server'
import { createRecordsComposition } from './records.server'
import { createRepairIntakeComposition } from './repair-intake.server'
import { createAutomationsComposition } from './automations.server'
import { createLaunchImportComposition } from './launch-imports.server'
import { ensureRecordAutomationTriggers } from '../../../domains/automations/capture.server'
/** Each request resolves admitted schema pointers and current authority anew. */
export async function createRuntime(platform:Platform,clock=()=>new Date()){
 const foundation=await createLaunchFoundation(platform)
 const lifecycle=createLifecycleComposition(platform,foundation)
 const providers=createProvidersComposition(platform,foundation)
 validateAuthConfiguration(platform.auth.configuration)
 const records=createRecordsComposition(platform,foundation)
 await ensureRecordAutomationTriggers(platform.bindings.DB,foundation.descriptors)
 const automations=createAutomationsComposition(platform,foundation)
 const channels=createChannelsComposition(platform,foundation,providers)
 const launch=createInstalledLaunch(platform,foundation,clock)
 const repairIntake=createRepairIntakeComposition(platform,foundation,records)
 const launchImports=createLaunchImportComposition(platform,foundation,records)
 return {foundation,providers,records,channels,repairIntake,automations,lifecycle,launch,launchImports}
}
export type Runtime=Awaited<ReturnType<typeof createRuntime>>
