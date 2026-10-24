import {auditOperation} from './operation-audit.server'
import {z} from 'zod'
import type {ServerFoundation} from '../../core/app/foundation.server'
import {createUlid} from '../../core/shared/ids'
import {AuthorityError} from '../authority/errors'

const filters=z.object({person:z.string().min(1).max(100).optional(),base:z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/).optional(),from:z.iso.datetime().optional(),to:z.iso.datetime().optional(),cursor:z.coerce.number().int().min(0).max(1000000).default(0),format:z.enum(['csv','json']).optional()}).strict()
/** Metadata only: values, credentials, subject references and source text never leave this door. */
const entries=`WITH entries AS (
 SELECT 'command:'||MIN(a.id)||':base:'||a.app_id id,a.command_id event_id,a.action,p.id person_id,coalesce(o.name,d.label,sp.label,CASE WHEN a.actor_kind='system' AND a.action IN ('record.trash.purge','view.trash.purge','form.trash.purge','schema.trash.purge') THEN CASE a.action WHEN 'record.trash.purge' THEN 'Records Trash' WHEN 'view.trash.purge' THEN 'View Trash' WHEN 'form.trash.purge' THEN 'Form Trash' ELSE 'Schema Trash' END END,CASE WHEN p.kind<>'human' THEN 'Feature · '||p.kind END) person,a.app_id base_id,MIN(a.created_at) created_at
 FROM admission_audit a LEFT JOIN authority_principals p ON p.id=a.actor_id AND p.state<>'erased'
 LEFT JOIN operators o ON o.id=p.human_id
 LEFT JOIN authority_delegations d ON d.principal_id=p.id
 LEFT JOIN authority_schema_proposers sp ON sp.principal_id=p.id
 GROUP BY a.command_id,a.action,a.app_id
 UNION ALL
 SELECT 'auth:'||a.id,a.id,a.action,p.id,CASE WHEN p.id IS NOT NULL THEN o.display_name ELSE NULL END,NULL,strftime('%Y-%m-%dT%H:%M:%fZ',a.created_at/1000.0,'unixepoch')
 FROM oa_auth_audit a LEFT JOIN oa_operators o ON o.id=a.actor_id AND o.status<>'erased'
 LEFT JOIN cradle_base_operators b ON b.base_id=o.id LEFT JOIN authority_principals p ON p.id=b.principal_id AND p.state<>'erased'
 UNION ALL
 SELECT 'identity:'||a.id,a.id,a.action,p.id,CASE WHEN p.id IS NOT NULL THEN o.display_name ELSE NULL END,NULL,strftime('%Y-%m-%dT%H:%M:%fZ',a.created_at/1000.0,'unixepoch')
 FROM company_identity_audit a LEFT JOIN oa_operators o ON o.id=a.actor_id AND o.status<>'erased'
 LEFT JOIN cradle_base_operators b ON b.base_id=o.id LEFT JOIN authority_principals p ON p.id=b.principal_id AND p.state<>'erased'
 UNION ALL
 SELECT 'operation:'||a.id,a.id,a.action,p.id,CASE WHEN a.actor_id IS NULL THEN a.feature ELSE o.name END,a.app_id,a.created_at
 FROM operation_audit a LEFT JOIN authority_principals p ON p.id=a.actor_id AND p.state<>'erased'
 LEFT JOIN operators o ON o.id=p.human_id
) `
type Entry={id:string;event_id:string;action:string;person_id:string|null;person:string|null;base_id:string|null;created_at:string}
const ownerSql=`SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id
 JOIN cradle_base_operators b ON b.base_id=o.id JOIN authority_principals p ON p.id=b.principal_id
 WHERE s.id=? AND p.id=? AND p.state='active' AND p.authentication_epoch=? AND o.role='owner' AND o.status='active'
 AND s.operator_version=o.version AND s.revoked_at IS NULL AND s.expires_at>unixepoch('subsec')*1000`
const csv=(value:string|null)=>'"'+String(value??'').replaceAll('"','""').replace(/^(?=\s*[=+@-])/,"'")+'"'
export async function adminAuditResponse(request:Request,db:D1Database,foundation:ServerFoundation){
 const ctx=await foundation.authenticate(request,'http',createUlid())
 const owner=async()=>{
  if(ctx.principal.kind!=='human'||!ctx.principal.baseSessionId||!await db.prepare(ownerSql).bind(ctx.principal.baseSessionId,ctx.principal.id,ctx.principal.authenticationEpoch).first())throw new AuthorityError('forbidden','A current installation owner session is required.')
 }
 await owner()
 const parsed=filters.parse(Object.fromEntries(new URL(request.url).searchParams))
 const input={...parsed,from:parsed.from?new Date(parsed.from).toISOString():undefined,to:parsed.to?new Date(parsed.to).toISOString():undefined}
 if(input.from&&input.to&&input.from>input.to)throw new AuthorityError('invalid_input','Start time must precede end time.',400)
 const where:string[]=[],values:(string|number)[]=[]
 for(const [value,column,operator] of [[input.person,'person_id','='],[input.base,'base_id','='],[input.from,'created_at','>='],[input.to,'created_at','<=']] as const){if(value){where.push(`${column}${operator}?`);values.push(value)}}
 const clause=where.length?'WHERE '+where.join(' AND '):'',limit=input.format?10001:201,offset=input.format?0:input.cursor
 const rows=(await db.prepare(entries+`SELECT * FROM entries ${clause} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`).bind(...values,limit,offset).all<Entry>()).results
 if(input.format&&rows.length>10000)throw new AuthorityError('export_too_large','Narrow the time range to export at most 10,000 audit entries.',413)
 const items=rows.slice(0,input.format?10000:200).map(row=>({id:row.id,eventId:row.event_id,action:row.action,personId:row.person?row.person_id:null,person:row.person??'Erased or unavailable person',baseId:row.base_id,createdAt:row.created_at}))
 const people=(await db.prepare("SELECT DISTINCT p.id,o.name FROM authority_principals p JOIN operators o ON o.id=p.human_id WHERE p.kind='human' AND p.state<>'erased' ORDER BY o.name,p.id").all<{id:string;name:string}>()).results
 await owner()
 if(input.format)await auditOperation(db,ctx,'audit.export.'+input.format,input.base??null)
 const headers={'cache-control':'no-store, private','x-content-type-options':'nosniff','referrer-policy':'no-referrer',...(input.format?{'content-disposition':`attachment; filename="admin-audit.${input.format}"`}:{})}
 if(input.format==='csv')return new Response(['id,eventId,action,personId,person,baseId,createdAt',...items.map(row=>Object.values(row).map(csv).join(','))].join('\r\n')+'\r\n',{headers:{...headers,'content-type':'text/csv; charset=utf-8'}})
 return Response.json({data:{items,...(!input.format?{people}:{}),nextCursor:!input.format&&rows.length>200?String(input.cursor+200):null},meta:{requestId:ctx.requestId,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now,consistencyToken:ctx.consistencyToken??''}},{headers})
}
