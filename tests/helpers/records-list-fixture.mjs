import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {newField} from '../../src/ui/records/schema/templates.ts'

export async function listFixture(call){
 const appId=createUlid(),ids=Array.from({length:5},()=>createUlid())
 const tables=ids.map((id,index)=>{
  const title=newField(index===0?'Project':'Title'),note=newField('Notes'),rank=newField('Priority','number'),fields=[title,note,rank]
  let parent,self
  if(index){parent=newField('Parent','relation');parent.relation={ownerAppId:appId,entityId:ids[index-1],cardinality:'one',onDelete:'restrict'};fields.push(parent)}
  if(index===1){self=newField('Parent task','relation');self.relation={ownerAppId:appId,entityId:id,cardinality:'one',onDelete:'restrict'};fields.push(self)}
  return {id,label:['Projects','Tasks','Subtasks','Steps','Checks'][index],primaryFieldId:title.id,fields,title,note,rank,parent,self}
 })
 const preview=await call('/api/v1/records/schema-preview',{appId,name:'Delivery outline',tables:tables.map(({title,note,rank,parent,self,...table})=>table)})
 await call('/api/v1/commands/release.adopt',{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}})
 for(const table of tables)table.schema=await call(`/api/v1/apps/${appId}/entities/${table.id}`)
 async function create(index,name,parent,priority='1',extra={}){
  const t=tables[index],value={appId,entityId:t.id,values:{[t.title.id]:name,[t.note.id]:'Schedule ready',[t.rank.id]:priority,...(parent?{[t.parent.id]:parent.ref}:{}),...extra}}
  return (await call('/api/v1/commands/record.create',{commandId:createUlid(),expected:[{ref:{appId,entityId:'00000000000000000000000001',recordId:t.id},version:t.schema.version}],input:value})).value
 }
 const project=await create(0,'Harbour renewal'),other=await create(0,'Station upgrade')
 const taskB=await create(1,'Beta task',project,'2'),taskA=await create(1,'Alpha task',project),hidden=await create(1,'Confidential task',project),filtered=await create(1,'Deferred task',project,'0')
 const sub=await create(2,'Site survey',taskA),step=await create(3,'Inspect foundations',sub),check=await create(4,'Confirm dimensions',step)
 const levels=tables.map((t,index)=>({entityId:t.id,...(index?{parentFieldId:t.parent.id}:{}),fields:[t.title.id,t.note.id],sort:[{fieldId:t.title.id,direction:'asc'}],...(index===1?{filter:{kind:'condition',fieldId:t.rank.id,op:'ne',value:'0'}}:{})}))
 async function save(name,entityId,listLevels){const t=tables.find(t=>t.id===entityId);return (await call('/api/v1/commands/view.save',{commandId:createUlid(),expected:[{ref:{appId,entityId:'00000000000000000000000001',recordId:entityId},version:t.schema.version}],input:{view:{appId,entityId,name,display:'list',fields:listLevels[0].fields,listLevels,filter:{kind:'all',conditions:[]},sort:[],groupBy:[],layout:{titleFieldId:t.title.id},visibility:'app',shipped:false}}})).value}
 const view=await save('Delivery plan',ids[0],levels)
 const hierarchy=Array.from({length:5},()=>({entityId:ids[1],parentFieldId:tables[1].self.id,fields:[tables[1].title.id,tables[1].note.id],sort:[{fieldId:tables[1].title.id,direction:'asc'}]}))
 const selfView=await save('Task hierarchy',ids[1],hierarchy)
 return {appId,tables,project,other,taskA,taskB,hidden,filtered,sub,step,check,view,selfView,create,save}
}
export async function listPolicy(h,f,{readOnly=false,hideField=false}={}){
 const policy=await h.db.prepare('SELECT id,rules_json FROM authority_policies WHERE app_id=?').bind(f.appId).first(),rules=JSON.parse(policy.rules_json),t=f.tables[1],rule=rules.find(rule=>rule.entityId===t.id)
 rule.rows={kind:'condition',fieldId:t.title.id,op:'ne',value:'Confidential task'}
 if(hideField)rule.readableFields=rule.readableFields.filter(id=>id!==t.note.id)
 if(readOnly){rule.writableFields=[];rule.actions=rule.actions.filter(action=>!['record.patch','record.create'].includes(action))}
 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),policy.id).run()
 return {policyId:policy.id,rules}
}
export function listHttp(h){return async(path,input,status=200)=>{
 const headers={cookie:h.cookie,origin:h.origin,'content-type':'application/json'}
 if(input!==undefined){const csrf=await(await fetch(h.origin+'/auth/csrf',{headers:{cookie:h.cookie}})).json();headers['x-csrf-token']=csrf.csrfToken}
 const response=await fetch(h.origin+path,{method:input===undefined?'GET':'POST',headers,...(input===undefined?{}:{body:JSON.stringify(input)})}),body=await response.json()
 assert.equal(response.status,status,JSON.stringify(body));return status===200?body.data:body.error
}}
