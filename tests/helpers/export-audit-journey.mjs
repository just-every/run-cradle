import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'

/** Metadata-only audit at each real download door, without another registration. */
export async function exportAuditJourney(h){
 const endpoint='/api/v1/launch/admin-audit'
 const rows=async()=>(await h.db.prepare('SELECT * FROM operation_audit ORDER BY created_at,id').all()).results
 const owner=(await h.db.prepare("SELECT principal_id FROM cradle_base_operators WHERE base_id=(SELECT id FROM oa_operators WHERE email='import-owner@example.test')").first()).principal_id
 const observed=[]
 async function once(action,base,run){const before=await rows();await run();const additions=(await rows()).filter(row=>!before.some(old=>old.id===row.id));assert.equal(additions.length,1,action+' has one export audit row');assert.equal(additions[0].action,action);assert.equal(additions[0].actor_id,owner);assert.equal(additions[0].app_id,base);observed.push(additions[0])}
 const input={appId:h.appId,entityId:h.entityId,query:{}}
 for(const format of ['csv','xlsx'])await once('view.export.'+format,h.appId,()=>h.request('/api/v1/records/export-'+format,{method:'POST',body:input}))
 const csrf=(await(await fetch(h.origin+'/auth/csrf',{headers:{cookie:h.cookie}})).json()).csrfToken
 for(const [format,mime]of [['csv','text/csv'],['xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']])await once('view.export.'+format,h.appId,async()=>{
  const response=await fetch(h.origin+'/api/v1/records/export-'+format,{method:'POST',headers:{cookie:h.cookie,origin:h.origin,'content-type':'application/json','x-csrf-token':csrf,accept:mime},body:JSON.stringify(input)})
  assert.equal(response.status,200);assert.ok((await response.arrayBuffer()).byteLength>0)
 })
 for(const format of ['json','csv-set','xlsx'])await once('base.export',h.appId,()=>h.request('/api/v1/records/base-export',{method:'POST',body:{appId:h.appId,format}}))
 const appId=createUlid(),entityId=createUlid(),name=createUlid(),memo=createUlid(),draft={appId,name:'synthetic-cradle-913',tables:[{id:entityId,label:'Export custody',primaryFieldId:name,fields:[{id:name,label:'Name',type:'text',required:false,unique:false},{id:memo,label:'Memo',type:'text',required:false,unique:false}]}]}
 const adopt=async draft=>{const preview=(await h.request('/api/v1/records/schema-preview',{method:'POST',body:draft})).data;return (await h.request('/api/v1/commands/release.adopt',{method:'POST',body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}}})).data.value}
 await adopt(draft);draft.tables[0].fields.pop();const release=await adopt(draft)
 await once('recovery.export',appId,()=>h.request(`/api/v1/records/releases/${release.releaseId}/recovery`))
 await once('recovery.export',appId,async()=>{const response=await fetch(h.origin+`/api/v1/records/releases/${release.releaseId}/recovery/${entityId}.csv`,{headers:{cookie:h.cookie}});assert.equal(response.status,200);await response.text()})
 await once('installation.export',null,()=>h.request('/api/v1/commands/export.start',{method:'POST',body:{scope:'installation',format:'archive'}}))
 for(const format of ['csv','json'])await once('audit.export.'+format,h.appId,async()=>{const response=await fetch(h.origin+endpoint+'?base='+h.appId+'&format='+format,{headers:{cookie:h.cookie}});assert.equal(response.status,200);await response.text()})
 const log=(await h.request(endpoint+'?base='+h.appId+'&person='+owner+'&from=2020-01-01T00%3A00%3A00.000Z&to=2099-01-01T00%3A00%3A00.000Z')).data.items
 for(const row of observed.filter(row=>row.app_id===h.appId))assert.equal(log.filter(entry=>entry.eventId===row.id&&entry.action===row.action&&entry.person==='Import owner').length,1,'Each export appears once under person/base/time filters')
 const beforeRefusal=(await rows()).length
 await h.request('/api/v1/records/export-csv',{method:'POST',status:400,body:{...input,entityId:'invalid'}})
 assert.equal((await rows()).length,beforeRefusal,'A refused export creates no export audit')
 console.log('EXPORT_AUDIT PASS JSON/stream CSV and XLSX, base JSON/CSV-set/XLSX, recovery JSON/CSV, installation and audit CSV/JSON exactly once')
}
