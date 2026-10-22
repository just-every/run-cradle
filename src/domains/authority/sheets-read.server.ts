import type {AuthorizationRequest,RequestContext} from './ports'
import {trustedPredicate} from '../admission/sql.server'
/** The read scope each read-only source needs before a human owner may run it without a persisted grant. */
const readScopes:Readonly<Record<string,string>>={'google-sheets':'https://www.googleapis.com/auth/spreadsheets.readonly','google-drive':'https://www.googleapis.com/auth/drive.metadata.readonly',onedrive:'Files.Read',dropbox:'files.metadata.read',box:'root_readonly'}
/** A human owner's read-only spreadsheet snapshot or file-store listing has no provider write effect.
 * Current policy, connection scope and principal fences still apply on every use. A file store is read
 * only through its own owner's connection (FILE-002). */
export async function ownerSheetsRead(db:D1Database,ctx:RequestContext,request:AuthorizationRequest){
 if(ctx.principal.kind!=='human'||request.action!=='connection.sync'||request.cost.length||!request.connectionId)return null
 const adapters=Object.keys(readScopes),clause=adapters.map(()=>"(c.adapter_id=? AND (c.adapter_id='google-sheets' OR c.owner_id=?) AND EXISTS(SELECT 1 FROM json_each(c.consent_scopes_json) WHERE value=?))").join(' OR ')
 const guard=trustedPredicate(`EXISTS(SELECT 1 FROM provider_connections c WHERE c.id=? AND c.app_id=? AND c.state='connected' AND c.revoked_at IS NULL AND (${clause})) AND EXISTS(SELECT 1 FROM authority_principals p JOIN cradle_base_operators m ON m.principal_id=p.id JOIN oa_operators o ON o.id=m.base_id WHERE p.id=? AND p.state='active' AND o.status='active' AND o.role='owner')`,[request.connectionId,request.appId,...adapters.flatMap(adapter=>[adapter,ctx.principal.id,readScopes[adapter]!]),ctx.principal.id])
 return await db.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first()?guard:null
}
