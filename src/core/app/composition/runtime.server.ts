import {createSlackApp} from '../../../domains/slack-app/service.server'
import {createRecordCalendarSync} from '../../../domains/records/calendar-sync/service.server'
import {recordCalendarSyncHttp} from '../../../domains/records/calendar-sync/http.server'
import {ensureCalendarCapture} from '../../../domains/records/calendar-sync/capture.server'
import {createUlid} from '../../shared/ids'
import {metadataTrashPurge} from '../../../domains/records/trash/metadata-purge.server'
import {recordTrashPurge} from '../../../domains/records/trash/purge.server'
import {createChangeSubscriptions} from '../../../domains/change-subscriptions/service.server'
import {changeSubscriptionDelivery} from '../../../domains/change-subscriptions/delivery.server'
import {ensureRecordCapacity} from '../../../domains/records/capacity.server'
import {createSheetsImport} from '../../../domains/records/sheets/import.server'
import {createSheetSchedules} from '../../../domains/records/sheets/schedules.server'
import {sheetsHttp} from '../../../domains/records/sheets/http.server'
import {createFileStores} from '../../../domains/records/file-stores/service.server'
import {fileStoresHttp} from '../../../domains/records/file-stores/http.server'
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
 validateAuthConfiguration(platform.auth.configuration)
 const records=createRecordsComposition(platform,foundation)
 const slackApp=createSlackApp(platform.bindings,foundation,records.services,platform.auth.configuration.appOrigin)
 const providers=createProvidersComposition(platform,foundation,slackApp)
 const calendarSyncService=createRecordCalendarSync(platform.bindings.DB,foundation,providers,records.services,platform.auth.configuration.appOrigin)
 await ensureCalendarCapture(platform.bindings.DB,foundation.descriptors)
 const calendarSync={service:calendarSyncService,http:recordCalendarSyncHttp(calendarSyncService,request=>foundation.authenticate(request,'http',createUlid()))}
 const sheetSource=createSheetsImport(platform.bindings.DB,foundation,providers),sheetSchedules=createSheetSchedules(platform.bindings.DB,foundation,sheetSource,records.csv,clock),sheets={http:sheetsHttp(foundation,sheetSource,sheetSchedules),scheduled:sheetSchedules.scheduled}
 const fileStores={http:fileStoresHttp(foundation,createFileStores(platform.bindings.DB,foundation,providers,records.services.reader,records.services.writer,records.deps))}
 const warehouse=createWarehouseComposition(platform,foundation,records,clock)
 await ensureRecordAutomationTriggers(platform.bindings.DB,foundation.descriptors)
 const changeSubscriptions=createChangeSubscriptions(platform.bindings,foundation.policy,foundation.admission,records.services,platform.auth.configuration.sessionSecret)
 const changeDelivery=changeSubscriptionDelivery(platform.bindings,changeSubscriptions,platform.auth.configuration.appOrigin,clock)
 const purgeRecords=recordTrashPurge(platform.bindings.DB,foundation.descriptors,foundation.admission,clock),purgeMetadata=metadataTrashPurge(platform.bindings.DB,foundation.admission,clock)
 const automations=createAutomationsComposition(platform,foundation,records.services,clock,slackApp)
 const channels=createChannelsComposition(platform,foundation,providers)
 const launch=createInstalledLaunch(platform,foundation,clock)
 const repairIntake=createRepairIntakeComposition(platform,foundation,records,providers)
 const launchImports=createLaunchImportComposition(platform,foundation,records)
 return {calendarSync,trashPurge:async()=>{await purgeRecords();await purgeMetadata()},changeSubscriptions,changeDelivery,foundation,sheets,fileStores,warehouse,providers,records,channels,repairIntake,automations,lifecycle,launch,launchImports}
}
export type Runtime=Awaited<ReturnType<typeof createRuntime>>
