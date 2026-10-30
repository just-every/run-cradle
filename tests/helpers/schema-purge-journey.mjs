import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {physicalName} from '../../src/domains/records/descriptors.server.ts'
import {parseCsv} from '../../src/domains/portability/csv.ts'
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
 const audit=await scheduledAudit(h,{cycleApp,appId,expired:[target,source,early],retained:[later,child],privateValues:[parentRecord.id,childRecord.id,'synthetic-cradle-421','synthetic-cradle-422','synthetic-cradle-431','synthetic-cradle-432','synthetic-cradle-433','synthetic-cradle-434']})
 const scheduled=await (await h.runtime.getWorker()).scheduled({cron:'* * * * *',scheduledTime:at});assert.equal(scheduled.outcome,'ok','The actual scheduled maintenance completes without a hidden exception')
 for(const id of [target,source])assert.deepEqual((await h.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND substr(name,1,28)=?").bind('r_'+id.toLowerCase()).all()).results,[],'Expired reciprocal RESTRICT tables and every old revision are physically gone')
 assert.equal((await marker(appId,'field',early)),undefined)
 assert.ok(await exists(oldChild),'Unexpired held-table canonical storage remains')
 assert.ok(await exists(oldParent),'Its older FK target revision remains even after the live target moves')
 assert.ok((await marker(appId,'field',later)).restorable);assert.ok((await marker(appId,'table',child)).restorable)
 await audit.verify()
 const repeated=await (await h.runtime.getWorker()).scheduled({cron:'* * * * *',scheduledTime:at});assert.equal(repeated.outcome,'ok')
 await audit.verify(true)
 assert.ok((await marker(appId,'field',later)).restorable);assert.ok((await marker(appId,'table',child)).restorable)
 await restore(appId,await marker(appId,'field',later));await restore(appId,await marker(appId,'table',child))
 const restoredParent=(await h.request(`/api/v1/apps/${appId}/entities/${parent}/records/${parentRecord.id}`)).data.record,restoredChild=(await h.request(`/api/v1/apps/${appId}/entities/${child}/records/${childRecord.id}`)).data.record
 assert.equal(restoredParent.fields[early],undefined);assert.equal(restoredParent.fields[later].value,'synthetic-cradle-433');assert.deepEqual(restoredChild.fields,childRecord.fields)
 assert.equal((await h.db.prepare('PRAGMA foreign_key_check').all()).results.length,0)
 console.log('FIELD_SCHEMA_PURGE_CUSTODY PASS target-first reciprocal RESTRICT disposal, later field/table recovery and retained FK closure')
}

/** Correlate independently retained admission identities with the owner's public
 * log and parsed exports, rather than trusting agreement between projections. */
async function scheduledAudit(h,{cycleApp,appId,expired,retained,privateValues}){
 const endpoint='/api/v1/launch/admin-audit',action='schema.trash.purge'
 const committed=async()=>(await h.db.prepare('SELECT * FROM admission_audit WHERE action=? AND app_id IN (?,?) ORDER BY id').bind(action,cycleApp,appId).all()).results
 assert.deepEqual(await committed(),[],'No purge was committed before the retained expiry')
 let first
 function check(items,expected,format){
  const purges=items.filter(row=>row.action===action)
  assert.equal(purges.length,expected.length,format+' lists exactly the committed purge commands')
  for(const event of expected){
   const matches=purges.filter(row=>row.eventId===event.command_id&&row.action===event.action&&row.baseId===event.app_id)
   assert.equal(matches.length,1,format+' contains each committed command, action and base once')
   const row=matches[0]
   assert.equal(row.id,'command:'+event.id+':base:'+event.app_id)
   assert.equal(row.person,'Schema Trash',format+' names the scheduled feature')
   assert.equal(row.personId,format==='csv'?'':null)
   assert.equal(row.createdAt,event.created_at)
   assert.deepEqual(Object.keys(row).sort(),['id','eventId','action','personId','person','baseId','createdAt',...(format==='csv'?['keyIds']:[])].sort(),format+' exposes metadata only')
   if(format==='csv')assert.equal(row.keyIds,'')
  }
  const text=JSON.stringify(purges)
  for(const value of [...expired,...retained,...privateValues])assert.ok(!text.includes(value),format+' excludes record values and schema subject identities')
 }
 return {async verify(repeated=false){
  const rows=await committed()
  assert.equal(rows.length,3,'Two expired tables and one expired field each commit an audit fact')
  assert.deepEqual(rows.map(row=>JSON.parse(row.subject_json).recordId).sort(),[...expired].sort(),'Unexpired field and table custody commit no purge audit')
  assert.ok(rows.every(row=>row.actor_kind==='system'))
  for(const row of rows){
   assert.equal(JSON.parse(row.subject_json).appId,row.app_id)
   const command=await h.db.prepare('SELECT state,action,app_id FROM command_admissions WHERE command_id=?').bind(row.command_id).first()
   assert.deepEqual(command,{state:'committed',action,app_id:row.app_id},'Each audit identity belongs to a committed purge command')
   for(const key of ['changes_json','source_ids_json','personal_refs_json'])assert.deepEqual(JSON.parse(row[key]),[],key+' carries no purged content')
  }
  if(repeated)assert.deepEqual(rows,first,'Another scheduled tick commits no duplicate audit facts')
  else first=rows
  const expected=[...new Map(rows.map(row=>[row.command_id+':'+row.action+':'+row.app_id,{...row}])).values()]
  assert.equal(expected.length,2,'One purge command per affected base')
  // Pick the first physical audit identity independently of the log SQL.
  for(const event of expected)event.id=rows.filter(row=>row.command_id===event.command_id&&row.action===event.action&&row.app_id===event.app_id).map(row=>row.id).sort()[0]
  const log=[];let cursor='0'
  do{const page=(await h.request(endpoint+'?cursor='+cursor)).data;log.push(...page.items);cursor=page.nextCursor}while(cursor!==null)
  check(log.filter(row=>[cycleApp,appId].includes(row.baseId)),expected,'log')
  for(const base of [cycleApp,appId]){
   const selected=expected.filter(row=>row.app_id===base),times=selected.map(row=>row.created_at).sort()
   const query=new URLSearchParams({base,from:times[0],to:times.at(-1)})
   const filtered=(await h.request(endpoint+'?'+query)).data.items
   assert.equal(filtered.length,selected.length,'Base and exact-time filters exclude other activity')
   check(filtered,selected,'filtered log')
   for(const format of ['json','csv']){
    const response=await fetch(h.origin+endpoint+'?'+query+'&format='+format,{headers:{cookie:h.cookie}})
    assert.equal(response.status,200)
    let items
    if(format==='json')items=(await response.json()).data.items
    else{const csv=parseCsv(new Uint8Array(await response.arrayBuffer()));items=csv.rows.map(row=>Object.fromEntries(csv.headers.map((key,index)=>[key,row[index]])))}
    assert.equal(items.length,selected.length,format+' retains the requested base and time filters')
    check(items,selected,format)
   }
   const before=new Date(Date.parse(times[0])-1).toISOString(),outside=new URLSearchParams({base,from:before,to:before})
   assert.ok(!(await h.request(endpoint+'?'+outside)).data.items.some(row=>row.action===action),'Time filters exclude the purge before its committed timestamp')
  }
  console.log('SCHEMA_PURGE_AUDIT PASS committed field and table identities, owner log, filtered CSV and JSON, metadata only, retained custody and '+(repeated?'repeat suppression':'first tick'))
 }}
}
