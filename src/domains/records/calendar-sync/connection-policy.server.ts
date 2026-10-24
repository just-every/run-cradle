import type {PolicyPort,RequestContext} from '../../authority/ports'
import {manualAuthority} from '../manual/authority.server'
import {trustedPredicate} from '../../admission/sql.server'
const calendar=(adapter:string)=>adapter==='google-calendar'||adapter==='outlook'
/** A base author can configure a personal calendar; this confers no external write approval. */
export async function calendarConnectionSetup(db:D1Database,ordinary:PolicyPort,ctx:RequestContext,input:{appId:string;adapterId:string},inputHash:string){
 if(!calendar(input.adapterId)||!await db.prepare('SELECT 1 FROM manual_record_bases WHERE id=?').bind(input.appId).first())return undefined
 const permit=await manualAuthority(db,ordinary,ctx,input.appId,inputHash)
 return {...permit,action:'connection.configure'}
}
/** Every management/read job remains bound to the current base author and their own calendar. */
export function calendarConnectionPolicy(db:D1Database,ordinary:PolicyPort):PolicyPort{return {scope:ordinary.scope,async authorize(ctx,request){
 if(!['connection.read','connection.begin-consent','connection.check','connection.revoke','connection.sync'].includes(request.action)||!request.connectionId)return ordinary.authorize(ctx,request)
 const row=await db.prepare("SELECT app_id,owner_id FROM provider_connections WHERE id=? AND app_id IN (SELECT id FROM manual_record_bases) AND adapter_id IN ('google-calendar','outlook')").bind(request.connectionId).first<{app_id:string;owner_id:string}>()
 if(!row||row.owner_id!==ctx.principal.id||row.app_id!==request.appId)return ordinary.authorize(ctx,request)
 const permit=await manualAuthority(db,ordinary,ctx,row.app_id,request.inputHash),guard=trustedPredicate("EXISTS(SELECT 1 FROM provider_connections WHERE id=? AND app_id=? AND owner_id=? AND adapter_id IN ('google-calendar','outlook'))",[request.connectionId,row.app_id,ctx.principal.id])
 return {...permit,action:request.action,guards:[...permit.guards,guard]}
}}}
