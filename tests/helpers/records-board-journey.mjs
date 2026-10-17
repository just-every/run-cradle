import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {newField} from '../../src/ui/records/schema/templates.ts'
import {createCommandHttp} from '../../src/core/registry/http.ts'
import {createRecordHttp} from '../../src/domains/records/routes.server.ts'
import {manualSchemaHttp} from '../../src/domains/records/manual/http.server.ts'

const schemaEntity='00000000000000000000000001'
const expected=rows=>rows.map(row=>({ref:row.ref,version:row.version}))
const command=(input,revisions=[])=>({commandId:createUlid(),expected:revisions,input})

function boardDraft(){
 const title=newField('Title'),stage=newField('Stage','select'),detail=newField('Detail')
 stage.options=[{id:createUlid(),label:'Open'},{id:createUlid(),label:'Done'}]
 const appId=createUlid(),entityId=createUlid()
 return {appId,entityId,title,stage,detail,draft:{appId,name:'Board editing',tables:[{id:entityId,label:'Cards',primaryFieldId:title.id,fields:[title,stage,detail]}]}}
}
async function seedBoard(call){
 const f=boardDraft(),prepared=await call('/api/v1/records/schema-preview',f.draft)
 await call('/api/v1/commands/release.adopt',command({kind:'manual_schema',previewId:prepared.id}))
 const schema=await call(`/api/v1/apps/${f.appId}/entities/${f.entityId}`)
 const row=(await call('/api/v1/commands/record.create',command({appId:f.appId,entityId:f.entityId,values:{[f.title.id]:'Board card',[f.stage.id]:f.stage.options[0].id,[f.detail.id]:'Before move'}},[{ref:{appId:f.appId,entityId:schemaEntity,recordId:f.entityId},version:schema.version}]))).value
 const view=(await call('/api/v1/commands/view.save',command({view:{appId:f.appId,entityId:f.entityId,name:'Open cards',display:'board',fields:[f.title.id,f.detail.id],filter:{kind:'condition',fieldId:f.stage.id,op:'eq',value:f.stage.options[0].id},sort:[],groupBy:[],layout:{titleFieldId:f.title.id,boardFieldId:f.stage.id},visibility:'private',shipped:false}},[{ref:{appId:f.appId,entityId:schemaEntity,recordId:f.entityId},version:schema.version}]))).value
 return {...f,schema,row,view}
}
async function readRows(call,f){return (await call(`/api/v1/apps/${f.appId}/entities/${f.entityId}/query`,{})).items}
const range=(f,row,value)=>({appId:f.appId,entityId:f.entityId,rows:[{recordId:row.id,changes:{[f.stage.id]:value}}]})

/** VIEW-009/015: invoke inside the existing roundtrip registration; no extra test registration. */
export async function boardJourney(h){
 let r=await h.runtime()
 const auth=async()=>h.ctx,origin='https://boards.example.test'
 async function call(path,input,status=200){
  const http=path.includes('/records/schema-preview')||path.endsWith('/release.adopt')?manualSchemaHttp(r.manual,{},auth):path.includes('/commands/')?createCommandHttp({...r,authenticate:auth}):createRecordHttp({...r.services,authenticate:auth})
  const response=await http.fetch(new Request(origin+path,{method:input===undefined?'GET':'POST',headers:{origin,'content-type':'application/json'},...(input===undefined?{}:{body:JSON.stringify(input)})})),body=await response.json()
  assert.equal(response.status,status,JSON.stringify(body))
  if(path.endsWith('/release.adopt')&&status===200)r=await h.runtime()
  return status===200?body.data:body.error
 }
 const f=await seedBoard(call),viewQuery=()=>call(`/api/v1/views/${f.view.id}/query`,{})
 const before=await viewQuery();assert.deepEqual(before.view.fields,[f.title.id,f.detail.id]);assert.equal(before.records.items[0].fields[f.stage.id].value,f.stage.options[0].id)
 const moved=(await call('/api/v1/commands/record.patch',command(range(f,f.row,f.stage.options[1].id),expected([f.row])))).value
 assert.deepEqual(moved.inverse,[{recordId:f.row.id,changes:{[f.stage.id]:f.stage.options[0].id}}]);assert.equal((await viewQuery()).records.items.length,0)
 const undo=(await call('/api/v1/commands/record.patch',command({appId:f.appId,entityId:f.entityId,rows:moved.inverse},expected(moved.rows)))).value
 assert.equal((await viewQuery()).records.items[0].fields[f.stage.id].value,f.stage.options[0].id)
 const redo=(await call('/api/v1/commands/record.patch',command({appId:f.appId,entityId:f.entityId,rows:undo.inverse},expected(undo.rows)))).value
 assert.equal((await readRows(call,f))[0].fields[f.stage.id].value,f.stage.options[1].id)
 const concurrent=(await call('/api/v1/commands/record.patch',command(range(f,redo.rows[0],null),expected(redo.rows)))).value
 const refused=await call('/api/v1/commands/record.patch',command({appId:f.appId,entityId:f.entityId,rows:redo.inverse},expected(redo.rows)),409)
 assert.match(refused.issues.find(issue=>issue.fieldId===f.stage.id).message,/Stage:.*current value is null/)
 assert.equal((await readRows(call,f))[0].fields[f.stage.id].value,null)
 // Revocation is a fixture change; both the attempted undo and the read are through public HTTP.
 await denyBoardWrites(h.db,f)
 await call('/api/v1/commands/record.patch',command({appId:f.appId,entityId:f.entityId,rows:concurrent.inverse},expected(concurrent.rows)),403)
 const readonly=(await readRows(call,f))[0]
 assert.equal(readonly.fields[f.stage.id].value,null);assert.equal(readonly.allowedActions.find(action=>action.action==='record.patch').enabled,false)
}

async function denyBoardWrites(db,f){
 const policy=await db.prepare('SELECT id,rules_json FROM authority_policies WHERE app_id=?').bind(f.appId).first(),rules=JSON.parse(policy.rules_json)
 for(const rule of rules)if(rule.entityId===f.entityId){rule.writableFields=[];rule.actions=rule.actions.filter(action=>action!=='record.patch')}
 await db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),policy.id).run()
}

/** Run against the parent's real 1440/390 browser runtime; this helper never launches a browser. */
export async function boardBrowserJourney(page,j,h,width){
 async function call(path,input,status=200){
  const response=await page.evaluate(async({path,input})=>{
   const headers={'content-type':'application/json'}
   if(input!==undefined){const csrf=await fetch('/auth/csrf');headers['x-csrf-token']=(await csrf.json()).csrfToken}
   const response=await fetch(path,{method:input===undefined?'GET':'POST',headers,...(input===undefined?{}:{body:JSON.stringify(input)})})
   return {status:response.status,body:await response.json()}
  },{path,input})
  assert.equal(response.status,status,JSON.stringify(response.body))
  return status===200?response.body.data:response.body.error
 }
 const f=await seedBoard(call),path=`${h.origin}/app/records/${f.appId}/${f.entityId}`,modifier=width===1440?'Meta':'Control'
 const patchResponse=()=>page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/commands/record.patch'))
 async function action(change,status=200){const pending=patchResponse();await change();const response=await pending;assert.equal(response.status(),status,await response.text())}
 const board=()=>page.getByRole('region',{name:/board; scroll for columns$/}),card=()=>board().getByRole('article',{name:'Board card',exact:true})
 const inColumn=async id=>{await board().locator(`[data-board-column="${id}"]`).getByRole('article',{name:'Board card',exact:true}).waitFor()}
 const row=async()=> (await readRows(call,f))[0]
 const toolbar=()=>page.getByRole('group',{name:'Board editing',exact:true})
 await page.goto(path)
 // An ordinary grid edit can be undone and redone from the board's shared table stack.
 const detail=page.locator(`[data-record-id="${f.row.id}"][data-field-id="${f.detail.id}"]`)
 await detail.dblclick();await page.getByLabel('Edit Detail',{exact:true}).fill('Edited in grid')
 await action(()=>page.getByRole('button',{name:'Save cell',exact:true}).click())
 await j.action(page.getByRole('navigation',{name:'Record display',exact:true}).getByRole('button',{name:'Board',exact:true}))
 await inColumn(f.stage.options[0].id)
 await action(()=>toolbar().getByRole('button',{name:'Undo',exact:true}).click());assert.equal((await row()).fields[f.detail.id].value,'Before move')
 await inColumn(f.stage.options[0].id)
 await action(()=>toolbar().getByRole('button',{name:'Redo',exact:true}).click());assert.equal((await row()).fields[f.detail.id].value,'Edited in grid')
 await inColumn(f.stage.options[0].id)
 await j.capture('board-before-move')
 if(width===1440){
  await action(()=>card().getByRole('heading',{name:'Board card',exact:true}).dragTo(board().locator(`[data-board-column="${f.stage.options[1].id}"]`)))
 }else{
  await card().getByRole('combobox',{name:'Move to Board card',exact:true}).selectOption(f.stage.options[1].id)
  await action(()=>j.action(card().getByRole('button',{name:'Move Board card',exact:true})))
 }
 await inColumn(f.stage.options[1].id);assert.equal((await row()).fields[f.stage.id].value,f.stage.options[1].id)
 await board().focus();await action(()=>page.keyboard.press(`${modifier}+z`));await inColumn(f.stage.options[0].id)
 await board().focus();await action(()=>page.keyboard.press(`${modifier}+Shift+z`));await inColumn(f.stage.options[1].id)
 // Undo a board action from the grid toolbar, without leaving this table session.
 await j.action(page.getByRole('navigation',{name:'Record display',exact:true}).getByRole('button',{name:'Grid',exact:true}))
 await action(()=>page.locator('.cr-grid-actions').getByRole('button',{name:'Undo',exact:true}).click())
 assert.equal((await row()).fields[f.stage.id].value,f.stage.options[0].id)
 await j.action(page.getByRole('navigation',{name:'Saved views',exact:true}).getByRole('button',{name:f.view.name,exact:true}))
 await inColumn(f.stage.options[0].id)
 assert.equal(await card().getByText('Stage',{exact:true}).count(),0,'A hidden grouping field stays hidden on the card')
 await card().getByRole('combobox',{name:'Move to Board card',exact:true}).selectOption(f.stage.options[1].id)
 await action(()=>j.action(card().getByRole('button',{name:'Move Board card',exact:true})))
 await page.getByRole('heading',{name:'No matching records',exact:true}).waitFor()
 await action(()=>toolbar().getByRole('button',{name:'Undo',exact:true}).click());await inColumn(f.stage.options[0].id)
 await j.capture('board-saved-undo')
 // A second writer changes the loaded card. Its stale move must expose the conflict and preserve that write.
 const before=await row();await call('/api/v1/commands/record.patch',command(range(f,before,f.stage.options[1].id),expected([before])))
 await card().getByRole('combobox',{name:'Move to Board card',exact:true}).selectOption('__unset')
 await action(()=>j.action(card().getByRole('button',{name:'Move Board card',exact:true})),409)
 await page.getByRole('alert').filter({hasText:/Stage:.*record changed/}).waitFor()
 assert.equal((await row()).fields[f.stage.id].value,f.stage.options[1].id)
 await j.capture('board-conflict')
 await denyBoardWrites(h.db,f)
 await page.goto(path);await j.action(page.getByRole('navigation',{name:'Record display',exact:true}).getByRole('button',{name:'Board',exact:true}))
 await inColumn(f.stage.options[1].id)
 assert.equal(await card().getAttribute('draggable'),'false');assert.equal(await card().getByRole('combobox').count(),0)
 await j.capture('board-readonly')
 return {appId:f.appId,entityId:f.entityId,recordId:f.row.id,viewId:f.view.id}
}
