import type {SqlMutation,SqlPredicate,SqlScalar} from '../admission/ports'
import {identifier,registerTable,trustedPredicate} from '../admission/sql.server'
export type Effects={guards:SqlPredicate[];mutations:SqlMutation[]}
export const effects=():Effects=>({guards:[],mutations:[]})
/** Set-oriented deletes retain an exact-count guard in the same admission. */
export async function removeRows(db:D1Database,change:Effects,name:string,where:string,values:SqlScalar[]=[]){
 const n=(await db.prepare(`SELECT count(*) n FROM ${identifier(name)} WHERE ${where}`).bind(...values).first<{n:number}>())!.n
 change.guards.push(trustedPredicate(`(SELECT count(*) FROM ${identifier(name)} WHERE ${where})=?`,[...values,n]))
 if(n)change.mutations.push({kind:'delete',table:registerTable(name,[]),where:trustedPredicate(where,values),expectedRows:n})
}
export async function updateRows(db:D1Database,change:Effects,name:string,set:Record<string,SqlScalar>,where:string,values:SqlScalar[]=[]){
 const n=(await db.prepare(`SELECT count(*) n FROM ${identifier(name)} WHERE ${where}`).bind(...values).first<{n:number}>())!.n
 change.guards.push(trustedPredicate(`(SELECT count(*) FROM ${identifier(name)} WHERE ${where})=?`,[...values,n]))
 if(n)change.mutations.push({kind:'update',table:registerTable(name,Object.keys(set)),set,where:trustedPredicate(where,values),expectedRows:n})
}
export function append(target:Effects,source:Effects){target.guards.push(...source.guards);target.mutations.push(...source.mutations)}
