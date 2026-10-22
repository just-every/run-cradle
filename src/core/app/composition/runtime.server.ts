import {ensureRecordCapacity} from '../../../domains/records/capacity.server'
import {createSheetsImport} from '../../../domains/records/sheets/import.server'
import {createSheetSchedules} from '../../../domains/records/sheets/schedules.server'
import {sheetsHttp} from '../../../domains/records/sheets/http.server'
import {createWarehouseComposition} from './warehouse.server'
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
 await ensureRecordCapacity(platform.bindings.DB,foundation.descriptors)
 const lifecycle=createLifecycleComposition(platform,foundation)
 const providers=createProvidersComposition(platform,foundation)
 validateAuthConfiguration(platform.auth.configuration)
 const records=createRecordsComposition(platform,foundation)
 const sheetSource=createSheetsImport(platform.bindings.DB,foundation,providers),sheetSchedules=createSheetSchedules(platform.bindings.DB,foundation,sheetSource,records.csv,clock),sheets={http:sheetsHttp(foundation,sheetSource,sheetSchedules),scheduled:sheetSchedules.scheduled}
 const warehouse=createWarehouseComposition(platform,foundation,records,clock)
 await ensureRecordAutomationTriggers(platform.bindings.DB,foundation.descriptors)
 const automations=createAutomationsComposition(platform,foundation,clock)
 const channels=createChannelsComposition(platform,foundation,providers)
 const launch=createInstalledLaunch(platform,foundation,clock)
 const repairIntake=createRepairIntakeComposition(platform,foundation,records,providers)
 const launchImports=createLaunchImportComposition(platform,foundation,records)
 return {foundation,sheets,warehouse,providers,records,channels,repairIntake,automations,lifecycle,launch,launchImports}
}
export type Runtime=Awaited<ReturnType<typeof createRuntime>>
