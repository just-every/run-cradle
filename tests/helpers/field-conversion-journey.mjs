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
  {name:'text/phone',from:'text',to:'phone',values:['(555) 123-4567','+442079460123','not a phone',null],after:['+15551234567','+442079460123',null,null],losses:[2]},
  {name:'phone/text',from:'phone',to:'text',values:['+15551234567','+442079460123',null],after:['+15551234567','+442079460123',null],losses:[]},
  {name:'required text/number',from:'text',to:'number',required:true,values:['not a number'],refused:true},
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
  try{await refusedTypePairs(h,owner)}catch(error){failures.push(new Error(`FIELD_TYPE_PAIRS: ${error.message}`,{cause:error}))}
  try{await completeDependentPreview(h)}catch(error){failures.push(new Error(`FIELD_DEPENDENTS: ${error.message}`,{cause:error}))}
  try{await linkedSelectConversion(h)}catch(error){failures.push(new Error(`FIELD_LINK_SELECT: ${error.message}`,{cause:error}))}
  try{await invalidLookupSource(h)}catch(error){failures.push(new Error(`FIELD_LOOKUP_SOURCE: ${error.message}`,{cause:error}))}
 }finally{if(!existing)await h.close()}
 if(failures.length)throw new AggregateError(failures,'Field conversion public-door matrix failed')
}

async function conversionCase(h,fixture){
 const appId=createUlid(),entityId=createUlid(),nameId=createUlid(),valueId=createUlid(),targetId=createUlid(),targetName=createUlid()
 const source=field(valueId,'Value',fixture.from,{...(['select','multi_select'].includes(fixture.from)?{options:fixture.options}:{}),...(fixture.required?{required:true}:{}),...(fixture.computed?{readOnly:true,resultType:'text',expression:{kind:'field',fieldId:nameId}}:{})})
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
 const edit=await readDraft(),destination=field(valueId,'Value',fixture.to,{...(fixture.required?{required:true}:{}),...(fixture.to==='select'?{options:fixture.options}:{}),...(fixture.to==='relation'?{relation:{ownerAppId:appId,entityId:targetId,cardinality:'one',onDelete:'restrict'}}:{}),...(fixture.to==='computed'?{readOnly:true,resultType:'number',expression:{kind:'literal',value:'1',valueType:'number'}}:{})})
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


/** Linked labels become options through the same reviewed release door. */
async function linkedSelectConversion(h){
 for(const cardinality of ['one','many']){
  const appId=createUlid(),items=createUlid(),name=createUlid(),link=createUlid(),targets=createUlid(),title=createUlid()
  const draft={appId,name:'synthetic-cradle-370 '+cardinality,tables:[{id:items,label:'Items',primaryFieldId:name,fields:[field(name,'Name','text'),field(link,'Contact','relation',{relation:{ownerAppId:appId,entityId:targets,cardinality,onDelete:'restrict'}})]},{id:targets,label:'Contacts',primaryFieldId:title,fields:[field(title,'Name','text')]}]}
  const preview=async body=>(await h.request('/api/v1/records/schema-preview',{method:'POST',body})).data
  const adopt=async p=>(await h.request('/api/v1/commands/release.adopt',{method:'POST',body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:p.id}}})).data.value
  await adopt(await preview(draft))
  async function create(entityId,values){const schema=(await h.request(`/api/v1/apps/${appId}/entities/${entityId}`)).data;return (await h.request('/api/v1/commands/record.create',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId,entityId:schemaEntity,recordId:entityId},version:schema.version}],input:{appId,entityId,values}}})).data.value}
  const parents=[];for(const label of ['Morgan Lee','Taylor Kim'])parents.push(await create(targets,{[title]:label}))
  const values=cardinality==='one'?[parents[0].ref,parents[1].ref,null]:[[parents[0].ref],[parents[0].ref,parents[1].ref],[]]
  const rows=[];for(const [index,value]of values.entries())rows.push(await create(items,{[name]:'synthetic-cradle-'+(371+index),[link]:value}))
  const next=(await h.request(`/api/v1/records/bases/${appId}`)).data
  next.tables.find(table=>table.id===items).fields=next.tables.find(table=>table.id===items).fields.map(value=>value.id===link?field(link,'Contact','select',{options:[{id:createUlid(),label:'Unassigned'}]}):value)
  const review=await preview(next),impact=review.impacts.find(item=>item.entityId===items),conversion=impact.conversions.find(value=>value.fieldId===link),options=review.schemas.find(table=>table.id===items).fields.find(value=>value.id===link).options
  assert.deepEqual(impact.refusals,[])
  assert.ok(options.some(option=>option.label==='Morgan Lee'),'A linked record label becomes an option in the exact reviewed schema')
  assert.equal(conversion.losses.length,cardinality==='many'?1:0)
  if(cardinality==='many'){assert.deepEqual(conversion.losses[0].value,values[1]);assert.match(conversion.losses[0].reason,/Multiple linked records/)}
  const release=await adopt(review)
  for(const [index,row]of rows.entries()){
   const current=(await h.request(`/api/v1/apps/${appId}/entities/${items}/records/${row.id}`)).data.record
   const expected=index===2||cardinality==='many'&&index===1?null:options.find(option=>option.label===(index===0?'Morgan Lee':'Taylor Kim')).id
   assert.equal(current.fields[link].value,expected,'Only the exact reviewed option is stored; multi-link losses are empty')
   const history=(await h.request(`/api/v1/history?appId=${appId}&entityId=${items}&recordId=${row.id}`)).data.items
   assert.ok(history.some(item=>item.action==='record.create'))
  }
  const recovery=(await h.request(`/api/v1/records/releases/${release.releaseId}/recovery`)).data,table=recovery.tables.find(value=>value.entityId===items),csv=parseCsv(new TextEncoder().encode(table.csv)),column=csv.headers.indexOf('Contact')
  for(const [index,row]of rows.entries()){
   const value=csv.rows.find(value=>value[0]===row.id)[column]
   if(values[index]===null)assert.equal(value,'\\N');else assert.deepEqual(JSON.parse(value),values[index],'Recovery retains every original link identity and collection member')
  }
  console.log('FIELD_LINK_SELECT '+cardinality+' PASS reviewed labels, explicit multi-link loss, identity/history and recovery')
 }
}


/** All six existing dependent kinds are named by the public impact preview. */
async function completeDependentPreview(h){
 const appId=createUlid(),items=createUlid(),name=createUlid(),value=createUlid(),formula=createUlid(),summary=createUlid(),summaryName=createUlid(),link=createUlid(),rollup=createUlid()
 const draft={appId,name:'synthetic-cradle-380',tables:[{id:items,label:'Items',primaryFieldId:name,fields:[field(name,'Name','text'),field(value,'Value','text'),field(formula,'Value formula','computed',{readOnly:true,resultType:'text',expression:{kind:'field',fieldId:value}})]},{id:summary,label:'Summary',primaryFieldId:summaryName,fields:[field(summaryName,'Name','text'),field(link,'Items','relation',{relation:{ownerAppId:appId,entityId:items,cardinality:'many',onDelete:'restrict'}}),field(rollup,'Value rollup','computed',{readOnly:true,resultType:'text',expression:{kind:'rollup',aggregate:'arrayjoin',relationFieldId:link,valueFieldId:value}})]}]}
 const preview=async body=>(await h.request('/api/v1/records/schema-preview',{method:'POST',body})).data
 const first=await preview(draft);await h.request('/api/v1/commands/release.adopt',{method:'POST',body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:first.id}}})
 const schema=(await h.request(`/api/v1/apps/${appId}/entities/${items}`)).data,expected=[{ref:{appId,entityId:schemaEntity,recordId:items},version:schema.version}]
 const view=(await h.request('/api/v1/commands/view.save',{method:'POST',body:{commandId:createUlid(),expected,input:{view:{appId,entityId:items,name:'Value view',display:'grid',fields:[name,value],filter:{kind:'all',conditions:[]},sort:[],groupBy:[],layout:{titleFieldId:name},visibility:'app',shipped:false}}}})).data.value
 const form=(await h.request('/api/v1/commands/form.save',{method:'POST',body:{commandId:createUlid(),expected,input:{form:{appId,entityId:items,title:'Value form',fields:[{fieldId:value,label:'Value',help:'',required:false}],submitAction:'record.create',authenticated:true}}}})).data.value
 const automation=(await h.request('/api/user-automations',{method:'POST',status:201,body:{commandId:createUlid(),expiresAt:new Date(Date.now()+86400000).toISOString(),definition:{name:'Value automation',appId,entityId:items,event:'created',enabled:false,actions:[{kind:'update',fieldId:value,value:'12'}]}}})).data.result.value
 const key=(await h.request('/api/user-keys',{method:'POST',status:201,body:{commandId:createUlid(),appId,entityId:items,name:'Value API key',permissions:'read',expiresAt:new Date(Date.now()+86400000).toISOString()}})).data.key
 try{
  const edit=(await h.request(`/api/v1/records/bases/${appId}`)).data;edit.tables.find(table=>table.id===items).fields=edit.tables.find(table=>table.id===items).fields.map(field=>field.id===value?{...field,type:'number'}:field)
  const review=await preview(edit),impact=review.impacts.find(item=>item.entityId===items)
  for(const [kind,id,name]of [['formula',items+':'+formula,'Items · Value formula'],['rollup',summary+':'+rollup,'Summary · Value rollup'],['view',view.id,'Value view'],['form',form.id,'Value form'],['automation',automation.id,'Value automation'],['api_key',key.id,'Value API key']]){
   const dependency=impact.dependencies.find(item=>item.kind===kind&&item.id===id)
   assert.ok(dependency,kind+' is named once by kind and identity');assert.equal(dependency.name,name);assert.equal(impact.dependencies.filter(item=>item.kind===kind&&item.id===id).length,1);assert.ok(dependency.details.length)
  }
  assert.ok(impact.refusals.some(reason=>reason.includes('Value formula')));assert.ok(impact.refusals.some(reason=>reason.includes('Value rollup')));assert.ok(impact.refusals.some(reason=>reason.includes('Value automation')))
  await h.request('/api/v1/commands/release.adopt',{method:'POST',status:400,body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:review.id}}})
  assert.equal((await h.request(`/api/v1/apps/${appId}/entities/${items}`)).data.fields.find(field=>field.id===value).type,'text','The incompatible dependent refusal preserves the original schema')
  console.log('FIELD_DEPENDENTS PASS formula, rollup, view, form, automation and API key names; refused adoption preserves schema')
 }finally{await h.request(`/api/user-keys/${key.id}/revoke`,{method:'POST',body:{commandId:createUlid(),appId}})}
}


/** Every ordered pair has either a substantive mapping fixture above or an
 * explicit preview refusal below. Grouping source fields keeps the journey small. */
async function refusedTypePairs(h,owner){
 const types=['email','rating','duration','text','phone','number','date','instant','money','boolean','select','multi_select','url','person','relation','attachment','computed']
 const mapped=new Set(['text/select','select/text','select/relation','relation/select','number/money','money/number','text/date','date/text','text/number','number/text','text/phone','phone/text'])
 let checked=0
 for(const from of types){
  const destinations=types.filter(to=>to!==from&&!mapped.has(from+'/'+to))
  const appId=createUlid(),items=createUlid(),name=createUlid(),targets=createUlid(),title=createUlid(),option=createUlid()
  const definitions=destinations.map(to=>({to,id:createUlid()}))
  const extras=type=>type==='select'||type==='multi_select'?{options:[{id:option,label:'Ready'}]}:type==='relation'?{relation:{ownerAppId:appId,entityId:targets,cardinality:'one',onDelete:'restrict'}}:type==='computed'?{readOnly:true,resultType:'text',expression:{kind:'field',fieldId:name}}:{}
  const draft={appId,name:'synthetic-cradle-390 '+from,tables:[{id:items,label:'Items',primaryFieldId:name,fields:[field(name,'Name','text'),...definitions.map(({to,id})=>field(id,from+' to '+to,from,extras(from)))]},{id:targets,label:'Targets',primaryFieldId:title,fields:[field(title,'Name','text')]}]}
  const preview=async body=>(await h.request('/api/v1/records/schema-preview',{method:'POST',body})).data
  const command=previewId=>({commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId}})
  await h.request('/api/v1/commands/release.adopt',{method:'POST',body:command((await preview(draft)).id)})
  async function create(entityId,values){const schema=(await h.request(`/api/v1/apps/${appId}/entities/${entityId}`)).data;return (await h.request('/api/v1/commands/record.create',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId,entityId:schemaEntity,recordId:entityId},version:schema.version}],input:{appId,entityId,values}}})).data.value}
  const target=await create(targets,{[title]:'synthetic-cradle-391'})
  const representative={email:'synthetic-cradle-395@example.test',rating:'4',duration:'3661',text:'12',phone:'+15551234567',number:'12.34',date:'2026-10-24',instant:'2026-10-24T00:00:00.000Z',money:money('1234'),boolean:true,select:option,multi_select:[option],url:'https://example.test/field',person:owner,relation:target.ref,attachment:[{reference:{provider:'chest',itemId:'synthetic-cradle-392',name:'synthetic-cradle-392.pdf',mediaType:'application/pdf',size:12,modifiedAt:null,link:'https://files.example.test/synthetic-cradle-392',connectionId:null,attachedBy:owner}}]}
  const rows=[]
  for(const populated of [true,false])rows.push(await create(items,{[name]:populated?'synthetic-cradle-393':'synthetic-cradle-394',...(from==='computed'?{}:Object.fromEntries(definitions.map(({id})=>[id,populated?representative[from]:null])))}))
  const read=async row=>(await h.request(`/api/v1/apps/${appId}/entities/${items}/records/${row.id}`)).data.record
  const originals=await Promise.all(rows.map(read)),originalSchema=(await h.request(`/api/v1/apps/${appId}/entities/${items}`)).data
  const releasesBefore=(await h.db.prepare('SELECT count(*) n FROM manual_record_releases WHERE app_id=?').bind(appId).first()).n
  const edit=(await h.request(`/api/v1/records/bases/${appId}`)).data
  edit.tables.find(table=>table.id===items).fields=[field(name,'Name','text'),...definitions.map(({to,id})=>field(id,from+' to '+to,to,extras(to)))]
  const review=await preview(edit),impact=review.impacts.find(item=>item.entityId===items)
  for(const {to,id}of definitions){
   const conversion=impact.conversions.find(item=>item.fieldId===id)
   assert.ok(conversion,from+'/'+to+' has an individual conversion result')
   assert.deepEqual([conversion.from,conversion.to],[from,to])
   assert.equal(typeof conversion.refusal,'string');assert.ok(conversion.refusal.length>0,from+'/'+to+' explains why the pair is refused in preview')
   assert.ok(impact.refusals.includes(conversion.refusal));assert.deepEqual(conversion.converted,[]);assert.deepEqual(conversion.losses,[])
   checked++
  }
  await h.request('/api/v1/commands/release.adopt',{method:'POST',status:400,body:command(review.id)})
  assert.deepEqual((await h.request(`/api/v1/apps/${appId}/entities/${items}`)).data,originalSchema,'Refused ordered pairs leave live schema untouched')
  assert.deepEqual(await Promise.all(rows.map(read)),originals,'Refused ordered pairs preserve every populated and empty source value')
  assert.equal((await h.db.prepare('SELECT count(*) n FROM manual_record_releases WHERE app_id=?').bind(appId).first()).n,releasesBefore,'Refused ordered pairs write no release')
  console.log('FIELD_TYPE_PAIRS '+from+' PASS '+destinations.length+' explicit pair refusals, populated/empty values and zero live writes')
 }
 assert.equal(checked+mapped.size,types.length*(types.length-1),'All 272 ordered different-type pairs are covered')
 console.log('FIELD_TYPE_MATRIX PASS '+mapped.size+' mapped pairs, '+checked+' explicitly refused pairs, 272/272 total')
}
