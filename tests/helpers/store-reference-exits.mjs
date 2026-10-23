import {fileStoreActors} from './file-stores-actors.mjs'
import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {workbookDoors} from './workbook-http.mjs'
import {csvDownloadEntries} from './base-csv-download.mjs'
import {readWorkbook} from '../../src/domains/records/workbooks/read.ts'
import {parseCsv} from '../../src/domains/portability/csv.ts'
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0)):v)
export function portableStoreFixture(){
 const appId=createUlid(),entityId=createUlid(),nameId=createUlid(),filesId=createUlid(),rowId=createUlid(),attachedBy=createUlid()
 const links=['https://drive.google.com/file/d/synthetic-cradle-1/view','https://synthetic-cradle.sharepoint.com/synthetic-cradle-2','https://www.dropbox.com/home/synthetic-cradle-3','https://app.box.com/file/synthetic-cradle-4','https://chest.example.test/synthetic-cradle-5']
 const refs=['google-drive','onedrive','dropbox','box','chest'].map((provider,index)=>({kind:'store',schema:1,provider,account:index<2?'synthetic-cradle-namespace-1':null,itemId:'synthetic-cradle-item-'+index,name:'synthetic-cradle-file-'+index+'.png',type:'image/png',size:2048,modified:'2026-10-20T01:02:03.000Z',digest:index===4?null:{algorithm:['sha256','quickxor','dropbox-content-hash','sha1'][index],value:'synthetic-cradle-content-'+index},link:links[index],attachedBy,attachedAt:'2026-10-20T01:02:03.000Z'}))
 const snapshot={format:'cradle-base',version:1,envelope:{capturedAt:'2026-10-20T01:02:03.000Z'},base:{id:appId,name:'synthetic-cradle-store-return',tables:[{id:entityId,label:'Files',primaryFieldId:nameId,fields:[{id:nameId,label:'Name',type:'text',required:true,unique:false},{id:filesId,label:'Attachments',type:'attachment',required:false,unique:false}],incomingRelations:[],records:[{id:rowId,values:{[nameId]:'synthetic-cradle-returned-files',[filesId]:refs}},{id:createUlid(),values:{[nameId]:'synthetic-cradle-empty-files',[filesId]:[]}}]}],views:[],forms:[]}}
 return {snapshot,refs,appId,entityId,nameId,filesId,rowId}
}
export function assertNoStoreCredentials(value,forbidden=[]){const text=typeof value==='string'?value:JSON.stringify(value);for(const needle of [...forbidden,'connectionId','sealed_secret','synthetic-cradle-access-','synthetic-cradle-refresh-','thumbnailLink','thumbnailUrl','googleusercontent.com','files.1drv.com','X-Amz-Signature','X-Goog-Signature'])assert.ok(!text.includes(needle),'Export contains no '+needle)}
export async function importStoreSnapshot(h,snapshot){const d=await workbookDoors(h),bytes=Buffer.from(JSON.stringify(snapshot)),preview=await d.call('/api/v1/records/base-import/preview',d.form(bytes,'synthetic-cradle-stores.json'));return {...await d.adopt(bytes,'synthetic-cradle-stores.json',preview),d}}
export async function storeReferenceReturns(h){
 const {snapshot,refs}=portableStoreFixture(),{people}=await fileStoreActors(h,h.appId);for(const reference of refs)reference.attachedBy=people.editor.id
 const {d,preview,job,status}=await importStoreSnapshot(h,snapshot)
 assert.equal(status.reconciliation.ok,true);assert.deepEqual(preview.report.storeReferences,{unresolved:5,resolved:0,unverified:0})
 async function check(appId,expected=refs){
  const entities=(await d.call(`/api/v1/apps/${appId}/entities`)).items,entity=entities.find(e=>e.label==='Files'),rows=(await d.call(`/api/v1/apps/${appId}/entities/${entity.id}/query`,{})).items,field=entity.fields.find(f=>f.type==='attachment'),row=rows.find(r=>r.fields[field.id]?.value?.length)
  assert.equal(row.fields[field.id].value.length,expected.length)
  for(const member of row.fields[field.id].value){assert.equal(member.reference.resolution,'unresolved');assert.equal(member.reference.connectionId,null);assert.ok(expected.some(ref=>canonical(ref)===canonical(member.reference.portable)))}
  const exported=await d.call('/api/v1/records/base-export',{appId,format:'json'}),parsed=JSON.parse(exported.content),values=parsed.base.tables[0].records.flatMap(r=>r.values[parsed.base.tables[0].fields.find(f=>f.type==='attachment').id]);assert.equal(canonical(values),canonical(expected),'Unresolved canonical content round-trips byte for byte');assertNoStoreCredentials(exported.content)
  const response=await d.raw('/api/v1/records/file-stores/thumbnail?'+new URLSearchParams({appId,entityId:entity.id,fieldId:field.id,recordId:row.id,itemId:expected[0].itemId}));assert.equal(response.status,404);assert.deepEqual(await response.json(),{state:'none'})
  return {parsed,row,field,entity}
 }
 const first=await check(preview.identities.appId),receipt=await d.call(`/api/v1/records/base-import/jobs/${job.id}/receipt.json`);assert.equal(receipt.storeReferences.length,5);assert.ok(receipt.storeReferences.every(r=>r.state==='unresolved'))
 // Every exit is independently decoded, scanned, then returned through the public upload/review/adopt doors.
 const jsonBytes=Buffer.from(JSON.stringify(first.parsed)),copy=await d.adopt(jsonBytes,'synthetic-cradle-copy.json');assert.notEqual(copy.preview.identities.appId,first.parsed.base.id);await check(copy.preview.identities.appId)
 const csv=await d.call('/api/v1/records/base-export',{appId:preview.identities.appId,format:'csv-set'}),entries=csvDownloadEntries(Buffer.from(csv.content,'base64'));for(const entry of entries)assertNoStoreCredentials(entry.bytes.toString('utf8'))
 const files=entries.filter(e=>e.name.endsWith('.csv')),options=JSON.parse(entries.find(e=>e.name==='import-options.json').bytes),csvRows=parseCsv(files[0].bytes);assert.ok(csvRows.rows.some(row=>row[1]===canonical(refs)))
 const form=(preview,artifacts=files,opts=options)=>{const f=new FormData();for(const file of artifacts)f.append('files',new Blob([file.bytes]),file.name);f.set('options',JSON.stringify(opts));if(preview){f.set('identities',JSON.stringify(preview.identities));f.set('fingerprint',preview.fingerprint);f.set('acceptLoss','true')}return f}
 async function returnFiles(artifacts,opts){const p=await d.call('/api/v1/records/base-import/preview',form(null,artifacts,opts));assert.equal(p.report.tables[0].rejected,0);const review=await d.call('/api/v1/records/base-import/review',form(p,artifacts,opts)),job=await d.call('/api/v1/records/base-import/adopt',{reviewId:review.reviewId,fingerprint:review.fingerprint,physicalFingerprint:review.physicalFingerprint,acceptLoss:true});let state=job;while(state.state==='queued'||state.state==='applying')state=await d.call(`/api/v1/records/base-import/jobs/${job.id}/resume`,{});assert.equal(state.state,'completed');await check(p.identities.appId);return p}
 await returnFiles(files,options)
 const workbook=await d.call('/api/v1/records/base-export',{appId:preview.identities.appId,format:'xlsx'}),workbookBytes=Buffer.from(workbook.content,'base64'),sheets=readWorkbook(workbookBytes,'synthetic-cradle-stores.xlsx');for(const sheet of sheets)for(const row of sheet.rows)for(const cell of row)assertNoStoreCredentials(cell.value);assert.ok(sheets[0].rows.some(row=>row[1].value===canonical(refs)))
 await returnFiles([{name:'synthetic-cradle-stores.xlsx',bytes:workbookBytes}],{name:'synthetic-cradle-workbook-return',tables:{'sheet-1':{label:'Files',primaryColumnKey:'column-1',columns:{'column-1':{type:'text'},'column-2':{type:'attachment'}}}}})
 const invalid=await d.call('/api/v1/records/base-import/preview',form(null,[{name:'synthetic-cradle-malformed.csv',bytes:Buffer.from('Name,Attachments\r\nsynthetic-cradle-bad,not-an-array\r\n')}],{name:'synthetic-cradle-malformed',tables:{'synthetic-cradle-malformed.csv':{columns:{'column-2':{type:'attachment'}}}}}));assert.equal(invalid.report.tables[0].rejected,1);assert.ok(invalid.report.diagnostics.some(issue=>issue.columnKey==='column-2'&&/Attachments/.test(issue.message)))
 // Current field policy refuses the complete export before any restricted attachment metadata leaves.
 const policy=await h.db.prepare('SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.app_id=? AND m.principal_id=?').bind(preview.identities.appId,h.operator).first(),rules=JSON.parse(policy.rules_json)
 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules.map(rule=>rule.entityId===first.entity.id?{...rule,readableFields:rule.readableFields.filter(id=>id!==first.field.id)}:rule)),policy.id).run()
 const denied=await d.raw('/api/v1/records/base-export',{appId:preview.identities.appId,format:'json'});assert.equal(denied.status,403);assert.ok(!(await denied.text()).includes(refs[0].itemId))
 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(policy.rules_json,policy.id).run()
 // Seed the existing erased identity state: exports must use the anonymous label even for returned captures.
 const anonymous='Anonymous synthetic-cradle-attacher'
 await h.db.prepare("UPDATE authority_principals SET state='erased',version=version+1 WHERE id=?").bind(people.editor.id).run()
 await h.db.prepare('UPDATE operators SET name=?,active=0 WHERE id=?').bind(anonymous,people.editor.id).run()
 for(const format of ['json','csv-set','xlsx']){const result=await d.call('/api/v1/records/base-export',{appId:preview.identities.appId,format});const texts=format==='json'?[result.content]:format==='csv-set'?csvDownloadEntries(Buffer.from(result.content,'base64')).map(entry=>entry.bytes.toString('utf8')):readWorkbook(Buffer.from(result.content,'base64'),'synthetic-cradle-erased.xlsx').flatMap(sheet=>sheet.rows.flatMap(row=>row.map(cell=>String(cell.value??''))));assert.ok(texts.some(text=>text.includes(anonymous)));assert.ok(texts.every(text=>!text.includes(people.editor.id)))}
 return {snapshot:first.parsed,preview,job,refs}
}
