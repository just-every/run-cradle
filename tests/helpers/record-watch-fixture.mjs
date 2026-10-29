import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {recordsBrowserRuntime} from './records-browser-runtime.mjs'
import {createFixtureAuth} from './base-fixture-auth.mjs'
import {channelLegacyPolicyRules} from '../../src/domains/channels/setup.server.ts'
import {LAUNCH_APP_ID} from '../../src/apps/launch/contracts.ts'
export async function recordWatchFixture(network={}){
 const h=await recordsBrowserRuntime(0,network),owner='00000000000000000000000981',assignee=createUlid(),other=createUlid(),time=Date.now()
 try{
  for(const [id,name,index] of [[assignee,'Synthetic reader',1],[other,'Synthetic colleague',2]]){
   await h.db.prepare('INSERT INTO operators(id,name,email,active,created_at,updated_at,version) VALUES(?,?,?,1,?,?,1)').bind(id,name,'synthetic-cradle-'+index+String.fromCharCode(64)+'example.test',time,time).run()
   await h.db.prepare("INSERT INTO authority_principals(id,kind,human_id,state,initial_owner,created_at,updated_at) VALUES(?,'human',?,'active',0,?,?)").bind(id,id,time,time).run()
   const policyId=createUlid();await h.db.prepare('INSERT INTO authority_policies(id,app_id,name,rules_json,version,created_at,updated_at) VALUES(?,?,?,?,1,?,?)').bind(policyId,LAUNCH_APP_ID,'Personal notification access',JSON.stringify(channelLegacyPolicyRules(id)),time,time).run()
   await h.db.prepare("INSERT INTO authority_memberships(principal_id,app_id,policy_id,legacy,state,version) VALUES(?,?,?,1,'active',1)").bind(id,LAUNCH_APP_ID,policyId).run()
  }
  const auth=await createFixtureAuth(h.db,{appOrigin:h.origin,sessionSecret:'test-only-records-session-secret-at-least-32-characters',mode:'development'},assignee),reader=(await auth.signIn(assignee)).cookie,colleague=(await auth.signIn(other)).cookie
  async function request(path,input,cookie=h.cookie,method=input===undefined?'GET':'POST'){
   const csrf=await (await fetch(h.origin+'/auth/csrf',{headers:{cookie}})).json(),response=await fetch(h.origin+path,{method,headers:{cookie,origin:h.origin,'content-type':'application/json','x-csrf-token':csrf.csrfToken},...(input===undefined?{}:{body:JSON.stringify(input)})}),body=await response.json();return {status:response.status,...body}
  }
  async function call(path,input,cookie,method){const result=await request(path,input,cookie,method);assert.equal(result.status,200,JSON.stringify(result));return result.data}
  const command=async(action,input,expected=[],cookie)=>(await call('/api/v1/commands/'+action,{commandId:createUlid(),expected,input},cookie)).value
  const appId=createUlid(),entityId=createUlid(),title={id:createUlid(),label:'Work item',type:'text',required:true,unique:false},person={id:createUlid(),label:'Assignee',type:'person',required:false,unique:false},note={id:createUlid(),label:'Notes',type:'text',required:false,unique:false}
  const draft={appId,name:'Assignment work',tables:[{id:entityId,label:'Work items',primaryFieldId:title.id,fields:[title,person,note]}]},preview=await call('/api/v1/records/schema-preview',draft)
  await command('release.adopt',{kind:'manual_schema',previewId:preview.id})
  for(const id of [assignee,other])await call(`/api/v1/records/bases/${appId}/collaborators`,{commandId:createUlid(),principalId:id,role:'editor',version:0})
  const schema=await call(`/api/v1/apps/${appId}/entities/${entityId}`)
  const create=(values,cookie)=>command('record.create',{appId,entityId,values},[{ref:{appId,entityId:'00000000000000000000000001',recordId:entityId},version:schema.version}],cookie)
  async function detail(recordId,cookie){return call(`/api/v1/apps/${appId}/entities/${entityId}/records/${recordId}`,undefined,cookie)}
  async function patch(record,changes,cookie){const current=(await detail(record.id,cookie)).record;return command('record.patch',{ref:current.ref,changes},[{ref:current.ref,version:current.version}],cookie)}
  async function comment(record,body,cookie){const current=(await detail(record.id,cookie)).record;return command('comment.add',{subject:current.ref,body,mentions:[]},[{ref:current.ref,version:current.version}],cookie)}
  return {...h,owner,assignee,other,reader,colleague,auth,request,call,command,appId,entityId,title,person,note,schema,create,detail,patch,comment}
 }catch(error){await h.close();throw error}
}
