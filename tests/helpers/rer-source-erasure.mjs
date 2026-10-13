import {unrelatedImport} from './rer-erasure-archive.mjs'
import {compressedPdf,encodedText,gzipMetadata} from './erasure-attachments.mjs'
import {mentionAuthorityControls} from './rer-mention-policy.mjs'
import {erasureWriteRace} from './rer-erasure-race.mjs'
import {retentionRows} from './rer-retention.mjs'
import assert from 'node:assert/strict'
import {randomBytes,createHash} from 'node:crypto'
import {bindings} from './rer-data-fixture.mjs'
import {withRerDevelopment} from './rer-development.mjs'
export const erasedName='Erasure Canary Person',erasedEmail='erasure-canary@example.test'
const id=()=>randomBytes(16).toString('hex').slice(0,26).toUpperCase(),appId='00000000000000000000000700',entityId='00000000000000000000000101'
const quote=name=>'"'+name.replaceAll('"','""')+'"'
// Independent oracle for a copy of the identity: a whole token, not part of a longer word.
const word=/[A-Za-z0-9_\u00C0-\u1FFF\u2070-\uFFFF]/u,joins='.+@-'
const wordAt=(text,i)=>i>=0&&i<text.length&&word.test(text[i])
const whole=(text,i,length)=>!(wordAt(text,i-1)||(joins.includes(text[i-1]??' ')&&wordAt(text,i-2))||wordAt(text,i+length)||(joins.includes(text[i+length]??' ')&&wordAt(text,i+length+1)))
export function hasIdentityCopy(text){for(const needle of [erasedEmail,erasedName]){let at=text.indexOf(needle);while(at>=0){if(whole(text,at,needle.length))return true;at=text.indexOf(needle,at+1)}}return false}
const strings=value=>typeof value==='string'?[value]:Array.isArray(value)?value.flatMap(strings):value&&typeof value==='object'?Object.entries(value).flatMap(([key,item])=>[key,...strings(item)]):[]
const copyIn=text=>{if(hasIdentityCopy(text))return true;try{return strings(JSON.parse(text)).some(hasIdentityCopy)}catch{return false}}
export async function identityMatches(root){return bindings(root,async({DB,FILES})=>{
 const matches=[],contained=[];let tables=0,objects=0,objectBytes=0
 for(const {name} of (await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*'").all()).results){tables++
  const columns=(await DB.prepare(`PRAGMA table_xinfo(${quote(name)})`).all()).results.filter(column=>!column.hidden)
  for(const column of columns){const rows=(await DB.prepare(`SELECT CAST(stored.${quote(column.name)} AS TEXT) value FROM ${quote(name)} AS stored WHERE instr(CAST(stored.${quote(column.name)} AS TEXT),?)>0 OR instr(CAST(stored.${quote(column.name)} AS TEXT),?)>0 OR CASE WHEN json_valid(stored.${quote(column.name)}) THEN EXISTS(SELECT 1 FROM json_tree(stored.${quote(column.name)}) WHERE instr(CAST(atom AS TEXT),?)>0 OR instr(CAST(atom AS TEXT),?)>0 OR instr(CAST(key AS TEXT),?)>0 OR instr(CAST(key AS TEXT),?)>0) ELSE 0 END`).bind(erasedName,erasedEmail,erasedName,erasedEmail,erasedName,erasedEmail).all().catch(error=>{throw new Error('Identity scan '+name+'.'+column.name+' failed',{cause:error})})).results
   const copies=rows.filter(row=>copyIn(row.value)).length;if(copies)matches.push({table:name,column:column.name,count:copies});if(rows.length>copies)contained.push({table:name,column:column.name,count:rows.length-copies})}
 }
 let cursor;do{const page=await FILES.list({cursor});for(const object of page.objects){const body=await FILES.get(object.key);if(!body)continue;objects++;objectBytes+=body.size;const text=new TextDecoder().decode(await body.arrayBuffer());if([JSON.stringify([object.key,body.customMetadata,body.httpMetadata]),text].some(copyIn))matches.push({table:'R2',column:'key-metadata-bytes',count:1})}cursor=page.truncated?page.cursor:undefined}while(cursor)
 return {tables,matches,contained,objects,objectBytes}
})}
export async function sourceErasure(copy,origin,prior,populate,restart){
 const identity=await bindings(copy.source,async({DB,FILES})=>{
  const base=id(),now=Date.now();await DB.prepare("INSERT INTO oa_operators(id,email,display_name,role,status,created_at) VALUES(?,?,?,'member','active',?)").bind(base,erasedEmail,erasedName,now).run()
  const person=(await DB.prepare('SELECT principal_id FROM cradle_base_operators WHERE base_id=?').bind(base).first()).principal_id
  await DB.prepare("UPDATE authority_principals SET state='active' WHERE id=?").bind(person).run()
  const template=await DB.prepare('SELECT p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.principal_id=(SELECT id FROM authority_principals WHERE initial_owner=1) AND m.app_id=?').bind(appId).first(),policy=id()
  const rules=JSON.parse(template.rules_json).map(rule=>({...rule,principals:[{kind:'human',id:person}]}))
  await DB.prepare('INSERT INTO authority_policies(id,app_id,name,rules_json,version,created_at,updated_at) VALUES(?,?,?,?,1,?,?)').bind(policy,appId,'Canary operator policy',JSON.stringify(rules),now,now).run()
  await DB.prepare("INSERT INTO authority_memberships(principal_id,app_id,policy_id,legacy,state,version) VALUES(?,?,?,1,'active',1)").bind(person,appId,policy).run()
  const campaign=(await DB.prepare('SELECT id FROM campaigns ORDER BY id LIMIT 1').first()).id
  await DB.prepare('INSERT INTO comments(id,created_at,updated_at,version,campaign_id,author_id,body) VALUES(?,?,?,1,?,?,?)').bind(id(),now,now,campaign,person,'Comment by '+erasedName+' '+erasedEmail).run()
  await DB.prepare("INSERT INTO activity_entries(id,created_at,updated_at,version,campaign_id,subject_id,actor_id,type,message) VALUES(?,?,?,1,?,?,?,'privacy.fixture',?)").bind(id(),now,now,campaign,campaign,person,JSON.stringify({[erasedEmail]:erasedName})).run()
  await DB.prepare("UPDATE decisions SET requester_id=?,outcome_by_id=?,state='Approved',outcome_at=?,rationale=? WHERE id=(SELECT id FROM decisions ORDER BY id LIMIT 1)").bind(person,person,now,'Decision by '+erasedName).run()
  const notification=id();await DB.prepare("INSERT INTO notifications(id,created_at,updated_at,version,operator_id,kind,title,body) VALUES(?,?,?,1,?,'comment-mentioned',?,?)").bind(notification,now,now,person,erasedName,erasedEmail).run()
  await DB.prepare("INSERT INTO channel_deliveries(id,notification_id,operator_id,kind,state,due_at,created_at,updated_at,version) VALUES(?,?,?,'comment-mentioned','delivered',?,?,?,1)").bind(id(),notification,person,now,now,now).run()
  const intake=id();await DB.prepare("INSERT INTO evidence_staging(id,app_id,owner_id,purpose,label,version,schema_version,lifecycle,created_at,updated_at) VALUES(?,?,?,'source',?,1,1,'active',?,?)").bind(intake,appId,person,'Notes from '+erasedName,new Date(now).toISOString(),new Date(now).toISOString()).run()
  const fileId=id(),key='private/'+fileId+'/'+erasedEmail,bytes=new TextEncoder().encode(erasedName+' '+erasedEmail),hash=createHash('sha256').update(bytes).digest('hex')
  await FILES.put(key,bytes,{sha256:hash,customMetadata:{person:erasedEmail},httpMetadata:{contentDisposition:'attachment; filename="'+erasedName+'"'}})
  await DB.prepare("INSERT INTO evidence_files(id,app_id,entity_id,record_id,field_ids,filename,media_type,bytes,sha256,object_key,state,version,created_at,updated_at) VALUES(?,?,?,?,'[]',?,'text/plain',?,?,?,'available',1,?,?)").bind(fileId,appId,'00000000000000000000000408',intake,erasedName+'.txt',bytes.length,hash,key,new Date(now).toISOString(),new Date(now).toISOString()).run()
  const compressedKeys=[]
  const headerIdentity=erasedName+' '+erasedEmail
  for(const [body,type,encoding] of [[compressedPdf(erasedName+' '+erasedEmail),'application/pdf'],[encodedText(erasedName+' '+erasedEmail,'gzip'),'text/plain','gzip'],[encodedText(erasedName+' '+erasedEmail,'deflate'),'text/plain','deflate'],[gzipMetadata('innocent header fixture',{name:headerIdentity}),'text/plain','gzip'],[encodedText(Buffer.concat([encodedText('innocent ','gzip'),gzipMetadata('header fixture',{comment:headerIdentity})]),'gzip'),'text/plain','gzip,gzip']]){
   const file=id(),objectKey='private/'+file+'/attachment',digest=createHash('sha256').update(body).digest('hex');compressedKeys.push(objectKey)
   await FILES.put(objectKey,body,{httpMetadata:{contentType:type,...encoding?{contentEncoding:encoding}:{}}})
   await DB.prepare("INSERT INTO evidence_files(id,app_id,entity_id,record_id,field_ids,filename,media_type,bytes,sha256,object_key,state,version,created_at,updated_at) VALUES(?,?,?,?,'[]','Private attachment',?,?,?,?,'available',1,?,?)").bind(file,appId,'00000000000000000000000408',intake,type,body.length,digest,objectKey,new Date(now).toISOString(),new Date(now).toISOString()).run()
  }
  return {person,campaign,key,intake,compressedKeys,version:(await DB.prepare('SELECT version FROM authority_principals WHERE id=?').bind(person).first()).version}
 })
 let before,opaqueFixture
 const started=Date.now()
 let unrelated
 await withRerDevelopment(copy,origin,async()=>{
  const csrf=await fetch(origin+'/auth/csrf',{headers:{cookie:prior.cookie}}),csrfToken=(await csrf.json()).csrfToken
  const request=(body,action='erase')=>fetch(origin+'/api/v1/commands/member.'+action,{method:'POST',headers:{cookie:prior.cookie,origin,connection:'close','content-type':'application/json','x-csrf-token':csrfToken},body:JSON.stringify(body)})
  const mention=async(expectedStatus=200)=>{const campaign=await bindings(copy.source,async({DB})=>DB.prepare('SELECT version FROM campaigns WHERE id=?').bind(identity.campaign).first());const response=await fetch(origin+'/api/v1/commands/launch.comment.create',{method:'POST',headers:{cookie:prior.cookie,origin,connection:'close','content-type':'application/json','x-csrf-token':csrfToken},body:JSON.stringify({commandId:id(),expected:[{ref:{appId,entityId:'00000000000000000000000701',recordId:identity.campaign},version:campaign.version}],input:{campaignId:identity.campaign,body:'Plain mention @'+identity.person,mentions:[identity.person]}})});const result=await response.json();assert.equal(response.status,expectedStatus,'Public launch comment mention: '+JSON.stringify(result.error??{}));return result.data?.value?.id}
  await mentionAuthorityControls(copy,prior,mention)
  const activeMention=await mention();await bindings(copy.source,async({DB})=>assert.equal((await DB.prepare('SELECT count(*) n FROM notifications WHERE operator_id=? AND subject_id=?').bind(identity.person,activeMention).first()).n,1,'Current mention notifies exactly one recipient'))
  const removal={commandId:id(),expected:[{ref:{appId,entityId,recordId:identity.person},version:identity.version}],input:{memberId:identity.person,reason:'Owner removed access before erasure'}}
  const removed=await request(removal,'remove'),removedBody=await removed.json();assert.equal(removed.status,200,'Normal owner removal completes: '+JSON.stringify(removedBody.error??{}));assert.equal(removedBody.data.value.state,'removed')
  if(populate)await populate(identity)
  unrelated=await unrelatedImport(copy,origin,prior.cookie)
  before=await identityMatches(copy.source);assert.ok(before.matches.length>=5,'Canaries reach multiple real stores before erasure');await retentionRows(copy.source,'before-operator-erasure');console.log('ERASURE_FILE_INVENTORY '+JSON.stringify({objects:before.objects,bytes:before.objectBytes}))
  const removedMention=await mention();await bindings(copy.source,async({DB})=>assert.equal((await DB.prepare('SELECT count(*) n FROM notifications WHERE subject_id=?').bind(removedMention).first()).n,0,'Removed mention notifies nobody'))
  const value={commandId:id(),expected:[{ref:{appId,entityId,recordId:identity.person},version:identity.version+1}],input:{memberId:identity.person,reason:'Owner confirmed permanent identity erasure'}}
  // This roundtrip fixture deliberately owns an opaque binary. Prove refusal,
  // then let the fixture owner withdraw it while privacy inspection runs. A
  // distinct supported compressed control proves unrelated bytes survive.
  opaqueFixture=await bindings(copy.source,async({DB,FILES})=>{const row=await DB.prepare("SELECT * FROM evidence_files WHERE id='archive-file'").first();if(!row)return null;const object=await FILES.get(row.object_key);return {row,bytes:new Uint8Array(await object.arrayBuffer()),httpMetadata:object.httpMetadata,customMetadata:object.customMetadata}})
  if(opaqueFixture){const refusal=await request({...value,commandId:id()}),detail=await refusal.json();assert.equal(refusal.status,409,'Opaque attachment refusal: '+(detail.error?.code??'missing error code'));assert.match(detail.error.message,/cannot inspect/);await bindings(copy.source,async({DB,FILES})=>{assert.equal((await DB.prepare('SELECT state FROM authority_principals WHERE id=?').bind(identity.person).first()).state,'removed');assert.deepEqual(new Uint8Array(await(await FILES.get(opaqueFixture.row.object_key)).arrayBuffer()),opaqueFixture.bytes);await FILES.delete(opaqueFixture.row.object_key);await DB.prepare('DELETE FROM evidence_files WHERE id=?').bind(opaqueFixture.row.id).run()})}
  const controlKey='privacy/control-compressed.pdf',controlBytes=compressedPdf('A different person: Control Reader, control-reader@example.test')
  await bindings(copy.source,async({FILES})=>FILES.put(controlKey,controlBytes,{httpMetadata:{contentType:'application/pdf'},customMetadata:{purpose:'unrelated privacy control'}}))
  const headerControlKey='privacy/control-header.gz',headerControlBytes=gzipMetadata('innocent header fixture',{name:'Control Reader',comment:'control-reader@example.test'}),headerControlMetadata={httpMetadata:{contentType:'text/plain',contentEncoding:'gzip'},customMetadata:{purpose:'unrelated gzip envelope control'}}
  await bindings(copy.source,async({FILES})=>FILES.put(headerControlKey,headerControlBytes,headerControlMetadata))
  const opaqueHeaderKey='privacy/opaque-header.gz',opaqueHeaderBytes=gzipMetadata('innocent header fixture',{extra:Buffer.from(erasedName+' '+erasedEmail)})
  await bindings(copy.source,async({FILES})=>FILES.put(opaqueHeaderKey,opaqueHeaderBytes,{httpMetadata:{contentType:'text/plain',contentEncoding:'gzip'}}))
  const headerRefusal=await request({...value,commandId:id()}),headerProblem=await headerRefusal.json();assert.equal(headerRefusal.status,409);assert.match(headerProblem.error.message,/cannot inspect/)
  await bindings(copy.source,async({DB,FILES})=>{assert.equal((await DB.prepare('SELECT state FROM authority_principals WHERE id=?').bind(identity.person).first()).state,'removed');assert.deepEqual(new Uint8Array(await(await FILES.get(opaqueHeaderKey)).arrayBuffer()),new Uint8Array(opaqueHeaderBytes));await FILES.delete(opaqueHeaderKey)})
  const unmatched=await request({...value,expected:[{ref:{appId,entityId,recordId:id()},version:1}]});assert.equal(unmatched.status,400,'Missing member expected version is a typed validation refusal')
  const mandate=id(),operationCase=id()
  await bindings(copy.source,async({DB})=>{await DB.prepare('INSERT INTO operation_mandates(id,app_id,version,data_json) VALUES(?,?,1,?)').bind(mandate,appId,'{}').run();await DB.prepare('INSERT INTO operation_cases(id,app_id,version,data_json,mandate_id,entity_id,subject_id,control_epoch,state) VALUES(?,?,1,?,?,?,?,1,?)').bind(operationCase,appId,JSON.stringify({updatedAt:new Date().toISOString(),name:erasedName}),mandate,entityId,identity.campaign,'observing').run()})
  const custody=await request({...value,commandId:id()}),custodyBody=await custody.json();assert.equal(custody.status,409);assert.match(custodyBody.error.message,/operation_cases/,'Versioned case/history custody is explicitly held before mutation')
  await bindings(copy.source,async({DB})=>{assert.equal((await DB.prepare('SELECT count(*) n FROM operation_case_history WHERE case_id=?').bind(operationCase).first()).n,1);await DB.prepare('DELETE FROM operation_cases WHERE id=?').bind(operationCase).run();await DB.prepare('DELETE FROM operation_case_history WHERE case_id=?').bind(operationCase).run();await DB.prepare('DELETE FROM operation_mandates WHERE id=?').bind(mandate).run()})
  for(const content of [JSON.stringify({[erasedEmail]:'first',['Anonymous '+identity.person.slice(-8)]:'second'}),'{"escaped":"'+[...erasedEmail].map(char=>'\\u'+char.charCodeAt(0).toString(16).padStart(4,'0')).join('')+'"}']){
   await bindings(copy.source,async({DB})=>DB.prepare('UPDATE activity_entries SET message=? WHERE actor_id=?').bind(content,identity.person).run())
   const refused=await request({...value,commandId:id()});assert.equal(refused.status,409,'Unsafe JSON identities refuse before erasure');assert.equal(await bindings(copy.source,async({DB})=>(await DB.prepare('SELECT state FROM authority_principals WHERE id=?').bind(identity.person).first()).state),'removed')
  }
  await bindings(copy.source,async({DB})=>DB.prepare('UPDATE activity_entries SET message=? WHERE actor_id=?').bind(JSON.stringify({[erasedEmail]:erasedName}),identity.person).run())
  for(const name of ['Anonymous','erased']){await bindings(copy.source,async({DB})=>{await DB.prepare('UPDATE operators SET name=? WHERE id=?').bind(name,identity.person).run()});const refusal=await request({...value,commandId:id()}),problem=await refusal.json();assert.equal(refusal.status,409);assert.match(problem.error.message,/replacement-label conflict/)}
  await bindings(copy.source,async({DB})=>{await DB.prepare('UPDATE operators SET name=? WHERE id=?').bind(erasedName,identity.person).run()})
  await erasureWriteRace({copy,origin,prior,csrfToken,id,request,value,text:'Owner upload racing the erasure'})
  const ownerText=erasedName+'nel handoff and '+erasedName+'nel sign-off',current=await bindings(copy.source,async({DB})=>DB.prepare('SELECT version FROM campaigns WHERE id=?').bind(identity.campaign).first())
  const patched=await fetch(origin+'/api/v1/commands/launch.campaign.patch',{method:'POST',headers:{cookie:prior.cookie,origin,connection:'close','content-type':'application/json','x-csrf-token':csrfToken},body:JSON.stringify({commandId:id(),expected:[{ref:{appId,entityId:'00000000000000000000000701',recordId:identity.campaign},version:current.version}],input:{id:identity.campaign,changes:{objective:ownerText}}})});assert.equal(patched.status,200,'Owner writes an objective that contains the name inside a longer word')
  const objective=()=>bindings(copy.source,async({DB})=>(await DB.prepare('SELECT objective FROM campaigns WHERE id=?').bind(identity.campaign).first()).objective)
  const unconfirmed=await request({...value,commandId:id()}),problem=await unconfirmed.json();assert.equal(unconfirmed.status,409,'A copy inside another word refuses before any mutation');assert.ok(problem.error.erasureCopies.some(copy=>copy.store==='campaigns.objective'&&copy.reason==='inside_longer_word'),'The refusal names the store and reason: '+JSON.stringify(problem.error.erasureCopies))
  assert.equal(await objective(),ownerText);assert.equal(await bindings(copy.source,async({DB})=>(await DB.prepare('SELECT state FROM authority_principals WHERE id=?').bind(identity.person).first()).state),'removed')
  assert.deepEqual([...new Set(problem.error.erasureCopies.map(copy=>copy.reason))],['inside_longer_word'],'Every reported copy is the owner text inside a longer word')
  value.input.keepCopies=[...new Set(problem.error.erasureCopies.map(copy=>copy.store))]
  const campaignRevision=await bindings(copy.source,async({DB})=>DB.prepare('SELECT version FROM campaigns WHERE id=?').bind(identity.campaign).first());
  const bufferedText='Buffered pre-erasure comment',bufferedInput=JSON.stringify({commandId:id(),expected:[{ref:{appId,entityId:'00000000000000000000000701',recordId:identity.campaign},version:campaignRevision.version}],input:{campaignId:identity.campaign,body:bufferedText,mentions:[]}});
  let unblock;const waiting=new Promise(resolve=>unblock=resolve),bufferedBody=new ReadableStream({async start(controller){controller.enqueue(new TextEncoder().encode(bufferedInput.slice(0,12)));await waiting;controller.enqueue(new TextEncoder().encode(bufferedInput.slice(12)));controller.close()}});
  const buffered=fetch(origin+'/api/v1/commands/launch.comment.create',{method:'POST',headers:{cookie:prior.cookie,origin,connection:'close','content-type':'application/json','x-csrf-token':csrfToken},body:bufferedBody,duplex:'half'}).then(response=>({response}),error=>({error}));await new Promise(resolve=>setTimeout(resolve,300));
  const eraseStarted=Date.now(),response=await request(value).finally(unblock),body=await response.json();assert.equal(response.status,200,'Public owner erasure: '+(body.error?.code??''));assert.equal(body.data.value.confirmed,true,'Completion confirmed after blob deletion');console.log('OPERATOR_ERASURE_POST_CONFIRMED_MS: '+(Date.now()-eraseStarted));unblock();const bufferedResult=await buffered;assert.ifError(bufferedResult.error);const refusedBuffered=bufferedResult.response;assert.equal(refusedBuffered.status,409,'Owner request buffered before erasure cannot publish afterward');await bindings(copy.source,async({DB})=>assert.equal((await DB.prepare('SELECT count(*) n FROM comments WHERE body=?').bind(bufferedText).first()).n,0));console.log('ERASURE_BUFFERED_COMMAND: stale owner comment409/zero rows; fresh post-erasure mention succeeds')
  assert.equal(await objective(),ownerText,'Confirmed erasure leaves the owner\'s own text byte-for-byte unchanged');assert.ok(body.data.value.plan.places.some(place=>place.store==='comments'&&place.rows>0),'The receipt lists the identity places it touched')
  await bindings(copy.source,async({FILES})=>assert.deepEqual(new Uint8Array(await(await FILES.get(controlKey)).arrayBuffer()),new Uint8Array(controlBytes),'Unrelated compressed control is byte-identical after erasure'))
  await bindings(copy.source,async({FILES})=>{const object=await FILES.get(headerControlKey);assert.ok(object);assert.deepEqual(new Uint8Array(await object.arrayBuffer()),new Uint8Array(headerControlBytes),'Unrelated gzip header and payload remain byte-identical');assert.deepEqual({httpMetadata:object.httpMetadata,customMetadata:object.customMetadata},headerControlMetadata,'Unrelated gzip object metadata remains exact')})
  const detail=await fetch(origin+'/api/campaigns/'+identity.campaign,{headers:{cookie:prior.cookie}});assert.equal(detail.status,200)
  const projected=await detail.json(),comment=projected.comments.find(comment=>comment.authorId===identity.person);assert.equal(comment.authorName,'Anonymous '+identity.person.slice(-8),'Retained comment renders the stable anonymous attribution')
  const erasedMention=await mention();await bindings(copy.source,async({DB})=>{assert.equal((await DB.prepare('SELECT count(*) n FROM notifications WHERE subject_id=?').bind(erasedMention).first()).n,0,'Erased mention notifies nobody');assert.equal((await DB.prepare('SELECT body FROM comments WHERE id=?').bind(erasedMention).first()).body,'Plain mention @'+identity.person)})
  const repeated=await request(value);assert.equal(repeated.status,200,'Lost erasure response safely replays')
  const second=await request({...value,commandId:id()});assert.equal(second.status,409,'Completed erasure cannot be repeated as a fresh operation')
  await unrelated.verifyAndUndo()
  const removeAgain=await request({...removal,commandId:id()},'remove');assert.equal(removeAgain.status,409,'Erased identity cannot return through removal')
  const missing=await fetch(origin+'/api/v1/erasures/'+id(),{headers:{cookie:prior.cookie}});assert.equal(missing.status,404,'Unknown erasure receipt is a typed404')
 })
 if(restart){await restart();await unrelated.verifyRestart()}
 // After proving privacy completion, restore the owner's known fixture bytes
 // for the separate archive corruption/roundtrip checks. No erased identity is
 // reintroduced and no opaque file was silently deemed inspectable.
 if(opaqueFixture)await bindings(copy.source,async({DB,FILES})=>{await FILES.put(opaqueFixture.row.object_key,opaqueFixture.bytes,{httpMetadata:opaqueFixture.httpMetadata,customMetadata:opaqueFixture.customMetadata});const columns=Object.keys(opaqueFixture.row);await DB.prepare(`INSERT INTO evidence_files(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).bind(...columns.map(c=>opaqueFixture.row[c])).run()})
 const after=await identityMatches(copy.source);assert.deepEqual(after.matches,[],'Every SQLite table has zero original identity matches')
 await bindings(copy.source,async({DB,FILES})=>{
  assert.equal((await DB.prepare('SELECT state FROM authority_principals WHERE id=?').bind(identity.person).first()).state,'erased')
  assert.equal((await DB.prepare('SELECT count(*) n FROM comments WHERE author_id=?').bind(identity.person).first()).n,1,'Authored comment retained')
  assert.equal((await DB.prepare('SELECT count(*) n FROM activity_entries WHERE actor_id=?').bind(identity.person).first()).n,1,'Activity retained')
  assert.equal((await DB.prepare('SELECT count(*) n FROM decisions WHERE outcome_by_id=?').bind(identity.person).first()).n,1,'Decision outcome retained')
  assert.equal((await DB.prepare('SELECT count(*) n FROM notifications WHERE operator_id=?').bind(identity.person).first()).n,0)
  assert.equal((await DB.prepare('SELECT count(*) n FROM channel_deliveries WHERE operator_id=?').bind(identity.person).first()).n,0)
  assert.equal(await FILES.head(identity.key),null,'Personal bytes deleted before confirmation')
  for(const key of identity.compressedKeys)assert.equal(await FILES.head(key),null,'Neutral-key personal PDF/gzip/deflate, including header-only identity, deleted before confirmation')
 })
 await retentionRows(copy.source,'after-operator-erasure')
 console.log(`OPERATOR_ERASURE: ${after.tables} tables searched; ${before.matches.length} populated canary columns before; 0 after; ${Date.now()-started}ms including fixture preflight and complete scans; ${populate?'large attributed fixture; exact counts logged separately':'small fixture, manifest-scale unmeasured'}`)
 return identity
}
