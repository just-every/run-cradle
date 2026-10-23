import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {adoptFixtureOperators} from './base-fixture-auth.mjs'
import {baseHttpSession} from './base-http-session.mjs'
/** Real native sessions and generated base role policies for the personal-store journeys. */
export async function fileStoreActors(h,appId){
 const people={editor:{id:createUlid(),name:'synthetic-cradle-editor-1'},second:{id:createUlid(),name:'synthetic-cradle-editor-2'},reader:{id:createUlid(),name:'synthetic-cradle-reader-1'}}
 for(const [key,person] of Object.entries(people)){
  const now=Date.now();await h.db.prepare('INSERT INTO operators(id,created_at,updated_at,name,email,active) VALUES(?,?,?,?,?,1)').bind(person.id,now,now,person.name,`${person.id.toLowerCase()}@synthetic-cradle.test`).run()
  await h.db.prepare("INSERT INTO authority_principals(id,kind,human_id,state,initial_owner,created_at,updated_at) VALUES(?,'human',?,'active',0,?,?)").bind(person.id,person.id,now,now).run()
 }
 await adoptFixtureOperators(h.db)
 for(const person of Object.values(people))person.cookie=(await baseHttpSession(h.origin,`${person.id.toLowerCase()}@synthetic-cradle.test`)).cookie
 async function request(cookie,path,{body,status=200}={}){
  const csrf=(await(await fetch(h.origin+'/auth/csrf',{headers:{cookie}})).json()).csrfToken
  const response=await fetch(h.origin+path,{method:body===undefined?'GET':'POST',redirect:'manual',headers:{cookie,origin:h.origin,'x-csrf-token':csrf,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})
  const value=await response.json().catch(()=>null);assert.equal(response.status,status,path+': '+JSON.stringify(value));return value?.data??value
 }
 for(const [key,person] of Object.entries(people))await request(h.cookie,`/api/v1/records/bases/${appId}/collaborators`,{body:{commandId:createUlid(),principalId:person.id,role:key==='reader'?'read-only':'editor',destructive:false,version:0}})
 const command=(cookie,action,input,expected=[],status=200)=>request(cookie,'/api/v1/commands/'+action,{body:{commandId:createUlid(),expected,input},status})
 return {people,request,command}
}
