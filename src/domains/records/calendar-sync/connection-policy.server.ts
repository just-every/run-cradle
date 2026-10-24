import type {PolicyPort} from '../../authority/ports'
import {manualAuthority} from '../manual/authority.server'
import {trustedPredicate} from '../../admission/sql.server'
/** Owned calendar reads are finite native-owner operations, never external write grants. */
export function calendarConnectionPolicy(db:D1Database,ordinary:PolicyPort):PolicyPort{return {scope:ordinary.scope,async authorize(ctx,request){
 if(request.action!=='connection.sync'||!request.connectionId)return ordinary.authorize(ctx,request)
 const row=await db.prepare("SELECT app_id,owner_id FROM provider_connections WHERE id=? AND adapter_id IN ('google-calendar','outlook') AND revoked_at IS NULL").bind(request.connectionId).first<{app_id:string;owner_id:string}>()
 if(!row)return ordinary.authorize(ctx,request)
 if(row.owner_id!==ctx.principal.id||row.app_id!==request.appId)return ordinary.authorize(ctx,request)
 const permit=await manualAuthority(db,ordinary,ctx,row.app_id,request.inputHash),guard=trustedPredicate("EXISTS(SELECT 1 FROM provider_connections WHERE id=? AND app_id=? AND owner_id=? AND adapter_id IN ('google-calendar','outlook') AND revoked_at IS NULL)",[request.connectionId,row.app_id,ctx.principal.id])
 return {...permit,action:'connection.sync',guards:[...permit.guards,guard]}
}}}
