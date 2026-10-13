import './typescript-loader.mjs'
import assert from 'node:assert/strict'
import {harness} from './records-manual-harness.mjs'
import {createFixtureAuth} from './base-fixture-auth.mjs'
import {applyPreview} from './base-exit-runtime.mjs'
import {prepareCsvSource,allocateImportIdentities} from '../../src/domains/records/base-transfer/source.ts'
import {previewBaseImport} from '../../src/domains/records/base-transfer/plan.ts'
import {createServerFoundation} from '../../src/core/app/foundation.server.ts'
import {createLifecycleComposition} from '../../src/core/app/composition/lifecycle.server.ts'
import {createUlid} from '../../src/core/shared/ids.ts'
import {objectBucket,hash} from './erasure-attachments.mjs'
export const identity={name:'Subject Person',email:'subject-person@example.test'},control={name:'Control Person',email:'control-person@example.test'}
export async function fixture(){
 const h=await harness(),bucket=objectBucket(),origin='http://127.0.0.1:4187'
 const configuration={appOrigin:origin,sessionSecret:'test-only-erasure-session-secret-long-enough',mode:'development'}
 const auth=await createFixtureAuth(h.db,configuration,h.owner),session=await auth.signIn()
 const member=createUlid();await h.db.prepare("INSERT INTO oa_operators(id,email,display_name,role,status,created_at) VALUES(?,?,?,'member','active',?)").bind(member,identity.email,identity.name,Date.now()).run()
 const person=(await h.db.prepare('SELECT principal_id FROM cradle_base_operators WHERE base_id=?').bind(member).first()).principal_id
 const other=createUlid();await h.db.prepare("INSERT INTO oa_operators(id,email,display_name,role,status,created_at) VALUES(?,?,?,'member','active',?)").bind(other,control.email,control.name,Date.now()).run()
 h.sql.prepare('INSERT INTO rer_portability_state(id,source_identity,epoch) VALUES(1,?,0)').run(createUlid())
 const platform={bindings:{DB:h.db,FILES:bucket,WORK_QUEUE:{async send(){},async sendBatch(){}}},auth:{configuration}}
 const foundation=await createServerFoundation(platform,{descriptors:[],admissionGuards:()=>[]}),lifecycle=createLifecycleComposition(platform,foundation)
 async function imported(rows,namespace){
  const source=prepareCsvSource([{filename:'People.csv',bytes:Buffer.from('Name,Email\r\n'+rows.map(p=>p.name+','+p.email).join('\r\n')+'\r\n')}],namespace)
  const preview=previewBaseImport(source,{name:'Personal records'},allocateImportIdentities(source)),loaded=await applyPreview(h,preview)
  return {...loaded,preview,table:loaded.r.registry.get(preview.identities.appId,preview.records[0].entityId).table.tableId}
 }
 async function assign(appId){const p=await h.db.prepare('SELECT policy_id FROM authority_memberships WHERE principal_id=? AND app_id=?').bind(h.owner,appId).first();assert.ok(p);await h.db.prepare("INSERT INTO authority_memberships(principal_id,app_id,policy_id,state,legacy,version) VALUES(?,?,?,'active',0,1)").bind(person,appId,p.policy_id).run()}
 const send=async(action,input,version=1)=>{const request=new Request(origin+'/api/v1/commands/member.'+action,{method:'POST',headers:{host:new URL(origin).host,origin,cookie:session.cookie,'content-type':'application/json','x-csrf-token':session.csrf},body:JSON.stringify({commandId:createUlid(),expected:[{ref:{appId:input.appId,entityId:'00000000000000000000000101',recordId:person},version}],input:{memberId:person,reason:'Owner privacy request',...input.keepCopies?{keepCopies:input.keepCopies}:{}}})});return (action==='erase'?lifecycle.http:foundation.http).fetch(request)}
 async function file(bytes,{owner=person,type='application/pdf',encoding,key=createUlid()}={}){const staging=createUlid(),id=createUlid(),now=new Date().toISOString(),appId=(await h.db.prepare('SELECT app_id FROM authority_memberships WHERE principal_id=? LIMIT 1').bind(person).first()).app_id;await h.db.prepare("INSERT INTO evidence_staging(id,app_id,owner_id,purpose,label,version,schema_version,lifecycle,created_at,updated_at) VALUES(?,?,?,'source','Private source',1,1,'active',?,?)").bind(staging,appId,owner,now,now).run();await bucket.put(key,bytes,{httpMetadata:{contentType:type,...encoding?{contentEncoding:encoding}:{}}});await h.db.prepare("INSERT INTO evidence_files(id,app_id,entity_id,record_id,field_ids,filename,media_type,bytes,sha256,object_key,state,version,created_at,updated_at) VALUES(?,?,?,?,'[]','Private attachment',?,?,?,?, 'available',1,?,?)").bind(id,appId,'00000000000000000000000408',staging,type,bytes.length,hash(bytes),key,now,now).run();return {id,key}}
 const snapshot=()=>JSON.stringify(h.sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name GLOB 'ik_*' OR name GLOB 'record_import_*' OR name GLOB 'lifecycle_*' OR name GLOB 'r_*' OR name IN ('operators','authority_principals','rer_portability_state','rer_portability_journal','rer_portability_epochs')) ORDER BY name").all().map(({name})=>[name,h.sql.prepare('SELECT * FROM "'+name+'"').all()]))
 return {...h,bucket,person,origin,session,imported,assign,send,file,snapshot,lifecycle,foundation}
}
