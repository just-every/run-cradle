import type {PlatformBindings} from '../../core/platform/bindings'
import {trustedPredicate} from '../admission/sql.server'
import {digest,fail,headers,bounded} from './shared.server'
import {listSchema,errorSchema,providerConfig,resourceType,schema} from './scim-schema'
import {listUsers,readUser,resource,saveUser,patched,deleteUser} from './scim-users.server'
export async function scimResponse(request:Request,env:PlatformBindings):Promise<Response>{
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{...headers,'content-type':'application/scim+json'}})
 try{
 const authorization=request.headers.get('authorization');if(!authorization?.startsWith('Bearer ')||authorization.length>256)fail('Bearer credential required',401)
 const hash=await digest('cradle-scim:'+authorization.slice(7)),credential=await env.DB.prepare(`SELECT c.id FROM company_scim_credentials c JOIN oa_operators o ON o.id=c.owner_id WHERE c.token_hash=? AND c.revoked_at IS NULL AND o.status='active' AND o.role='owner' AND o.version=c.owner_version`).bind(hash).first<{id:string}>()
 if(!credential)fail('Bearer credential is invalid or revoked',401)
 const guard=trustedPredicate(`EXISTS(SELECT 1 FROM company_scim_credentials c JOIN oa_operators o ON o.id=c.owner_id WHERE c.id=? AND c.token_hash=? AND c.revoked_at IS NULL AND o.status='active' AND o.role='owner' AND o.version=c.owner_version)`,[credential.id,hash]),actor='scim:'+credential.id
 const url=new URL(request.url),path=url.pathname.slice('/scim/v2'.length),method=request.method
 if(method==='GET'){
  if(path==='/ServiceProviderConfig')return reply(providerConfig)
  if(path==='/ResourceTypes')return reply({schemas:[listSchema],totalResults:1,startIndex:1,itemsPerPage:1,Resources:[resourceType]})
  if(path==='/ResourceTypes/User')return reply(resourceType)
  if(path==='/Schemas')return reply({schemas:[listSchema],totalResults:1,startIndex:1,itemsPerPage:1,Resources:[schema]})
  if(path==='/Schemas/'+schema.id)return reply(schema)
  if(path==='/Users')return reply({schemas:[listSchema],...await listUsers(env.DB,url)})
 }
 if(path==='/Users'&&method==='POST'){const row=await saveUser(env,actor,guard,JSON.parse(await bounded(request)));return reply(resource(row,url.origin),201)}
 const match=path.match(/^\/Users\/([^/]+)$/)
 if(match){const id=decodeURIComponent(match[1]!),current=await readUser(env.DB,id);if(!current)fail('User not found',404)
  if(method==='GET')return reply(resource(current,url.origin))
  if(method==='DELETE'){await deleteUser(env,actor,guard,id);return new Response(null,{status:204,headers})}
  if(method==='PUT'||method==='PATCH'){const body=JSON.parse(await bounded(request));return reply(resource(await saveUser(env,actor,guard,method==='PATCH'?patched(resource(current,url.origin),body):body,id,method==='PATCH'?'scim.patch':'scim.replace'),url.origin))}
 }
 return reply({schemas:[errorSchema],status:'404',detail:'Unknown SCIM resource'},404)
 }catch(error){
  const e=error as {status?:number;message?:string;code?:string;name?:string};const status=e.status??(e.name==='ZodError'||error instanceof SyntaxError?400:500)
  return reply({schemas:[errorSchema],status:String(status),detail:status===500?'SCIM transaction failed; no partial change was committed':e.message??e.code,...(status===409?{scimType:'uniqueness'}:{})},status)
 }
}
