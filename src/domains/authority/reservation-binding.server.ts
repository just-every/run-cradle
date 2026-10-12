import type { SqlMutation, SqlPredicate } from '../admission/ports'
import { trustedPredicate } from '../admission/sql.server'
import type { AuthorizationRequest, AuthorityPermit, PolicyPort, RequestContext } from './ports'
import { AuthorityError } from './errors'
export type ReservationBinding={appId:string;action:string;principalId:string;attemptId:string;inputHash:string;hash:string}
export const revalidateReservations=async(db:D1Database,input:{grantId:string;grantVersion:number;commandId:string;ids:readonly string[];amounts:ReadonlyMap<string,string>;binding:ReservationBinding})=>{
 const expected=[...input.amounts].filter(([,amount])=>BigInt(amount)>0n),guards:SqlPredicate[]=[]
 if(input.ids.length!==expected.length||new Set(input.ids).size!==input.ids.length)throw new AuthorityError('version_conflict','Reservation identity does not match the prepared effect.',409)
 const remaining=new Map(expected)
 for(const id of input.ids){const b=input.binding,where=trustedPredicate(`id=? AND command_id=? AND grant_id=? AND grant_version=? AND app_id=? AND action=? AND owner_principal_id=? AND attempt_id=? AND input_hash=? AND binding_hash=? AND state='reserved'`,[id,input.commandId,input.grantId,input.grantVersion,b.appId,b.action,b.principalId,b.attemptId,b.inputHash,b.hash]);const row=await db.prepare(`SELECT unit,amount FROM authority_reservations WHERE ${where.sql}`).bind(...where.values).first<{unit:string;amount:string}>();if(!row||remaining.get(row.unit)!==row.amount)throw new AuthorityError('version_conflict','The exact prepared reservation is no longer available.',409);remaining.delete(row.unit);guards.push(trustedPredicate(`EXISTS(SELECT 1 FROM authority_reservations WHERE ${where.sql} AND amount=?)`,[...where.values,row.amount]))}
 if(remaining.size)throw new AuthorityError('version_conflict','Prepared reservation is incomplete.',409)
 return {guards,mutations:[] as SqlMutation[],ids:[...input.ids]}
}
/** Supply the original immutable authorization request loaded from X, never IDs from a client. */
export const revalidateReservationPermit=(policy:PolicyPort,ctx:RequestContext,request:AuthorizationRequest,binding:{originCommandId:string;attemptId:string;reservationIds:string[]}):Promise<AuthorityPermit>=>policy.authorize(ctx,{...request,commandId:binding.originCommandId,attemptId:binding.attemptId,existingReservation:binding})
