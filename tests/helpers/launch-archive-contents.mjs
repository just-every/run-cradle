import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import './typescript-loader.mjs'
const {createUlid}=await import('../../src/core/shared/ids.ts')
const {LAUNCH_APP_ID,launchEntities}=await import('../../src/apps/launch/contracts.ts')

/** Populate the archive's Launch inventory, using admitted writes and a retained AI fixture. */
export async function launchArchiveContents(h,headers){
 const command=async(path,input,expected=[])=>{
  const response=await h.post(path,{commandId:createUlid(),input,expected},headers)
  assert.equal(response.status,200,await response.clone().text())
  const {data}=await response.json();assert.equal(data.state,'committed');return data.value
 }
 const launch=(action,input,expected)=>command('/api/v1/commands/launch.'+action,input,expected)
 const ref=(kind,row)=>[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities[kind],recordId:row.id},version:row.version}]
 const owner=(await h.db.prepare('SELECT id FROM operators WHERE active=1 LIMIT 1').first()).id
 const campaign=await h.db.prepare('SELECT * FROM campaigns ORDER BY code LIMIT 1').first()
 const custom=await launch('custom-field.save',{field:{name:'Archive launch notes',type:'text'}})
 await launch('campaign.patch',{id:campaign.id,changes:{tags:['Release','Archive'],customFields:{[custom.id]:'Keep the café launch notes'}}},ref('campaign',campaign))
 await launch('deliverable.create',{fields:{campaignId:campaign.id,title:'Archive delivery',ownerId:owner,dueDate:null}})
 const milestones=(await h.db.prepare('SELECT id FROM milestones WHERE campaign_id=?').bind(campaign.id).all()).results
 const later=await launch('milestone.create',{fields:{campaignId:campaign.id,title:'Archive follow-up',ownerId:owner,type:'Review',status:'Not started',startDate:'2027-01-02',endDate:null,conflictReason:null}})
 // A dependency and two linked outcomes make an empty or flattened export observable.
 await h.db.prepare('INSERT INTO milestone_dependencies(id,created_at,updated_at,version,milestone_id,predecessor_id) VALUES(?,1,2,1,?,?)').bind(createUlid(),later.id,milestones[0].id).run()
 const fields={campaignId:campaign.id,riskId:null,supersedesId:null,title:'Archive approval',requesterId:owner,assigneeId:owner,priority:'High',dueAt:'2027-01-01T10:00:00.000Z',recommendation:'Proceed',impact:'Retain the launch history'}
 const decision=await launch('decision.create',{fields})
 const outcome=await launch('decision.outcome',{id:decision.id,outcome:'Approved',rationale:'Launch approved'},ref('decision',decision))
 await launch('decision.supersede',{id:outcome.id,fields:{...fields,title:'Replacement approval',supersedesId:outcome.id}},ref('decision',outcome))
 const current=await h.db.prepare('SELECT id,version FROM campaigns WHERE id=?').bind(campaign.id).first()
 await command('/api/v1/commands/comment.add',{subject:ref('campaign',current)[0].ref,body:'Archive the original launch context.',mentions:[]},ref('campaign',current))

 const originals=[]
 for(const [name,bytes]of [['launch.csv',Buffer.from('Code,Name\r\nMONEY-A,Imported café launch\r\n')],['launch-original.bin',Buffer.from([0,255,13,10,128,65])]]){
  const staged=await command('/api/v1/commands/source.stage',{appId:LAUNCH_APP_ID,purpose:'import'})
  const upload=await command('/api/v1/commands/upload.begin',{appId:LAUNCH_APP_ID,subject:staged.subject,filename:name,mediaType:name.endsWith('.csv')?'text/csv':'application/octet-stream',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')})
  const response=await h.request(upload.uploadUrl,{method:upload.method,headers:{...headers,...upload.headers},body:bytes})
  assert.equal(response.status,200,await response.clone().text())
  const file=await h.db.prepare('SELECT * FROM evidence_files WHERE id=?').bind(upload.file.id).first()
  assert.equal(file.state,'available');originals.push({key:file.object_key,bytes})
  if(name.endsWith('.csv')){
   const preview=await command('/api/v1/launch/imports/preview',{kind:'campaign',fileId:file.id,mapping:[{column:'Code',field:'code'},{column:'Name',field:'name'}]})
   assert.equal(preview.errors.length,0)
   await command('/api/v1/launch/imports/'+preview.id+'/commit',{token:preview.token})
  }
 }
 // Historical successful model output is data; no live-provider acceptance is claimed.
 const call=createUlid(),analysis=createUlid()
 await h.db.prepare("INSERT INTO launch_model_calls(id,created_at,updated_at,local_day,feature,model,state,input_tokens,output_tokens) VALUES(?,1,2,'2026-10-01','campaign-brief','synthetic-cradle-1','Succeeded',37,19)").bind(call).run()
 await h.db.prepare("INSERT INTO launch_analyses(id,created_at,updated_at,version,feature,subject_id,input_versions_json,model_call_id,content) VALUES(?,1,2,1,'campaign-brief',?,'[]',?,'Retained launch analysis')").bind(analysis,campaign.id,call).run()

 const tables=['workspace','workspace_settings','operators','campaigns','campaign_tags','launch_custom_fields','launch_custom_values','deliverables','milestones','milestone_dependencies','risks','decisions','lenses','evidence_comments','activity_entries','notifications','channel_deliveries','automations','automation_runs','portability_previews','portability_preview_rows','launch_analyses','launch_model_calls','evidence_files']
 const expected=new Map()
 for(const table of tables){
  const columns=(await h.db.prepare(`PRAGMA table_xinfo("${table}")`).all()).results.filter(column=>!column.hidden).map(column=>column.name)
  const rows=(await h.db.prepare(`SELECT ${columns.map(name=>'"'+name+'"').join(',')} FROM "${table}"`).all()).results
  assert.ok(rows.length,'Archive fixture must populate '+table)
  expected.set(table,rows.map(row=>{
   if(table==='operators')row.active=0
   if(table==='automations')row.enabled=0
   if(table==='automation_runs'&&['Queued','Running','Waiting'].includes(row.state))row.state='Cancelled'
   if(table==='portability_previews'){
    const preview=JSON.parse(row.preview_json);preview.token=null;preview.expiresAt=row.created_at;
    row.preview_json=JSON.stringify(preview);row.expires_at=row.created_at
   }
   return row
  }))
 }
 return records=>{
  const items=records.filter(record=>record.kind==='part').flatMap(record=>record.items)
  const normalized=rows=>rows.map(row=>JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a],[b])=>a.localeCompare(b))))).sort()
  for(const [table,rows]of expected)assert.deepEqual(normalized(items.filter(item=>item.kind==='row'&&item.table===table).map(item=>item.row)),normalized(rows),'DATA-001 every retained cell: '+table)
  for(const file of originals){
   const chunks=items.filter(item=>item.kind==='object'&&item.bucket==='FILES'&&item.key===file.key).sort((a,b)=>a.offset-b.offset)
   assert.deepEqual(Buffer.concat(chunks.map(chunk=>Buffer.from(chunk.data,'base64'))),file.bytes,'DATA-001 original import bytes: '+file.key)
  }
 }
}
