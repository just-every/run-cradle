import {z} from 'zod'
import type {SqlMutation} from '../admission/ports'
import {prepareOperatorRemoval} from '../authority/operator-removal.server'
import {prepareLifecycleRemoval} from '../lifecycle/removal.server'
import type {PlatformBindings} from '../../core/platform/bindings'
import {trustedPredicate} from '../admission/sql.server'
import {atomic,audit,fail} from './shared.server'
import {userSchema,patchSchema} from './scim-schema'
type Row={id:string;email:string;display_name:string;status:string;version:number;created_at:number;external_id:string|null;given_name:string|null;family_name:string|null;updated_at:number|null;principal_id:string;principal_version:number;state:string}
const selection=`SELECT o.*,u.external_id,u.given_name,u.family_name,u.updated_at,p.principal_id,a.version AS principal_version,a.state FROM oa_operators o JOIN cradle_base_operators p ON p.base_id=o.id JOIN authority_principals a ON a.id=p.principal_id LEFT JOIN company_scim_users u ON u.operator_id=o.id`
export const resource=(row:Row,origin:string)=>({schemas:[userSchema],id:row.id,userName:row.email,displayName:row.display_name,active:row.status==='active',name:{givenName:row.given_name??'',familyName:row.family_name??''},...(row.external_id?{externalId:row.external_id}:{}),meta:{resourceType:'User',created:new Date(row.created_at).toISOString(),lastModified:new Date(row.updated_at??row.created_at).toISOString(),location:origin+'/scim/v2/Users/'+encodeURIComponent(row.id)}})
export const readUser=(db:D1Database,id:string)=>db.prepare(selection+" WHERE o.id=? AND a.state<>'erased' AND coalesce(u.deleted,0)=0").bind(id).first<Row>()
const inputSchema=z.object({schemas:z.array(z.string()).optional(),userName:z.email().max(254).transform(s=>s.toLowerCase()),displayName:z.string().trim().min(1).max(200).optional(),active:z.boolean().default(true),name:z.object({givenName:z.string().max(200).optional(),familyName:z.string().max(200).optional()}).optional(),externalId:z.string().min(1).max(255).optional(),id:z.string().optional(),meta:z.unknown().optional()}).strict()
export async function listUsers(db:D1Database,url:URL){
 const filter=url.searchParams.get('filter'),match=filter?.match(/^userName\s+eq\s+("(?:[^"\\]|\\.)*")$/i)
 if(filter&&!match)fail('Only userName eq "email" is supported',400)
 const integer=(key:string,defaultValue:number,min:number,max:number)=>{const raw=url.searchParams.get(key);if(raw===null)return defaultValue;if(!/^\d+$/.test(raw))fail('Invalid '+key);const n=Number(raw);if(n<min||n>max)fail(key+' is out of range');return n}
 const start=integer('startIndex',1,1,Number.MAX_SAFE_INTEGER),count=integer('count',100,0,200),where=" WHERE a.state<>'erased' AND coalesce(u.deleted,0)=0"+(match?' AND o.email=?':''),args=match?[String(JSON.parse(match[1]!)).toLowerCase()]:[]
 const total=await db.prepare('SELECT count(*) n FROM oa_operators o JOIN cradle_base_operators p ON p.base_id=o.id JOIN authority_principals a ON a.id=p.principal_id LEFT JOIN company_scim_users u ON u.operator_id=o.id'+where).bind(...args).first<{n:number}>()
 const rows=await db.prepare(selection+where+' ORDER BY o.id LIMIT ? OFFSET ?').bind(...args,count,start-1).all<Row>()
 return {totalResults:total!.n,startIndex:start,itemsPerPage:rows.results.length,Resources:rows.results.map(r=>resource(r,url.origin))}
}
export function patched(current:ReturnType<typeof resource>,body:unknown){
 const patch=z.object({schemas:z.array(z.string()),Operations:z.array(z.object({op:z.string(),path:z.string().optional(),value:z.unknown().optional()}).strict()).min(1).max(20)}).strict().parse(body)
 if(!patch.schemas.includes(patchSchema))fail('SCIM PatchOp schema is required')
 const result:Record<string,unknown>={...current,name:{...current.name}}
 for(const operation of patch.Operations){
  const op=operation.op.toLowerCase();if(!['add','replace','remove'].includes(op))fail('Unsupported patch operation')
  const values=operation.path?{[operation.path]:operation.value}:operation.value
  if(!values||typeof values!=='object'||Array.isArray(values))fail('Patch value must be an object')
  for(const [path,value]of Object.entries(values as Record<string,unknown>)){
   if(!['active','name','name.givenName','name.familyName','displayName','externalId'].includes(path)||op==='remove'&&['active','displayName'].includes(path))fail('Unsupported patch path: '+path)
   if(path.startsWith('name.'))(result.name as Record<string,unknown>)[path.slice(5)]=op==='remove'?'':value
   else result[path]=op==='remove'?path==='name'?{}:undefined:value
  }
 }
 return result
}
export async function saveUser(env:PlatformBindings,actor:string,guard:ReturnType<typeof trustedPredicate>,body:unknown,id?:string,action=id?'scim.replace':'scim.create'){
 const db=env.DB,input=inputSchema.parse(body),current=id?await readUser(db,id):await db.prepare(selection+' WHERE o.email=?').bind(input.userName).first<Row>()
 if(id&&!current)fail('User not found',404)
 if(!id&&current&&current.status!=='inactive')fail('userName already exists',409)
 if(current?.state==='erased')fail('Erased operators cannot be provisioned',409)
 const duplicate=await db.prepare('SELECT id FROM oa_operators WHERE email=? AND id<>?').bind(input.userName,current?.id??'').first();if(duplicate)fail('userName already exists',409)
 const now=Date.now(),operatorId=current?.id??crypto.randomUUID(),guards=[guard],mutations:SqlMutation[]=[]
 if(current){guards.push(trustedPredicate('EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=?)',[current.id,current.version]));if(!input.active&&current.status!=='inactive'){
  const removal=await prepareOperatorRemoval(db,{prepareRemoval:prepareLifecycleRemoval(db)},{now:new Date(now).toISOString()},current.principal_id,current.principal_version)
  guards.push(...removal.guards);mutations.push(...removal.mutations)
 }}
 const name=input.displayName??([input.name?.givenName,input.name?.familyName].filter(Boolean).join(' ')||input.userName)
 const statements:D1PreparedStatement[]=[]
 if(!current)statements.push(db.prepare("INSERT INTO oa_operators(id,email,display_name,role,status,version,created_at) VALUES(?,?,?,'member',?,1,?)").bind(operatorId,input.userName,name,input.active?'active':'inactive',now))
 else statements.push(db.prepare('UPDATE oa_operators SET email=?,display_name=?,status=?,version=version+1 WHERE id=?').bind(input.userName,name,input.active?'active':'inactive',operatorId))
 statements.push(db.prepare(`INSERT INTO company_scim_users(operator_id,external_id,given_name,family_name,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(operator_id) DO UPDATE SET external_id=excluded.external_id,given_name=excluded.given_name,family_name=excluded.family_name,updated_at=excluded.updated_at,deleted=0`).bind(operatorId,input.externalId??null,input.name?.givenName??'',input.name?.familyName??'',now),audit(db,actor,operatorId,action,now))
 if(action==='scim.delete')statements.push(db.prepare('UPDATE company_scim_users SET deleted=1 WHERE operator_id=?').bind(operatorId))
 if(!current&&!input.active)statements.push(db.prepare('UPDATE oa_operators SET status=status WHERE id=?').bind(operatorId))
 await atomic(db,guards,mutations,statements)
 return (await db.prepare(selection+' WHERE o.id=?').bind(operatorId).first<Row>())!
}
export async function deleteUser(env:PlatformBindings,actor:string,guard:ReturnType<typeof trustedPredicate>,id:string){
 const current=await readUser(env.DB,id);if(!current)fail('User not found',404)
 const body={...resource(current,env.APP_ORIGIN!),active:false};await saveUser(env,actor,guard,body,id,'scim.delete')
}
