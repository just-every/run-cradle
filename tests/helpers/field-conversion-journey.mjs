import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {parseCsv} from '../../src/domains/portability/csv.ts'
import {userAutomationRuntime} from './user-automation-runtime.mjs'
import {baseHttpSession} from './base-http-session.mjs'

const schemaEntity='00000000000000000000000001'
const field=(id,label,type,extra={})=>({id,label,type,required:false,unique:false,...extra})
const money=minor=>({minor,currency:'USD',scale:2})

function conversionCases(owner){
 const options=['Ready','Done','Missing','Duplicate','ready'].map(label=>({id:createUlid(),label}))
 const reference={reference:{provider:'chest',itemId:'synthetic-cradle-301',name:'synthetic-cradle-301.pdf',mediaType:'application/pdf',size:12,modifiedAt:null,link:'https://files.example.test/synthetic-cradle-301',connectionId:null,attachedBy:owner}}
 return [
  {name:'text/select',from:'text',to:'select',options:options.slice(0,2),values:['Ready','Done','ready','Missing',null],after:[options[0].id,options[1].id,null,null,null],losses:[2,3],roles:true},
  {name:'select/text',from:'select',to:'text',options:options.slice(0,2),values:[options[0].id,options[1].id,null],after:['Ready','Done',null],losses:[]},
  {name:'select/relation',from:'select',to:'relation',options,targets:['Ready','Duplicate','Duplicate'],values:[options[0].id,options[2].id,options[3].id,options[4].id,null],after:targets=>[targets[0].ref,null,null,null,null],losses:[1,2,3]},
  {name:'number/money',from:'number',to:'money',values:['12.34','-0.01','9007199254740993.01','1.005',null],after:[money('1234'),money('-1'),money('900719925474099301'),null,null],losses:[3]},
  {name:'money/number',from:'money',to:'number',values:[money('1234'),money('-1'),money('900719925474099301'),{minor:'1234',currency:'EUR',scale:2},null],after:['12.34','-0.01','9007199254740993.01',null,null],losses:[3]},
  {name:'text/date',from:'text',to:'date',values:['2026-10-23','10/23/2026','2/29/2024','2/29/2025','2026-02-30',null],after:['2026-10-23','2026-10-23','2024-02-29',null,null,null],losses:[3,4]},
  {name:'date/text',from:'date',to:'text',values:['2026-10-23','2024-02-29',null],after:['2026-10-23','2024-02-29',null],losses:[]},
  {name:'text/number',from:'text',to:'number',values:['12.3400','-0.50','9007199254740993.125','not a number',null],after:['12.34','-0.5','9007199254740993.125',null,null],losses:[3],dependencies:true,stale:true},
  {name:'number/text',from:'number',to:'text',values:['12.34','-0.5','9007199254740993.125',null],after:['12.34','-0.5','9007199254740993.125',null],losses:[]},
  {name:'attachment/text',from:'attachment',to:'text',values:[[reference]],refused:true},
  {name:'text/attachment',from:'text',to:'attachment',values:['Preserve this'],refused:true},
  {name:'computed/text',from:'computed',to:'text',values:[],computed:true,refused:true},
  {name:'text/computed',from:'text',to:'computed',values:['Preserve this'],refused:true},
  {name:'text/boolean',from:'text',to:'boolean',values:['true'],refused:true},
 ]
}

/** One matrix registration; all schema, data, history and recovery observations
 * go through the emitted Worker, with a separate owned base for each mapping. */
export async function fieldConversionJourney(existing){
 const h=existing??await userAutomationRuntime(0),failures=[]
 try{
  const owner=(await h.db.prepare('SELECT principal_id FROM cradle_base_operators WHERE base_id=(SELECT id FROM oa_operators WHERE email=?)').bind('import-owner@example.test').first()).principal_id
  for(const fixture of conversionCases(owner))try{await conversionCase(h,fixture)}catch(error){failures.push(new Error(`FIELD_CONVERSION ${fixture.name}: ${error.message}`,{cause:error}))}
  try{await invalidLookupSource(h)}catch(error){failures.push(new Error(`FIELD_LOOKUP_SOURCE: ${error.message}`,{cause:error}))}
 }finally{if(!existing)await h.close()}
 if(failures.length)throw new AggregateError(failures,'Field conversion public-door matrix failed')
}

async function conversionCase(h,fixture){
 const appId=createUlid(),entityId=createUlid(),nameId=createUlid(),valueId=createUlid(),targetId=createUlid(),targetName=createUlid()
 const source=field(valueId,'Value',fixture.from,{...(['select','multi_select'].includes(fixture.from)?{options:fixture.options}:{}),...(fixture.computed?{readOnly:true,resultType:'text',expression:{kind:'field',fieldId:nameId}}:{})})
 const draft={appId,name:'synthetic-cradle-302 '+fixture.name,tables:[{id:entityId,label:'Items',primaryFieldId:nameId,fields:[field(nameId,'Name','text',{required:true}),source]}]}
 if(fixture.targets||fixture.roles)draft.tables.push({id:targetId,label:'Targets',primaryFieldId:targetName,fields:[field(targetName,'Target','text',{required:true})]})
 const preview=async body=>(await h.request('/api/v1/records/schema-preview',{method:'POST',body})).data
 const adopt=async(p,status=200)=>h.request('/api/v1/commands/release.adopt',{method:'POST',status,body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:p.id}}})
 const readDraft=async()=>(await h.request(`/api/v1/records/bases/${appId}`)).data
 const read=async row=>(await h.request(`/api/v1/apps/${appId}/entities/${entityId}/records/${row.id}`)).data.record
 const history=async row=>(await h.request(`/api/v1/history?appId=${appId}&entityId=${entityId}&recordId=${row.id}`)).data.items
 async function create(table,values){
  const schema=(await h.request(`/api/v1/apps/${appId}/entities/${table}`)).data
  return (await h.request('/api/v1/commands/record.create',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId,entityId:schemaEntity,recordId:table},version:schema.version}],input:{appId,entityId:table,values}}})).data.value
 }
 await adopt(await preview(draft))
 const targets=[];for(const label of fixture.targets??[])targets.push(await create(targetId,{[targetName]:label}))
 if(fixture.roles)await create(targetId,{[targetName]:'synthetic-cradle-340'})
 const rows=[],beforeHistory=[]
 for(const [index,value] of (fixture.computed?[undefined]:fixture.values).entries()){
  const row=await create(entityId,{[nameId]:`synthetic-cradle-${310+index}`,...(fixture.computed?{}:{[valueId]:value})})
  rows.push(row);beforeHistory.push(await history(row))
  assert.ok(beforeHistory.at(-1).some(item=>item.action==='record.create'),'The fixture has an original record history entry to preserve')
  assert.deepEqual(row.fields[valueId].value,fixture.computed?'synthetic-cradle-310':value,'The source record stores the exact fixture value')
 }
 const dependencies=[]
 if(fixture.dependencies){
  const schema=(await h.request(`/api/v1/apps/${appId}/entities/${entityId}`)).data,expected=[{ref:{appId,entityId:schemaEntity,recordId:entityId},version:schema.version}]
  for(const [kind,input] of [['view',{view:{appId,entityId,name:'synthetic-cradle-320',display:'grid',fields:[nameId,valueId],filter:{kind:'all',conditions:[]},sort:[],groupBy:[],layout:{titleFieldId:nameId},visibility:'app',shipped:false}}],['form',{form:{appId,entityId,title:'synthetic-cradle-321',fields:[{fieldId:nameId,label:'Name',help:'',required:true},{fieldId:valueId,label:'Value',help:'',required:false}],submitAction:'record.create',authenticated:true}}]]){
   const saved=(await h.request(`/api/v1/commands/${kind}.save`,{method:'POST',body:{commandId:createUlid(),expected,input}})).data.value
   dependencies.push({kind,id:saved.id,name:kind==='view'?saved.name:saved.title})
  }
 }
 const edit=await readDraft(),destination=field(valueId,'Value',fixture.to,{...(fixture.to==='select'?{options:fixture.options}:{}),...(fixture.to==='relation'?{relation:{ownerAppId:appId,entityId:targetId,cardinality:'one',onDelete:'restrict'}}:{}),...(fixture.to==='computed'?{readOnly:true,resultType:'number',expression:{kind:'literal',value:'1',valueType:'number'}}:{})})
 edit.tables.find(table=>table.id===entityId).fields=edit.tables.find(table=>table.id===entityId).fields.map(item=>item.id===valueId?destination:item)
 let review=await preview(edit)
 const actors=fixture.roles?await reviewActors(h,appId):null
 if(actors){
  review=(await actors.creator('/api/v1/records/schema-preview',edit)).data
  assert.equal(review.requiresOwnerReview,true,'A creator loss conversion is saved for owner review')
  await actors.creator('/api/v1/commands/release.adopt',{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:review.id}},403)
  await actors.editor('/api/v1/records/schema-preview',edit,403)
  assert.equal((await read(rows[2])).fields[valueId].value,fixture.values[2],'A creator cannot apply the lossy conversion before owner review')
 }
 if(fixture.stale){
  // Data, schema and policy fences are independent; each old review must fail
  // atomically before a fresh conversion preview can be adopted.
  const first=await read(rows[0]);await h.patch(first,{[nameId]:'synthetic-cradle-322'});await adopt(review,409)
  assert.deepEqual((await read(rows[0])).fields[valueId].value,fixture.values[0])
  review=await preview(edit)
  const rename=await readDraft();rename.tables.find(table=>table.id===entityId).label='Renamed items';await adopt(await preview(rename));await adopt(review,409)
  const refreshed=await readDraft();refreshed.tables.find(table=>table.id===entityId).fields=refreshed.tables.find(table=>table.id===entityId).fields.map(item=>item.id===valueId?destination:item)
  review=await preview(refreshed)
  await h.db.prepare('UPDATE authority_policies SET version=version+1 WHERE app_id=?').bind(appId).run()
  await adopt(review,409);review=await preview(refreshed)
 }
 const impact=review.impacts.find(item=>item.entityId===entityId);assert.ok(impact)
 const conversion=impact.conversions.find(item=>item.fieldId===valueId);assert.ok(conversion)
 assert.deepEqual([conversion.label,conversion.from,conversion.to],['Value',fixture.from,fixture.to])
 assert.ok(Array.isArray(impact.refusals));assert.ok(Array.isArray(impact.dependencies))
 for(const expected of dependencies){const found=impact.dependencies.find(item=>item.kind===expected.kind&&item.id===expected.id);assert.ok(found,expected.kind+' dependency is named in review');assert.equal(found.name,expected.name);assert.ok(found.details?.length>0)}
 if(fixture.refused){
  assert.equal(typeof conversion.refusal,'string');assert.ok(conversion.refusal.length>0);assert.ok(impact.refusals.includes(conversion.refusal))
  const refused=await adopt(review,400);assert.equal(refused.error.code,'validation')
  assert.equal((await readDraft()).tables.find(table=>table.id===entityId).fields.find(item=>item.id===valueId).type,fixture.from)
  for(const row of rows)assert.deepEqual((await read(row)).fields[valueId],row.fields[valueId],'Refused adoption preserves stored and computed values, including attachment custody')
  console.log('FIELD_CONVERSION_REFUSED '+fixture.name+' PASS');return
 }
 assert.equal(conversion.refusal,undefined);assert.deepEqual(impact.refusals,[])
 const after=typeof fixture.after==='function'?fixture.after(targets):fixture.after
 assert.equal(conversion.losses.length,fixture.losses.length,'Loss count is exact')
 assert.equal(conversion.converted.length,rows.length-fixture.losses.length,'Every source row is classified exactly once')
 for(const [index,row] of rows.entries()){
  if(fixture.losses.includes(index)){
   const loss=conversion.losses.find(item=>item.recordId===row.id);assert.ok(loss);assert.deepEqual(loss.value,fixture.values[index]);assert.equal(typeof loss.valueLabel,'string');assert.ok(loss.reason.length>0)
   if(fixture.from==='select')assert.equal(loss.valueLabel,fixture.options.find(option=>option.id===fixture.values[index]).label,'A lost select example names its human label')
  }else{
   const changed=conversion.converted.find(item=>item.recordId===row.id);assert.ok(changed);assert.deepEqual(changed.before,fixture.values[index]);assert.deepEqual(changed.after,after[index]);assert.equal(typeof changed.beforeLabel,'string');assert.equal(typeof changed.afterLabel,'string')
   if(fixture.from==='select'&&fixture.values[index]!==null)assert.equal(changed.beforeLabel,fixture.options.find(option=>option.id===fixture.values[index]).label)
   if(fixture.to==='select'&&after[index]!==null)assert.equal(changed.afterLabel,fixture.options.find(option=>option.id===after[index]).label)
  }
 }
 const release=(await adopt(review)).data.value
 const schema=(await h.request(`/api/v1/apps/${appId}/entities/${entityId}`)).data
 assert.equal(schema.id,entityId);assert.equal(schema.fields.find(item=>item.id===valueId).type,fixture.to)
 for(const [index,row] of rows.entries()){
  const result=await read(row);assert.equal(result.id,row.id);assert.equal(result.createdAt,row.createdAt);assert.deepEqual(result.fields[valueId].value,after[index],'Adoption stores the exact reviewed value; losses become null')
  const retained=await history(row);for(const entry of beforeHistory[index])assert.ok(retained.some(item=>item.id===entry.id),'Original record history survives conversion')
 }
 const recovery=(await h.request(`/api/v1/records/releases/${release.releaseId}/recovery`)).data,table=recovery.tables.find(item=>item.entityId===entityId)
 const csv=parseCsv(new TextEncoder().encode(table.csv)),column=csv.headers.indexOf('Value');assert.ok(column>=0);assert.equal(csv.rows.length,rows.length)
 assert.deepEqual(recovery.priorSchemas.find(item=>item.id===entityId).fields.find(item=>item.id===valueId),source,'Recovery retains original field semantics and option identities')
 for(const [index,row] of rows.entries()){
  const original=csv.rows.find(item=>item[0]===row.id);assert.ok(original,'Recovery is keyed by the original record ID')
  const value=fixture.values[index]
  if(value===null)assert.equal(original[column],'\\N')
  else if(typeof value==='object')assert.deepEqual(JSON.parse(original[column]),value,'Recovery preserves canonical money minor units, currency and scale')
  else assert.equal(original[column],fixture.from==='select'?fixture.options.find(option=>option.id===value).label:value,'Recovery exports the original value, including every lost example')
 }
 console.log('FIELD_CONVERSION '+fixture.name+' PASS converted='+conversion.converted.length+' losses='+conversion.losses.length)
 if(actors){
  const removal=await readDraft();removal.tables=removal.tables.filter(table=>table.id!==targetId)
  const pending=(await actors.creator('/api/v1/records/schema-preview',removal)).data
  assert.equal(pending.requiresOwnerReview,true,'A creator table deletion requires owner review even though the other table survives')
  await actors.creator('/api/v1/commands/release.adopt',{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:pending.id}},403)
  await actors.editor('/api/v1/records/schema-preview',removal,403)
  assert.ok((await readDraft()).tables.some(table=>table.id===targetId))
  await adopt(pending)
  await h.request(`/api/v1/apps/${appId}/entities/${targetId}`,{status:404})
  assert.deepEqual((await read(rows[0])).fields[valueId].value,after[0],'Owner-reviewed table deletion preserves the surviving converted table')
  console.log('FIELD_OWNER_REVIEW PASS creator lossy conversion/table deletion, editor refusal, owner adoption of exact previews')
 }
}

async function reviewActors(h,appId){
 const actors={}
 for(const [index,role] of ['creator','editor'].entries()){
  const id=createUlid(),email=`synthetic-cradle-${350+index}-${id.toLowerCase()}@example.test`
  // Native account fixtures use the production projection trigger; role grants,
  // sign-in, CSRF, preview and adoption all cross the actual public HTTP doors.
  await h.db.prepare("INSERT INTO oa_operators(id,email,display_name,role,status,created_at) VALUES(?,?,?,'member','active',?)").bind(id,email,`synthetic-cradle-${350+index}`,Date.now()).run()
  const principal=(await h.db.prepare('SELECT principal_id FROM cradle_base_operators WHERE base_id=?').bind(id).first()).principal_id
  await h.request(`/api/v1/records/bases/${appId}/collaborators`,{method:'POST',body:{commandId:createUlid(),principalId:principal,role,destructive:false,version:0}})
  const signed=await baseHttpSession(h.origin,email)
  actors[role]=async(route,body,status=200)=>{
   const response=await fetch(h.origin+route,{method:'POST',headers:{cookie:signed.cookie,origin:h.origin,'content-type':'application/json','x-csrf-token':signed.csrfToken},body:JSON.stringify(body)}),value=await response.json()
   assert.equal(response.status,status,`${role} ${route}: ${value.error?.code??'unexpected response'}`)
   return value
  }
 }
 return actors
}

async function invalidLookupSource(h){
 const appId=createUlid(),target=createUlid(),targetName=createUlid(),source=createUlid(),items=createUlid(),name=createUlid(),link=createUlid(),lookup=createUlid()
 const draft={appId,name:'synthetic-cradle-360',tables:[{id:target,label:'Targets',primaryFieldId:targetName,fields:[field(targetName,'Name','text'),field(source,'Source','text')]},{id:items,label:'Items',primaryFieldId:name,fields:[field(name,'Name','text'),field(link,'Target','relation',{relation:{ownerAppId:appId,entityId:target,cardinality:'one',onDelete:'restrict'}}),field(lookup,'Lookup','computed',{readOnly:true,resultType:'text',expression:{kind:'rollup',aggregate:'lookup',relationFieldId:link,valueFieldId:source}})]}]}
 const command=(previewId)=>({commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId}})
 const initial=(await h.request('/api/v1/records/schema-preview',{method:'POST',body:draft})).data
 await h.request('/api/v1/commands/release.adopt',{method:'POST',body:command(initial.id)})
 async function create(entityId,values){const schema=(await h.request(`/api/v1/apps/${appId}/entities/${entityId}`)).data;return (await h.request('/api/v1/commands/record.create',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId,entityId:schemaEntity,recordId:entityId},version:schema.version}],input:{appId,entityId,values}}})).data.value}
 const parent=await create(target,{[targetName]:'synthetic-cradle-361',[source]:'synthetic-cradle-362'}),child=await create(items,{[name]:'synthetic-cradle-363',[link]:parent.ref})
 const edit=(await h.request(`/api/v1/records/bases/${appId}`)).data;edit.tables.find(table=>table.id===target).fields=edit.tables.find(table=>table.id===target).fields.filter(field=>field.id!==source)
 const review=(await h.request('/api/v1/records/schema-preview',{method:'POST',body:edit})).data,impact=review.impacts.find(item=>item.entityId===target)
 assert.ok(impact.refusals.length>0,'Removing a retained lookup source is explicitly refused in review')
 const dependency=impact.dependencies.find(item=>item.kind==='lookup'&&item.id===items+':'+lookup);assert.ok(dependency);assert.ok(dependency.details.some(detail=>detail.includes(source)))
 const refused=await h.request('/api/v1/commands/release.adopt',{method:'POST',status:400,body:command(review.id)});assert.equal(refused.error.code,'validation')
 const still=(await h.request(`/api/v1/records/bases/${appId}`)).data;assert.ok(still.tables.find(table=>table.id===target).fields.some(field=>field.id===source))
 const record=(await h.request(`/api/v1/apps/${appId}/entities/${items}/records/${child.id}`)).data.record;assert.equal(record.fields[lookup].value,'synthetic-cradle-362');assert.deepEqual(record.fields[link].value,parent.ref)
 console.log('FIELD_LOOKUP_SOURCE PASS retained dependent lookup blocks invalid source removal in preview and adoption')
}
