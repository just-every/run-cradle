import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
/** Real native sessions and generated base role policies for the personal-store journeys. */
export async function fileStoreActors(h,appId){
 const people={editor:{id:createUlid(),name:'synthetic-cradle-editor-1'},second:{id:createUlid(),name:'synthetic-cradle-editor-2'},reader:{id:createUlid(),name:'synthetic-cradle-reader-1'}}
 async function request(cookie,path,{body,status=200}={}){
  const csrf=(await(await fetch(h.origin+'/auth/csrf',{headers:{cookie}})).json()).csrfToken
  const response=await fetch(h.origin+path,{method:body===undefined?'GET':'POST',redirect:'manual',headers:{cookie,origin:h.origin,'x-csrf-token':csrf,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})
  const value=await response.json().catch(()=>null);assert.equal(response.status,status,path+': '+JSON.stringify(value));return value?.data??value
 }
 for(const person of Object.values(people)){
  const email=person.id.toLowerCase()+'@synthetic-cradle.test'
  await request(h.cookie,'/auth/invite',{body:{email,displayName:person.name,role:'member'},status:202})
  const mail=(await h.mailMessages()).findLast(message=>message.personalizations.some(group=>group.to.some(recipient=>recipient.email===email)))
  assert.ok(mail,'The network edge captures the native invitation')
  const link=new URL(mail.content.find(part=>part.type==='text/plain').value.match(/https?:\/\/[^\s]+/)[0])
  const confirmed=await fetch(h.origin+'/auth/confirm',{method:'POST',redirect:'manual',headers:{origin:h.origin,'content-type':'application/json'},body:JSON.stringify({token:link.searchParams.get('token')})})
  assert.equal(confirmed.status,303);person.cookie=confirmed.headers.get('set-cookie').split(';')[0]
  const app=await fetch(h.origin+'/app',{headers:{cookie:person.cookie}});assert.equal(app.status,200);await app.arrayBuffer()
  const native=(await(await fetch(h.origin+'/auth/session',{headers:{cookie:person.cookie}})).json()).operator
  const projection=await h.db.prepare('SELECT principal_id FROM cradle_base_operators WHERE base_id=?').bind(native.id).first()
  assert.ok(projection,'The native account projects its current product principal');person.id=projection.principal_id
 }
 for(const [key,person] of Object.entries(people))await request(h.cookie,`/api/v1/records/bases/${appId}/collaborators`,{body:{commandId:createUlid(),principalId:person.id,role:key==='reader'?'read-only':'editor',destructive:false,version:0}})
 const command=(cookie,action,input,expected=[],status=200)=>request(cookie,'/api/v1/commands/'+action,{body:{commandId:createUlid(),expected,input},status})
 return {people,request,command}
}
