import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {newField} from '../../src/ui/records/schema/templates.ts'
import {createFixtureAuth} from './base-fixture-auth.mjs'

export async function browserCall(page,path,input,status=200){
 const result=await page.evaluate(async({path,input})=>{
  const headers={'content-type':'application/json'}
  if(input!==undefined)headers['x-csrf-token']=(await(await fetch('/auth/csrf')).json()).csrfToken
  const response=await fetch(path,{method:input===undefined?'GET':'POST',headers,...(input===undefined?{}:{body:JSON.stringify(input)})})
  return {status:response.status,body:await response.json()}
 },{path,input})
 assert.equal(result.status,status,JSON.stringify(result.body))
 return status===200?result.body.data:result.body.error
}
export const liveCommand=(input,expected=[])=>({commandId:createUlid(),expected,input})

export async function liveFixture(page,h,width){
 const appId=createUlid(),entityId=createUlid(),title=newField('Order'),notes=newField('Notes'),stage=newField('Stage','select'),due=newField('Due','date')
 stage.options=[{id:createUlid(),label:'Ready'},{id:createUlid(),label:'Shipped'}]
 const draft={appId,name:`Warehouse dispatch ${width}`,tables:[{id:entityId,label:'Orders',fields:[title,notes,stage,due]}]}
 const preview=await browserCall(page,'/api/v1/records/schema-preview',draft)
 await browserCall(page,'/api/v1/commands/release.adopt',liveCommand({kind:'manual_schema',previewId:preview.id}))
 const schema=await browserCall(page,`/api/v1/apps/${appId}/entities/${entityId}`)
 const create=values=>browserCall(page,'/api/v1/commands/record.create',liveCommand({appId,entityId,values},[{ref:{appId,entityId:'00000000000000000000000001',recordId:entityId},version:schema.version}]))
 const row=(await create({[title.id]:'PO-1042',[notes.id]:'Awaiting carrier',[stage.id]:stage.options[0].id,[due.id]:'2026-11-02'})).value
 const views=[]
 for(const display of ['grid','cards','board','calendar','timeline','agenda']){
  const view={appId,entityId,name:`Dispatch ${display}`,display,fields:schema.fields.map(f=>f.id),filter:{kind:'all',conditions:[]},sort:[{fieldId:title.id,direction:'asc'}],groupBy:[],layout:{titleFieldId:title.id,...(display==='board'?{boardFieldId:stage.id}:{}),...(['calendar','timeline','agenda'].includes(display)?{startFieldId:due.id}:{}),...(display==='timeline'?{endFieldId:due.id}:{})},visibility:'app',shipped:false}
  views.push((await browserCall(page,'/api/v1/commands/view.save',liveCommand({view}))).value)
 }
 const peer=createUlid(),time=Date.now(),name='Avery Lane'
 await h.db.prepare('INSERT INTO operators(id,name,email,active,created_at,updated_at,version) VALUES(?,?,?,1,?,?,1)').bind(peer,name,`avery-${width}@example.test`,time,time).run()
 await h.db.prepare("INSERT INTO authority_principals(id,kind,human_id,state,created_at,updated_at) VALUES(?,'human',?,'active',?,?)").bind(peer,peer,time,time).run()
 const original=await h.db.prepare('SELECT rules_json FROM authority_policies WHERE app_id=?').bind(appId).first(),policyId=createUlid()
 const rules=JSON.parse(original.rules_json).map(rule=>({...rule,id:createUlid(),principals:[{id:peer,kind:'human'}]}))
 await h.db.prepare('INSERT INTO authority_policies(id,app_id,name,rules_json,version,created_at,updated_at) VALUES(?,?,?,?,1,?,?)').bind(policyId,appId,'Dispatch editors',JSON.stringify(rules),time,time).run()
 await h.db.prepare("INSERT INTO authority_memberships(principal_id,app_id,policy_id,state,version) VALUES(?,?,?,'active',1)").bind(peer,appId,policyId).run()
 const auth=await createFixtureAuth(h.db,{appOrigin:h.origin,sessionSecret:'test-only-records-session-secret-at-least-32-characters',mode:'development'},peer)
 const session=await auth.signIn(peer)
 return {appId,entityId,title,notes,stage,due,row,views,peer,peerName:name,peerCookie:session.cookie,policyId,path:`${h.origin}/app/records/${appId}/${entityId}`}
}
