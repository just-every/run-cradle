import {retentionRows} from './rer-retention.mjs'
import assert from 'node:assert/strict'
import {randomBytes,createHash} from 'node:crypto'
import {bindings} from './rer-data-fixture.mjs'
import {withRerDevelopment} from './rer-development.mjs'
const id=()=>randomBytes(16).toString('hex').slice(0,26).toUpperCase(),appId='00000000000000000000000700',entityId='00000000000000000000000701'
export async function sourceCampaignDeletion(copy,origin,prior){
 const fixture=await bindings(copy.source,async({DB,FILES})=>{
  const campaign=await DB.prepare('SELECT id,code,version,owner_id FROM campaigns ORDER BY id DESC LIMIT 1').first(),now=Date.now(),source=id(),file=id(),preview=id(),audit=id(),key='campaign/'+campaign.id+'/original'
  const bytes=new TextEncoder().encode('Campaign original '+campaign.code),sha=createHash('sha256').update(bytes).digest('hex')
  await FILES.put(key,bytes,{sha256:sha})
  await DB.prepare("INSERT INTO evidence_sources(id,app_id,entity_id,record_id,field_ids,kind,current_version,created_at) VALUES(?,?,?,?,'[]','upload',1,?)").bind(source,appId,entityId,campaign.id,new Date(now).toISOString()).run()
  await DB.prepare("INSERT INTO evidence_source_versions(id,source_id,version,sha256,content,file_ids,known_at) VALUES(?,?,1,?,?,?,?)").bind(id(),source,sha,'Campaign source '+campaign.code,JSON.stringify([file]),new Date(now).toISOString()).run()
  await DB.prepare("INSERT INTO evidence_files(id,app_id,entity_id,record_id,field_ids,filename,media_type,bytes,sha256,object_key,state,source_id,version,created_at,updated_at) VALUES(?,?,?,?,'[]','original.txt','text/plain',?,?,?,'available',?,1,?,?)").bind(file,appId,entityId,campaign.id,bytes.length,sha,key,source,new Date(now).toISOString(),new Date(now).toISOString()).run()
  await DB.prepare("INSERT INTO portability_previews(id,actor_id,app_id,entity_id,file_id,mapping_json,preview_json,input_hash,created_at,expires_at) VALUES(?,?,?,?,?,'{}','{}',?,?,?)").bind(preview,campaign.owner_id,appId,entityId,file,sha,new Date(now).toISOString(),new Date(now+60000).toISOString()).run()
  await DB.prepare('INSERT INTO portability_preview_rows(id,preview_id,row_number,record_id,content) VALUES(?,?,0,?,?)').bind(id(),preview,campaign.id,'{"name":"Campaign source"}').run()
  await DB.prepare("INSERT INTO launch_analyses(id,created_at,updated_at,version,feature,subject_id,input_versions_json,model_call_id,content) VALUES(?,?,?,1,'summary',?,'[]',?,'Campaign analysis')").bind(id(),now,now,campaign.id,id()).run()
  return {...campaign,key,source,file,preview,audit}
 })
 await retentionRows(copy.source,'before-campaign-deletion')
 await withRerDevelopment(copy,origin,async()=>{
  const csrf=(await(await fetch(origin+'/auth/csrf',{headers:{cookie:prior.cookie}})).json()).csrfToken
  const patched=await fetch(origin+'/api/v1/commands/launch.campaign.patch',{method:'POST',headers:{cookie:prior.cookie,origin,'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify({commandId:id(),expected:[{ref:{appId,entityId,recordId:fixture.id},version:fixture.version}],input:{id:fixture.id,changes:{objective:'Audited campaign before deletion'}}})});assert.equal(patched.status,200);fixture.version++
  fixture.audit=await bindings(copy.source,async({DB})=>(await DB.prepare("SELECT id FROM admission_audit WHERE json_extract(subject_json,'$.recordId')=? ORDER BY created_at DESC LIMIT 1").bind(fixture.id).first()).id)
  const body={commandId:id(),expected:[{ref:{appId,entityId,recordId:fixture.id},version:fixture.version}],input:{id:fixture.id,confirmationCode:'WRONG'}}
  const send=()=>fetch(origin+'/api/v1/commands/launch.campaign.delete',{method:'POST',headers:{cookie:prior.cookie,origin,'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify(body)})
  assert.equal((await send()).status,400,'Typed campaign code required')
  body.commandId=id();body.input.confirmationCode=fixture.code
  const response=await send(),data=await response.json();assert.equal(response.status,200,'Public campaign delete: '+JSON.stringify(data.error??{}));assert.equal(data.data.value.confirmed,true)
 })
 await bindings(copy.source,async({DB,FILES})=>{
  for(const table of ['campaigns','deliverables','milestones','risks','decisions','comments','activity_entries','campaign_tags','launch_custom_values'])assert.equal((await DB.prepare(`SELECT count(*) n FROM ${table} WHERE ${table==='campaigns'?'id':'campaign_id'}=?`).bind(fixture.id).first()).n,0,table+' deleted')
  assert.equal((await DB.prepare('SELECT count(*) n FROM portability_previews WHERE id=?').bind(fixture.preview).first()).n,0)
  assert.equal((await DB.prepare('SELECT count(*) n FROM portability_preview_rows WHERE preview_id=?').bind(fixture.preview).first()).n,0)
  assert.equal((await DB.prepare('SELECT count(*) n FROM launch_analyses WHERE subject_id=?').bind(fixture.id).first()).n,0)
  assert.equal((await DB.prepare('SELECT content FROM evidence_source_versions WHERE source_id=?').bind(fixture.source).first()).content,null)
  assert.equal(await FILES.head(fixture.key),null)
  const audit=await DB.prepare('SELECT subject_json FROM admission_audit WHERE id=?').bind(fixture.audit).first();assert.ok(audit);assert.ok(!audit.subject_json.includes(fixture.id),'Retained audit reference anonymised')
 })
 await retentionRows(copy.source,'after-campaign-deletion')
 console.log('CAMPAIGN_ERASURE: typed-code refusal, canonical child graph, import/source/analysis and file removal; audit retained anonymous')
}
