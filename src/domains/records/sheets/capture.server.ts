import {googleSheetsReader} from '../../../adapters/google-sheets.server'
import {canonical,sha256} from '../../../adapters/crypto.server'
import {createUlid} from '../../../core/shared/ids'
import {registerTable,trustedPredicate} from '../../admission/sql.server'
import type {AdmissionPort} from '../../admission/ports'
import type {RequestContext,PolicyPort} from '../../authority/ports'
import type {CredentialPort} from '../../../adapters/contracts'
const snapshots=registerTable('record_sheet_snapshots',['job_id','connection_id','actor_id','source_json','created_at'])
export async function captureSheets(db:D1Database,policy:PolicyPort,admission:AdmissionPort,ctx:RequestContext,id:string,credentials:CredentialPort){
 const row=await db.prepare('SELECT app_id,account_id,scopes_json,version FROM provider_connections WHERE id=? AND adapter_id=? AND state=? AND revoked_at IS NULL').bind(id,'google-sheets','connected').first<{app_id:string;account_id:string;scopes_json:string;version:number}>()
 if(!row)throw new Error('Google Sheets connection is not active')
 const scopes=JSON.parse(row.scopes_json) as {resource:string;actions:string[]}[];if(!scopes.some(scope=>scope.resource===row.account_id&&scope.actions.includes('connection.sync')))throw new Error('Spreadsheet is outside the configured connection scope')
 const sheets=await googleSheetsReader(credentials)(id,row.account_id,ctx.requestId),source=canonical({format:'cradle-google-sheets',sheets}),inputHash=await sha256(source)
 const permit=await policy.authorize(ctx,{appId:row.app_id,action:'connection.sync',connectionId:id,expected:[],cost:[],inputHash})
 await admission.commit(ctx,{commandId:createUlid(),action:permit.action,appId:row.app_id,canonicalInputHash:inputHash,permit,guards:[trustedPredicate('EXISTS(SELECT 1 FROM provider_connections WHERE id=? AND version=? AND state=? AND revoked_at IS NULL)',[id,row.version,'connected'])],mutations:[{kind:'insert',table:snapshots,row:{job_id:ctx.requestId,connection_id:id,actor_id:ctx.principal.id,source_json:source,created_at:ctx.now}}],audit:[{action:'connection.sync',subject:null,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:{captured:true}})
}
