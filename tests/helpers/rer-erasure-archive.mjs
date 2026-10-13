import assert from 'node:assert/strict'
import {copyFile,readFile,readdir} from 'node:fs/promises'
import {join} from 'node:path'
import {gunzipSync,inflateSync} from 'node:zlib'
import {bindings,ownedData,visibleData} from './rer-data-fixture.mjs'
import {erasedName,erasedEmail,hasIdentityCopy} from './rer-source-erasure.mjs'

const readArchive=async(root,name)=>(await readFile(join(root,name),'utf8')).trim().split('\n').map(JSON.parse)
const quote=name=>'"'+name.replaceAll('"','""')+'"'

/** Reconstruct the populated pre-9027 schema, then use the ordinary migration CLI. */
export async function retirementUpgrade(copy){
 const upgrades=(await readdir(join(copy.source,'migrations/updates'))).filter(name=>/^902[789]_/.test(name))
 const original=(await readFile(join(copy.source,'migrations/import/9007_base_import_stream_origin.sql'),'utf8')).split('\n').find(sql=>sql.startsWith('CREATE TRIGGER IF NOT EXISTS ik_d1_stream_revision_update '))
 assert.ok(original)
 await bindings(copy.source,async({DB})=>{
  for(const table of ['ik_d1_reversal_fences','ik_d1_retirements','ik_d1_erasure_journal','ik_d1_erasure_tally']){
   assert.equal((await DB.prepare(`SELECT count(*) n FROM ${table}`).first()).n,0,'Predecessor reconstruction discards no custody rows')
   await DB.prepare('DROP TABLE '+table).run()
  }
  for(const index of ['ik_provenance_job','ik_provenance_source','ik_d1_history_source','ik_sources_job','execution_one_human_resolution'])await DB.prepare('DROP INDEX '+index).run()
  await DB.prepare('DROP TRIGGER ik_d1_stream_revision_update').run();await DB.prepare(original).run()
  for(const name of upgrades)await DB.prepare('DELETE FROM d1_migrations WHERE name=?').bind(name).run()
 })
 const snapshot=()=>bindings(copy.source,async({DB})=>{
  const tables=(await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name GLOB 'ik_*' OR name GLOB 'record_import_*' OR name GLOB 'r_*' OR name IN ('campaigns','operators','authority_principals','authority_memberships','authority_grants','authority_policies')) ORDER BY name").all()).results
  return Object.fromEntries(await Promise.all(tables.map(async({name})=>[name,(await DB.prepare(`SELECT * FROM ${quote(name)}`).all()).results.map(row=>JSON.stringify(row)).sort()])))
 })
 const before=await snapshot(),visible=await visibleData(copy.source),ledger=await bindings(copy.source,async({DB})=>(await DB.prepare('SELECT * FROM d1_migrations ORDER BY id').all()).results)
 assert.ok(before.ik_jobs.length&&before.ik_originals.length&&before.ik_provenance.length,'Predecessor contains real completed import jobs, exact originals and attribution')
 await copy.command(['run','db:migrate:local'])
 const after=await snapshot()
 for(const [table,rows] of Object.entries(before))assert.deepEqual(after[table],rows,'Additive retirement upgrade preserves every cell in '+table)
 assert.deepEqual(await visibleData(copy.source),visible,'Additive retirement upgrade preserves business/generated/search/FILES state')
 const appliedLedger=await bindings(copy.source,async({DB})=>{
  const applied=(await DB.prepare('SELECT * FROM d1_migrations ORDER BY id').all()).results
  assert.deepEqual(applied.filter(row=>!upgrades.includes(row.name)),ledger,'Every prior ledger row and timestamp survives retirement upgrade')
  assert.equal(applied.filter(row=>upgrades.includes(row.name)).length,upgrades.length)
  assert.deepEqual((await DB.prepare('PRAGMA foreign_key_check').all()).results,[])
  return applied
 })
 await copy.command(['run','db:migrate:local'])
 assert.deepEqual(await bindings(copy.source,async({DB})=>(await DB.prepare('SELECT * FROM d1_migrations ORDER BY id').all()).results),appliedLedger,'Repeated normal migration CLI changes no ledger receipt or timestamp')
 assert.deepEqual(await snapshot(),after,'Repeated normal migration CLI changes no import, business or authority row')
 assert.deepEqual(await visibleData(copy.source),visible,'Repeated normal migration CLI changes no generated/search value or FILES object')
 console.log('FORWARD_UPGRADE_9027_9028 '+JSON.stringify({priorLedgerRows:ledger.length,preservedTables:Object.keys(before).length,importJobs:before.ik_jobs.length,originals:before.ik_originals.length,provenance:before.ik_provenance.length,files:visible.objects.length,idempotentReplay:true}))
}

/** Exercise the actual public CSV review, adoption and resume doors. */
async function reviewedCsv(origin,cookie,{filename,name,email,label,baseName=label}){
 const csrfToken=(await(await fetch(origin+'/auth/csrf',{headers:{cookie}})).json()).csrfToken
 const headers={cookie,origin,'x-csrf-token':csrfToken},base=origin+'/api/v1/records/base-import'
 const upload=async(route,preview)=>{
  const form=new FormData();form.append('files',new Blob(['Name,Email\r\n'+name+','+email+'\r\n'],{type:'text/csv'}),filename);form.append('options',JSON.stringify({name:baseName,tables:{[filename]:{label}}}))
  if(preview){form.append('identities',JSON.stringify(preview.identities));form.append('fingerprint',preview.fingerprint);form.append('acceptLoss','true')}
  const response=await fetch(base+route,{method:'POST',headers,body:form});assert.equal(response.status,200,label+' reviewed CSV '+route);return(await response.json()).data
 }
 const post=async(route,input={})=>{const response=await fetch(base+route,{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify(input)});assert.equal(response.status,200,label+' import '+route);return(await response.json()).data}
 const preview=await upload('/preview'),review=await upload('/review',preview)
 let job=await post('/adopt',{reviewId:review.reviewId,fingerprint:review.fingerprint,physicalFingerprint:review.physicalFingerprint,acceptLoss:true})
 for(let n=0;n<40&&job.state!=='completed';n++)job=await post('/jobs/'+job.id+'/resume')
 assert.equal(job.state,'completed')
 return {job,preview,review,post}
}

export async function personalImport(origin,cookie){
 // The exact personal original filename selects whole-job retirement.
 const {job,post}=await reviewedCsv(origin,cookie,{filename:erasedEmail,name:erasedName,email:erasedEmail,label:'Privacy records',baseName:'Privacy custody'})
 assert.equal((await post('/jobs/'+job.id+'/undo')).state,'undone')
 return job.id
}

/** An independent public import remains exact through erasure and undoable afterward. */
export async function unrelatedImport(copy,origin,cookie){
 const {job,preview,review,post}=await reviewedCsv(origin,cookie,{filename:'independent-control.csv',name:'Independent Reader',email:'independent-reader@example.test',label:'Independent custody'})
 const appId=preview.identities.appId
 const snapshot=()=>bindings(copy.source,async({DB})=>{
  const entities=(await DB.prepare('SELECT id FROM record_schemas WHERE app_id=? ORDER BY id').bind(appId).all()).results
  const tables=[]
  for(const {id} of entities){
   const found=(await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name GLOB ? ORDER BY name").bind('r_'+id.toLowerCase()+'*').all()).results,native=[]
   for(const table of found){const columns=(await DB.prepare('PRAGMA table_xinfo('+quote(table.name)+')').all()).results.map(column=>column.name);if(['id','schema_version','lifecycle'].every(column=>columns.includes(column)))native.push(table.name)}
   assert.equal(native.length,1,'Each new CSV entity has exactly one native table');tables.push(native[0])
  }
  const rows=async(table,where='',values=[])=>{const statement=DB.prepare('SELECT * FROM '+quote(table)+where);return (await (values.length?statement.bind(...values):statement).all()).results.map(row=>JSON.stringify(row)).sort()}
  const native=Object.fromEntries(await Promise.all(tables.map(async table=>[table,await rows(table)]))),custody={}
  for(const {name} of (await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name GLOB 'ik_*' ORDER BY name").all()).results){
   const columns=(await DB.prepare('PRAGMA table_info('+quote(name)+')').all()).results.map(column=>column.name)
   const field=columns.includes('job_id')?'job_id':name==='ik_jobs'?'id':null
   if(field)custody[name]=await rows(name,' WHERE '+quote(field)+'=?',[job.id])
  }
  custody.record_import_revisions=await rows('record_import_revisions',' WHERE app_id=?',[appId])
  custody.record_import_reviews=await rows('record_import_reviews',' WHERE id=?',[review.reviewId])
  custody.record_import_review_chunks=await rows('record_import_review_chunks',' WHERE review_id=?',[review.reviewId])
  return {native,custody}
 })
 const before=await snapshot(),nativeRows=Object.values(before.native).reduce((n,rows)=>n+rows.length,0),custodyRows=Object.values(before.custody).reduce((n,rows)=>n+rows.length,0)
 assert.equal(nativeRows,1);assert.ok(before.custody.ik_originals.length>0);assert.ok(before.custody.ik_provenance.length>0)
 let undone
 async function verifyUndone(){
  const response=await fetch(origin+'/api/v1/records/base-import/jobs/'+job.id,{headers:{cookie}});assert.equal(response.status,200);assert.equal((await response.json()).data.job.state,'undone')
  const current=await snapshot();assert.deepEqual(current,undone,'Unrelated undone native rows and custody survive runtime restart byte-identically')
  assert.equal(Object.values(current.native).reduce((n,rows)=>n+rows.length,0),0)
 }
 return {appId,async verifyAndUndo(){
  assert.deepEqual(await snapshot(),before,'Unrelated native rows, originals, plans, provenance and review custody remain byte-identical after erasure')
  assert.equal((await post('/jobs/'+job.id+'/undo')).state,'undone','Unrelated import remains undoable through real HTTP after erasure')
  undone=await snapshot();await verifyUndone()
  console.log('UNRELATED_IMPORT_PUBLIC_UNDO '+JSON.stringify({nativeRowsPreserved:nativeRows,custodyRowsPreserved:custodyRows,custodyStores:Object.keys(before.custody).length,nativeRowsAfterUndo:0,state:'undone'}))
 },async verifyRestart(){await verifyUndone();console.log('UNRELATED_IMPORT_RESTART: public status undone; zero native rows; exact custody retained')}}
}

export async function capturePersonalArchive(copy,identity){
 await copy.rer(['export','--output','exports/before-erasure.rer','--non-interactive'])
 await bindings(copy.source,async({DB})=>{const jobs=(await DB.prepare("SELECT phase,metadata FROM rer_portability_jobs WHERE kind='export'").all()).results;assert.ok(jobs.some(job=>job.phase==='aborted'&&hasIdentityCopy(job.metadata)),'Real CLI leaves terminal private manifest custody for public erasure to retire')})
 const records=await readArchive(copy.source,'exports/before-erasure.rer'),items=records.filter(record=>record.kind==='part').flatMap(part=>part.items)
 assert.ok(items.some(item=>item.kind==='row'&&hasIdentityCopy(JSON.stringify(item.row))),'Pre-erasure archive contains personal DB cells')
 assert.ok(items.some(item=>item.kind==='row'&&item.table==='ik_originals'&&item.row.name===erasedEmail),'Real archived original filename identifies the whole-custody retirement fixture')
 for(const [index,key] of [identity.key,...identity.compressedKeys].entries()){
  const entry=records[0].objects.find(object=>object.key===key);assert.ok(entry,'Personal FILES object is archived')
  const bytes=Buffer.concat(items.filter(item=>item.kind==='object'&&item.key===key).sort((a,b)=>a.offset-b.offset).map(item=>Buffer.from(item.data,'base64')))
  assert.equal(bytes.length,entry.size)
  if(index>=4){
   let payload=bytes,headerIdentity=false
   for(const encoding of entry.httpMetadata.contentEncoding.split(',').reverse()){
    assert.equal(encoding,'gzip')
    headerIdentity ||= payload.includes(Buffer.from(erasedName))&&payload.includes(Buffer.from(erasedEmail))
    payload=gunzipSync(payload)
   }
   assert.equal(payload.toString('utf8'),'innocent header fixture','Header-only canary has no personal decoded payload')
   assert.ok(headerIdentity,'Archived gzip envelope retains both personal metadata canaries')
   continue
  }
  let text
  if(index===1){const start=bytes.indexOf(Buffer.from('stream\n'))+7,end=bytes.indexOf(Buffer.from('\nendstream'),start);assert.ok(start>=7&&end>start);text=inflateSync(bytes.subarray(start,end)).toString('utf8')}
  else text=(index===2?gunzipSync(bytes):index===3?inflateSync(bytes):bytes).toString('utf8')
  assert.ok(text.includes(erasedName)&&text.includes(erasedEmail),'Decoded personal archive bytes contain both identity canaries')
 }
 console.log('PRE_ERASURE_PUBLIC_ARCHIVE: personal DB cells, original 4 decoded personal FILES objects and 2 header-only gzip objects confirmed')
 return records[0]
}

export async function refusedOldArchive(source,target,first,empty,oldManifest){
 assert.equal(first[0].sourceIdentity,oldManifest.sourceIdentity)
 assert.ok(first[0].epoch>oldManifest.epoch,'Later public export carries a newer erasure checkpoint')
 assert.ok(first[0].journal.length>oldManifest.journal.length,'Later public export carries new erasure journal entries')
 await copyFile(join(source.source,'exports/before-erasure.rer'),join(target.source,'exports/before-erasure.rer'))
 const logPath=join(target.root,'journey.log'),offset=(await readFile(logPath,'utf8')).length
 await assert.rejects(target.rer(['import','--input','exports/before-erasure.rer','--journal','exports/first.rer','--yes','--non-interactive']),error=>error.exitCode===4&&error.errorCode==='restore_refused')
 const errors=(await readFile(logPath,'utf8')).slice(offset).split('\n').flatMap(line=>{try{const event=JSON.parse(line);return event.event==='error'?[event]:[]}catch{return[]}})
 assert.ok(errors.some(event=>event.code==='restore_refused'&&event.message.includes('(erasure_epoch)')),'Actual public CLI refusal is the later erasure checkpoint')
 assert.deepEqual(await ownedData(target.source,first[0].tables),empty,'Later-journal refusal changes no target owned DB cell or FILES object')
 console.log('OLD_ARCHIVE_PUBLIC_CLI: --journal later export; exit4 restore_refused/erasure_epoch; empty destination DB and FILES unchanged')
}

export async function retiredPersonalImport(copy,jobId){
 await bindings(copy.source,async({DB})=>{
  assert.equal(await DB.prepare('SELECT id FROM ik_jobs WHERE id=?').bind(jobId).first(),null,'Upgraded retirement removes the personal import job')
  const retired=await DB.prepare("SELECT receipt_id FROM ik_d1_retirements WHERE id=? AND kind='job'").bind(jobId).first();assert.ok(retired)
  const journal=await DB.prepare('SELECT jobs_retired,stores_json FROM ik_d1_erasure_journal WHERE id=?').bind(retired.receipt_id).first();assert.ok(journal.jobs_retired>0)
  assert.ok(JSON.parse(journal.stores_json).some(row=>row.store==='ik_originals'&&row.rows>0),'Public erasure journal counts erased original custody')
  console.log('UPGRADED_IMPORT_RETIREMENT '+JSON.stringify({jobsRetired:journal.jobs_retired,stores:JSON.parse(journal.stores_json)}))
 })
}
