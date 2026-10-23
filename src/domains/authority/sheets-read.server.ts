import type {AuthorizationRequest,RequestContext} from './ports'
import {trustedPredicate} from '../admission/sql.server'
/** A human owner's read-only spreadsheet snapshot has no provider write effect.
 * Personal file stores have their own current attachment-policy authority. */
export async function ownerSheetsRead(db:D1Database,ctx:RequestContext,request:AuthorizationRequest){
 if(ctx.principal.kind!=='human'||request.action!=='connection.sync'||request.cost.length||!request.connectionId)return null
 const guard=trustedPredicate("EXISTS(SELECT 1 FROM provider_connections c WHERE c.id=? AND c.app_id=? AND c.adapter_id='google-sheets' AND c.state='connected' AND c.revoked_at IS NULL AND EXISTS(SELECT 1 FROM json_each(c.consent_scopes_json) WHERE value=?)) AND EXISTS(SELECT 1 FROM authority_principals p JOIN cradle_base_operators m ON m.principal_id=p.id JOIN oa_operators o ON o.id=m.base_id WHERE p.id=? AND p.state='active' AND o.status='active' AND o.role='owner')",[request.connectionId,request.appId,'https://www.googleapis.com/auth/spreadsheets.readonly',ctx.principal.id])
 return await db.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first()?guard:null
}
