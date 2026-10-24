import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {physicalName} from '../../src/domains/records/descriptors.server.ts'
const field=(id,label,type='text',extra={})=>({id,label,type,required:false,unique:false,...extra})
/** Actual scheduled D1 disposal covers target-first RESTRICT cycles and leaves
 * later custody, its old FK targets and its recovery snapshots restorable. */
export async function schemaPurgeJourney(h){
 const preview=async draft=>(await h.request('/api/v1/records/schema-preview',{method:'POST',body:draft})).data
 const adopt=async draft=>{const review=await preview(draft);assert.deepEqual(review.impacts.flatMap(item=>item.refusals??[]),[]);return (await h.request('/api/v1/commands/release.adopt',{method:'POST',body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:review.id}}})).data.value}
 const readDraft=async appId=>(await h.request(`/api/v1/records/bases/${appId}`)).data
 async function create(appId,entityId,values){const schema=(await h.request(`/api/v1/apps/${appId}/entities/${entityId}`)).data;return (await h.request('/api/v1/commands/record.create',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId,entityId:'00000000000000000000000001',recordId:entityId},version:schema.version}],input:{appId,entityId,values}}})).data.value}
 const marker=async(appId,kind,id)=>(await h.request(`/api/v1/records/trash?appId=${appId}`)).data.items.find(item=>item.kind===kind&&item.id===id)
 const restore=async(appId,item)=>h.request('/api/v1/records/trash/restore',{method:'POST',body:{kind:item.kind,commandId:createUlid(),appId,entityId:item.entityId,recordId:item.id,version:item.version}})
 const tableName=async(appId,id)=>physicalName(JSON.parse((await h.db.prepare('SELECT schema_json FROM record_schemas WHERE app_id=? AND id=?').bind(appId,id).first()).schema_json))
 const exists=async name=>!!await h.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").bind(name).first()
 const cycleApp=createUlid(),[target,source]=[createUlid(),createUlid()].sort(),keep=createUlid(),targetName=createUlid(),sourceName=createUlid(),toSource=createUlid(),toTarget=createUlid(),keepName=createUlid()
 const relation=(appId,id,label,entityId)=>field(id,label,'relation',{relation:{ownerAppId:appId,entityId,cardinality:'one',onDelete:'restrict'}})
 await adopt({appId:cycleApp,name:'synthetic-cradle-420',tables:[{id:target,label:'Target first',primaryFieldId:targetName,fields:[field(targetName,'Name'),relation(cycleApp,toSource,'Source',source)]},{id:source,label:'Source second',primaryFieldId:sourceName,fields:[field(sourceName,'Name'),relation(cycleApp,toTarget,'Target',target)]},{id:keep,label:'Keep',primaryFieldId:keepName,fields:[field(keepName,'Name')]}]})
 const first=await create(cycleApp,target,{[targetName]:'synthetic-cradle-421',[toSource]:null}),second=await create(cycleApp,source,{[sourceName]:'synthetic-cradle-422',[toTarget]:first.ref})
 await h.patch(first,{[toSource]:second.ref})
 let draft=await readDraft(cycleApp);draft.tables=draft.tables.filter(table=>table.id===keep);await adopt(draft)
 const cycleMarker=await marker(cycleApp,'table',target)
 assert.ok(target<source,'The referenced target sorts before its source; deletion order cannot hide a RESTRICT failure')
 const appId=createUlid(),parent=createUlid(),child=createUlid(),remaining=createUlid(),name=createUlid(),early=createUlid(),later=createUlid(),childName=createUlid(),link=createUlid(),remainingName=createUlid()
 await adopt({appId,name:'synthetic-cradle-430',tables:[{id:parent,label:'Parent',primaryFieldId:name,fields:[field(name,'Name'),field(early,'Early'),field(later,'Later')]},{id:child,label:'Held child',primaryFieldId:childName,fields:[field(childName,'Name'),relation(appId,link,'Parent',parent)]},{id:remaining,label:'Keep',primaryFieldId:remainingName,fields:[field(remainingName,'Name')]}]})
 const parentRecord=await create(appId,parent,{[name]:'synthetic-cradle-431',[early]:'synthetic-cradle-432',[later]:'synthetic-cradle-433'}),childRecord=await create(appId,child,{[childName]:'synthetic-cradle-434',[link]:parentRecord.ref})
 draft=await readDraft(appId);draft.tables.find(table=>table.id===parent).fields=draft.tables.find(table=>table.id===parent).fields.filter(field=>field.id!==early);await adopt(draft)
 const earlyMarker=await marker(appId,'field',early)
 draft=await readDraft(appId);draft.tables.find(table=>table.id===parent).fields=draft.tables.find(table=>table.id===parent).fields.filter(field=>field.id!==later);await adopt(draft)
 const laterMarker=await marker(appId,'field',later),oldParent=await tableName(appId,parent),oldChild=await tableName(appId,child)
 draft=await readDraft(appId);draft.tables=draft.tables.filter(table=>table.id!==child);await adopt(draft)
 const childMarker=await marker(appId,'table',child)
 draft=await readDraft(appId);draft.tables.find(table=>table.id===parent).label='Renamed parent';await adopt(draft)
 const at=Date.parse(earlyMarker.expiresAt)
 assert.ok(Date.parse(cycleMarker.expiresAt)<at);assert.ok(Date.parse(laterMarker.expiresAt)>at);assert.ok(Date.parse(childMarker.expiresAt)>at)
 const scheduled=await (await h.runtime.getWorker()).scheduled({cron:'* * * * *',scheduledTime:at});assert.equal(scheduled.outcome,'ok','The actual scheduled maintenance completes without a hidden exception')
 for(const id of [target,source])assert.deepEqual((await h.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND substr(name,1,28)=?").bind('r_'+id.toLowerCase()).all()).results,[],'Expired reciprocal RESTRICT tables and every old revision are physically gone')
 assert.equal((await marker(appId,'field',early)),undefined)
 assert.ok(await exists(oldChild),'Unexpired held-table canonical storage remains')
 assert.ok(await exists(oldParent),'Its older FK target revision remains even after the live target moves')
 assert.ok((await marker(appId,'field',later)).restorable);assert.ok((await marker(appId,'table',child)).restorable)
 await restore(appId,await marker(appId,'field',later));await restore(appId,await marker(appId,'table',child))
 const restoredParent=(await h.request(`/api/v1/apps/${appId}/entities/${parent}/records/${parentRecord.id}`)).data.record,restoredChild=(await h.request(`/api/v1/apps/${appId}/entities/${child}/records/${childRecord.id}`)).data.record
 assert.equal(restoredParent.fields[early],undefined);assert.equal(restoredParent.fields[later].value,'synthetic-cradle-433');assert.deepEqual(restoredChild.fields,childRecord.fields)
 assert.equal((await h.db.prepare('PRAGMA foreign_key_check').all()).results.length,0)
 console.log('FIELD_SCHEMA_PURGE_CUSTODY PASS target-first reciprocal RESTRICT disposal, later field/table recovery and retained FK closure')
}
