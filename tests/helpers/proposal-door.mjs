import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'

/** The two faces of the proposal door, used the way an external agent would use them. */
export function proposalDoor(origin,secret,face) {
 async function http(route,{method='GET',body,status=200}={}) {
  const response=await fetch(origin+route,{method,redirect:'manual',headers:{authorization:`Bearer ${secret}`,...(body?{'content-type':'application/json'}:{}),...(route==='/mcp'?{'MCP-Protocol-Version':'2025-11-25'}:{})},...(body?{body:JSON.stringify(body)}:{})})
  const value=await response.json().catch(()=>null)
  assert.equal(response.status,status,`${face} ${method} ${route}: ${value?.error?.code??'unexpected response'}`)
  return value
 }
 let sequence=0
 async function mcp(method,params,status=200) {
  const response=await fetch(origin+'/mcp',{method:'POST',headers:{authorization:`Bearer ${secret}`,'content-type':'application/json','MCP-Protocol-Version':'2025-11-25'},body:JSON.stringify({jsonrpc:'2.0',id:++sequence,method,params})})
  const value=await response.json(),refusal=value.result?._meta?.['com.runeditrun/error']??value.error?.data
  const code=refusal?.code??(value.error?.message==='Unknown tool'?'not_found':undefined)
  if(status===200){assert.equal(response.status,200);assert.equal(value.error,undefined,`${method}: ${code??value.error?.message}`);assert.ok(!value.result?.isError,`${method}: ${code}`)}
  else {
   const expected={not_found:404,resource_unavailable:403,forbidden:403,grant_revoked:403,unauthenticated:401,signed_out:401,validation:400,invalid_arguments:400,invalid_transition:409,insufficient_scope:403}
   assert.equal(response.status===200?expected[code]:response.status,status,`${method}: ${code??value.error?.message}`)
   assert.ok(value.error||value.result?.isError,'A refused call cannot return a successful result')
   return {error:{code,message:refusal?.message??code??value.error?.message}}
  }
  return value
 }
 async function tool(name,args,status=200) {
  const value=await mcp('tools/call',{name,arguments:args},status)
  return status===200?value.result.structuredContent:value
 }
 const command=(input,commandId=createUlid())=>({commandId,expected:[],input})
 return face==='rest'?{
  face,http,
  schema:(status)=>http('/api/v1/proposals/schema',{status}).then(v=>v?.data??v),
  propose:(input,status,commandId)=>http('/api/v1/commands/schema.propose',{method:'POST',body:command(input,commandId),status}).then(v=>status&&status!==200?v:v.data.value),
  list:()=>http('/api/v1/proposals').then(v=>v.data.items),
  read:(id,status)=>http(`/api/v1/proposals/${id}`,{status}).then(v=>v?.data??v),
  withdraw:(id,status)=>http('/api/v1/commands/schema.withdraw',{method:'POST',body:command({proposalId:id}),status}).then(v=>status&&status!==200?v:v.data.value),
  adopt:(id,status)=>http('/api/v1/commands/release.adopt',{method:'POST',body:command({kind:'agent_proposal',proposalId:id}),status}),
 }:{
  face,http,mcp,
  schema:(status)=>tool('cradle.schema.read',{},status),
  propose:(input,status,commandId)=>tool('cradle.schema.propose',{...input,idempotency_key:commandId??createUlid()},status),
  list:()=>tool('cradle.schema.proposals',{}).then(v=>v.items),
  read:(id,status)=>tool('cradle.schema.proposal',{proposalId:id},status),
  withdraw:(id,status)=>tool('cradle.schema.withdraw',{proposalId:id,idempotency_key:createUlid()},status),
  adopt:(id,status)=>tool('cradle.schema.adopt',{proposalId:id,idempotency_key:createUlid()},status),
 }
}

/** Two linked tables with a lookup, a board and a form: the smallest proposal that exercises every part. */
export function smallProposal(appId,note='') {
 const [items,name,kind,kindA,kindB,loans,item,label,itemName]=Array.from({length:9},()=>createUlid())
 const relation={ownerAppId:appId,entityId:items,cardinality:'one',onDelete:'restrict'}
 return {ids:{items,name,kind,loans,item,label,itemName},input:{note,schema:{appId,name:'Proposal acceptance',tables:[
  {id:items,label:'Items',primaryFieldId:name,fields:[{id:name,label:'Name',type:'text',required:true,unique:false},{id:kind,label:'Kind',type:'select',required:false,unique:false,options:[{id:kindA,label:'Hand'},{id:kindB,label:'Power'}]}]},
  {id:loans,label:'Loans',primaryFieldId:label,fields:[{id:label,label:'Label',type:'text',required:true,unique:false},{id:item,label:'Item',type:'relation',required:false,unique:false,relation},{id:itemName,label:'Item name',type:'computed',required:false,unique:false,readOnly:true,resultType:'text',expression:{kind:'rollup',relationFieldId:item,valueFieldId:name,aggregate:'lookup'}}]},
 ]},views:[{entityId:items,name:'Items by kind',display:'board',fields:[name,kind],sort:[],groupBy:[],layout:{titleFieldId:name,boardFieldId:kind}}],
 forms:[{entityId:loans,title:'Lend an item',fields:[{fieldId:label,label:'Label',help:'',required:true},{fieldId:item,label:'Item',help:'',required:false}]}]}}
}

/** Effect rows that no proposal may create, counted before and after. */
export async function effectCounts(db) {
 const tables=['authority_grants','authority_memberships','authority_principals','authority_policies','authority_credentials','automations','record_automation_bindings','admission_outbox','admission_events','channel_deliveries','notifications','provider_connections','integration_deliveries','rer_mail_development_outbox']
 const out={}
 for(const table of tables)out[table]=(await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n
 return out
}

/** The owner explicitly answers the new door's policy before admitting their local key. */
export async function authorizeProposalDoor(h) {
 const response=await fetch(h.origin+'/agents/api/policy',{method:'PUT',headers:{cookie:h.cookie,origin:h.origin,'content-type':'application/json'},body:JSON.stringify({document:{schema:'rer-agent-policy/1',catalogue:'rer-agent-classes/1',rules:[{id:'native-owner-policy',class:'*',do:'autonomous'}],spend:{none:true}}})})
 assert.equal(response.status,200,'Native owner configures local company-agent policy')
}
