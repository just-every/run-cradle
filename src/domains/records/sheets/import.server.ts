import {createUlid} from '../../../core/shared/ids'
import {ApiError} from '../../../core/registry/errors'
import {encodeCsv} from '../../portability/csv'
import {sheetsSourceSchema} from './source'
import type {RequestContext} from '../../authority/ports'
import type {createProvidersComposition} from '../../../core/app/composition/providers.server'
import type {ServerFoundation} from '../../../core/app/foundation.server'
export function createSheetsImport(db:D1Database,foundation:ServerFoundation,providers:ReturnType<typeof createProvidersComposition>){
 async function owner(ctx:RequestContext){if(ctx.principal.kind!=='human'||!await db.prepare(`SELECT 1 FROM authority_principals p JOIN cradle_base_operators m ON m.principal_id=p.id JOIN oa_operators o ON o.id=m.base_id WHERE p.id=? AND p.state='active' AND o.role='owner' AND o.status='active'`).bind(ctx.principal.id).first())throw new ApiError('forbidden','A current owner must configure or run a Sheets import.')}
 async function read(ctx:RequestContext,connectionId:string){
  await owner(ctx);const connection=await providers.connections(ctx).read(ctx,connectionId);if(connection.adapterId!=='google-sheets'||connection.state!=='connected')throw new ApiError('validation','Choose a connected Google Sheets source.')
  const plan=await providers.jobs.prepare(ctx,createUlid(),connectionId,'connection.sync'),saved=await foundation.admission.commit(ctx,plan);if(saved.result.state!=='committed')throw new ApiError('version_conflict','Source job was not admitted.')
  const outbox=await db.prepare("SELECT id FROM admission_outbox WHERE command_id=? AND action='connection.operation'").bind(plan.commandId).first<{id:string}>();if(!outbox)throw new Error('Source job outbox missing');await providers.jobs.dispatch(outbox.id)
  const row=await db.prepare("SELECT s.source_json FROM record_sheet_snapshots s JOIN connection_jobs j ON j.id=s.job_id WHERE s.job_id=? AND s.actor_id=? AND j.state='completed'").bind(saved.result.value.jobId,ctx.principal.id).first<{source_json:string}>()
  if(!row)throw new ApiError('unconfigured','Google Sheets read did not complete. Check consent, spreadsheet scope and import limits.')
  await providers.connections(ctx).read(ctx,connectionId);await owner(ctx)
  return {filename:'google-sheets.sheets.json',content:row.source_json,...sheetsSourceSchema.parse(JSON.parse(row.source_json))}
 }
 return {read,owner}
}
export const sheetCsv=(source:{sheets:{name:string;headers:string[];rows:{value:string|boolean|null}[][]}[]},name:string)=>{const sheet=source.sheets.find(s=>s.name===name);if(!sheet)throw new ApiError('validation','The selected worksheet is no longer available.');return encodeCsv(sheet.headers,sheet.rows.map(row=>row.map(cell=>cell.value===null?'':String(cell.value))))}
