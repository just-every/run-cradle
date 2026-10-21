import {AuthError} from '../../../vendor/base/modules/operator-auth/index.mjs'
import type {OperatorAuth} from '../../../vendor/base/modules/operator-auth/index.mjs'
import type {PlatformBindings} from '../../core/platform/bindings'
import type {SqlMutation,SqlPredicate} from '../admission/ports'
import {identifier} from '../admission/sql.server'
export const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('')
export const secret=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('')
export function fail(message:string,status=400):never{throw new AuthError(message,status)}
export const headers={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}
export async function owner(request:Request,auth:OperatorAuth,env:PlatformBindings){
 if(request.method!=='GET'&&(request.headers.get('origin')!==env.APP_ORIGIN||request.headers.get('sec-fetch-site')==='cross-site'))fail('same_origin_required',403)
 const session=await auth.requireEditorOwner(request)
 return session
}
export function audit(db:D1Database,actor:string,operator:string|null,action:string,now=Date.now()){
 return db.prepare('INSERT INTO company_identity_audit(id,actor_id,operator_id,action,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),actor,operator,action,now)
}
/** Assertions and effects share one D1 transaction; no partial lifecycle writes. */
export async function atomic(db:D1Database,guards:readonly SqlPredicate[],mutations:readonly SqlMutation[],extra:D1PreparedStatement[]=[]){
 const statements=guards.map(g=>db.prepare(`SELECT CASE WHEN (${g.sql}) THEN 1 ELSE json_extract('Company identity changed; retry from current state','$') END`).bind(...g.values))
 for(const m of mutations){const table=identifier(m.table.tableId)
  if(m.kind==='update'){const columns=Object.keys(m.set);statements.push(db.prepare(`UPDATE ${table} SET ${columns.map(c=>identifier(c)+'=?').join(',')} WHERE ${m.where.sql}`).bind(...Object.values(m.set),...m.where.values))}
  else if(m.kind==='delete')statements.push(db.prepare(`DELETE FROM ${table} WHERE ${m.where.sql}`).bind(...m.where.values))
  else throw new Error('Unsupported company lifecycle effect')
  statements.push(db.prepare("SELECT CASE WHEN changes()=? THEN 1 ELSE json_extract('Company lifecycle changed','$') END").bind(m.expectedRows))
 }
 await db.batch([...statements,...extra])
}
export async function bounded(request:Request,max=65536){
 const reader=request.body?.getReader();if(!reader)return '';let size=0;const chunks:Uint8Array[]=[]
 for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>max){await reader.cancel();fail('Request exceeds byte limit '+max,413)}chunks.push(next.value)}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}return new TextDecoder('utf-8',{fatal:true}).decode(bytes)
}
