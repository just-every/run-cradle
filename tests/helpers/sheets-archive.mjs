import assert from 'node:assert/strict'
import {withRerEmittedWorker} from './rer-emitted-worker.mjs'
import {bindings} from './rer-data-fixture.mjs'
import {sheetsProvider} from './sheets-provider.mjs'
import {connectSheets} from './sheets-journey.mjs'
import {workbookDoors} from './workbook-http.mjs'
export async function archiveSheetsSource(copy,origin,prior){const provider=sheetsProvider()
 return withRerEmittedWorker(copy,origin,async()=>{
  const d=await workbookDoors({origin,cookie:prior.cookie}),identity={appId:prior.records.appId,entityId:prior.records.entityId},connectionId=await connectSheets(d,provider,identity),mapping=[{column:'Order',fieldId:prior.records.fieldId}],sourceName='Synthetic archive Sheets'
  await d.call('/api/v1/records/import-mappings',{...identity,action:'save',sourceName,mapping,mergeFieldId:prior.records.fieldId,expectedVersion:null})
  const schedule=await d.call('/api/v1/records/sheets-schedule',{...identity,connectionId,sheet:'Orders',mapping,mergeFieldId:prior.records.fieldId,enabled:true})
  assert.equal(schedule.state,'active');return {scheduleId:schedule.id,connectionId,sourceName}
 },{outbound:request=>provider.fetch(request),bindings:{GOOGLE_CLIENT_ID:'synthetic-cradle-client-1',GOOGLE_CLIENT_SECRET:'synthetic-cradle-client-secret-1'}})
}
export async function archiveSheetsRestored(copy,source){await bindings(copy.source,async({DB})=>{
 const schedule=await DB.prepare('SELECT * FROM record_sheet_schedules WHERE id=?').bind(source.scheduleId).first();assert.equal(schedule.state,'paused');assert.equal(schedule.running_id,null)
 const connection=await DB.prepare('SELECT * FROM provider_connections WHERE id=?').bind(source.connectionId).first();assert.equal(connection.state,'unconfigured');assert.equal(connection.credential_ref,null)
 assert.equal(await DB.prepare('SELECT connection_id FROM connection_credentials WHERE connection_id=?').bind(source.connectionId).first(),null)
 assert.ok(await DB.prepare('SELECT id FROM record_csv_mappings WHERE source_name=?').bind(source.sourceName).first(),'Saved mapping survives without reactivating its source')
});console.log('SHEETS_ARCHIVE: active source restored paused with mapping retained and no credential')}
