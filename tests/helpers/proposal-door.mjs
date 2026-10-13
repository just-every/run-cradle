import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'

/** The two faces of the proposal door, used the way an external agent would use them. */
export function proposalDoor(origin,secret,face) {
 async function http(route,{method='GET',body,status=200}={}) {
  const response=await fetch(origin+route,{method,redirect:'manual',headers:{authorization:`Bearer ${secret}`,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})
  const value=await response.json().catch(()=>null)
  assert.equal(response.status,status,`${face} ${method} ${route}: ${value?.error?.code??'unexpected response'}`)
  return value
 }
 let sequence=0
 async function mcp(method,params,status=200) {
  const value=await http('/mcp',{method:'POST',body:{jsonrpc:'2.0',id:++sequence,method,params},status})
  return value
 }
 async function tool(name,args,status=200) {
  const value=await mcp('tools/call',{name,arguments:args},status)
  return status===200?JSON.parse(value.result.content[0].text).result:value
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
  schema:(status)=>tool('schema.read',{},status),
  propose:(input,status,commandId)=>tool('schema.propose',command(input,commandId),status).then(v=>status&&status!==200?v:v.value),
  list:()=>tool('schema.proposals',{}).then(v=>v.items),
  read:(id,status)=>tool('schema.proposal',{proposalId:id},status),
  withdraw:(id,status)=>tool('schema.withdraw',command({proposalId:id}),status).then(v=>status&&status!==200?v:v.value),
  adopt:(id,status)=>tool('release.adopt',command({kind:'agent_proposal',proposalId:id}),status),
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
