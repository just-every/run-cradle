import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'

export async function restFieldTypesJourney(h){
 const appId=createUlid(),entityId=createUlid(),ids=Object.fromEntries(['name','email','rating','duration','phone','text','number','date','instant','money','boolean','select','multi_select','url','person','one','many','attachment','computed'].map(name=>[name,createUlid()])),options=[{id:createUlid(),label:'First'},{id:createUlid(),label:'Second'}]
 const field=(name,type,extra={})=>({id:ids[name],label:name,type,required:false,unique:false,...extra})
 const fields=[field('name','text',{required:true,unique:true}),...['email','rating','duration','phone','text','number','date','instant','money','boolean','url','person','attachment'].map(type=>field(type,type)),...['select','multi_select'].map(type=>field(type,type,{options})),...['one','many'].map(cardinality=>field(cardinality,'relation',{relation:{ownerAppId:appId,entityId,cardinality,onDelete:'restrict'}})),field('computed','computed',{readOnly:true,resultType:'number',expression:{kind:'call',fn:'multiply',args:[{kind:'field',fieldId:ids.number},{kind:'literal',value:'2',valueType:'number'}]}})]
 const draft={appId,name:'synthetic-cradle-601 typed REST',tables:[{id:entityId,label:'Typed items',primaryFieldId:ids.name,fields}]}
 const preview=(await h.request('/api/v1/records/schema-preview',{method:'POST',body:draft})).data
 await h.request('/api/v1/commands/release.adopt',{method:'POST',body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}}})
 const schema=(await h.request(`/api/v1/apps/${appId}/entities`)).data.items.find(row=>row.id===entityId)
 const key=(await h.request('/api/user-keys',{method:'POST',status:201,body:{appId,entityId,expiresAt:new Date(Date.now()+86400000).toISOString(),commandId:createUlid(),name:'synthetic-cradle-602 typed key',permissions:'write'}})).data.key
 const document=await h.request(`/api/v1/apps/${appId}/openapi.json`,{secret:key.secret})
 const operations=Object.entries(document.paths).flatMap(([path,methods])=>Object.entries(methods).map(([method,operation])=>({path,method:method.toUpperCase(),operation})))
 const validator=new Ajv2020({allErrors:true});addFormats(validator)
 const endpoint=name=>{const item=operations.find(item=>item.operation['x-cradle-operation']===name&&item.operation['x-cradle-entityId']===entityId);assert.ok(item,`OpenAPI supplies ${name}`);return item}
 const requestValidator=name=>validator.compile(endpoint(name).operation.requestBody.content['application/json'].schema)
 const call=async(name,{id,body,status=200}={})=>{
  const item=endpoint(name)
  if(status===200&&body){const validate=requestValidator(name);assert.equal(validate(body),true,JSON.stringify(validate.errors))}
  const result=await h.request(item.path.replace('{recordId}',id??''),{method:item.method,secret:key.secret,body,status})
  if(status===200){const validate=validator.compile(item.operation.responses['200'].content['application/json'].schema);assert.equal(validate(result),true,JSON.stringify(validate.errors))}
  return result.data
 }
 const create=values=>call('create',{body:{commandId:createUlid(),schemaVersion:schema.version,values}})
 const peerA=(await create({[ids.name]:'synthetic-cradle-603 peer A'})).result.value.rows[0],peerB=(await create({[ids.name]:'synthetic-cradle-604 peer B'})).result.value.rows[0]
 const firstValues={
  [ids.name]:'synthetic-cradle-605 typed record',[ids.email]:['synthetic-cradle-606','example.test'].join('@'),[ids.rating]:'5',[ids.duration]:'3661',[ids.phone]:'(555) 123-4567',
  [ids.text]:'synthetic-cradle-607\n**Rich words** and <strong>literal markup</strong>',[ids.number]:'12.3400',[ids.date]:'2026-02-28',[ids.instant]:'2026-02-28T12:34:56.000Z',
  [ids.money]:{minor:'12345',currency:'USD',scale:2},[ids.boolean]:true,[ids.select]:options[0].id,[ids.multi_select]:options.map(option=>option.id),[ids.url]:'https://example.test/synthetic-cradle-608',
  [ids.person]:h.operator,[ids.one]:peerA.ref,[ids.many]:[peerA.ref,peerB.ref],[ids.attachment]:[],
 }
 let row=(await create(firstValues)).result.value.rows[0]
 const expectedFirst={...firstValues,[ids.phone]:'+15551234567',[ids.number]:'12.34',[ids.computed]:'24.68'}
 const values=record=>Object.fromEntries(Object.entries(record.fields).map(([id,cell])=>{assert.equal(cell.state,'value',`Typed field ${id} is available`);return[id,cell.value]}))
 assert.deepEqual(values(row),expectedFirst,'Create returns every writable field with independent expected normalizations and a computed result')
 assert.deepEqual(values(await call('get',{id:row.id})),expectedFirst,'Get preserves the entire typed record')
 const firstPage=await call('query',{body:{limit:10,filter:{kind:'all',conditions:[{kind:'condition',fieldId:ids.number,op:'after',value:'10'},{kind:'condition',fieldId:ids.boolean,op:'eq',value:true}]}}})
 assert.equal(firstPage.total.value,1);assert.deepEqual(firstPage.items.map(item=>values(item)),[expectedFirst])
 const changed={
  [ids.name]:'synthetic-cradle-609 changed record',[ids.email]:['synthetic-cradle-610','example.test'].join('@'),[ids.rating]:'4',[ids.duration]:'7200',[ids.phone]:'+44 20 7946 0123',
  [ids.text]:'synthetic-cradle-611\nSecond paragraph',[ids.number]:'99.500',[ids.date]:'2024-02-29',[ids.instant]:'2024-02-29T23:59:59.000Z',[ids.money]:{minor:'-678',currency:'EUR',scale:2},
  [ids.boolean]:false,[ids.select]:options[1].id,[ids.multi_select]:[options[1].id],[ids.url]:'http://example.test/synthetic-cradle-612',[ids.person]:h.operator,[ids.one]:peerB.ref,[ids.many]:[peerB.ref,peerA.ref],[ids.attachment]:[],
 }
 const update=changes=>({commandId:createUlid(),version:row.version,changes})
 row=(await call('update',{id:row.id,body:update(changed)})).result.value.rows[0]
 const expectedChanged={...changed,[ids.phone]:'+442079460123',[ids.number]:'99.5',[ids.computed]:'199'}
 assert.deepEqual(values(row),expectedChanged);assert.deepEqual(values(await call('get',{id:row.id})),expectedChanged)
 const secondPage=await call('query',{body:{limit:10,filter:{kind:'condition',fieldId:ids.select,op:'eq',value:options[1].id},sort:[{fieldId:ids.number,direction:'desc'}]}})
 assert.equal(secondPage.total.value,1);assert.deepEqual(secondPage.items.map(item=>values(item)),[expectedChanged],'Query returns changed typed values, including ordered links and selections')
 const invalid=[
  [ids.name,false],[ids.text,42],[ids.email,'invalid address'],[ids.rating,'6'],[ids.duration,'1.5'],[ids.phone,'synthetic-cradle-invalid-phone'],[ids.number,'not a number'],[ids.date,'2026-02-30'],[ids.instant,'2026-02-28T12:34:56+01:00'],
  [ids.money,{minor:'1.2',currency:'USD',scale:2}],[ids.boolean,'false'],[ids.select,createUlid()],[ids.multi_select,[options[0].id,options[0].id]],[ids.url,'file:///synthetic-cradle-613'],[ids.person,'not a person id'],
  [ids.one,{...peerA.ref,appId:createUlid()}],[ids.many,[{...peerA.ref,recordId:createUlid()}]],
 ]
 for(const [fieldId,value]of invalid){
  const commandId=createUlid(),body={commandId,version:row.version,changes:{[ids.text]:'synthetic-cradle-614 must not change',[ids.boolean]:true,[fieldId]:value}}
  await call('update',{id:row.id,status:400,body})
  assert.deepEqual(values(await call('get',{id:row.id})),expectedChanged,'Invalid typed input refuses unrelated valid changes too')
  assert.equal(await h.db.prepare('SELECT count(*) n FROM command_admissions WHERE command_id=?').bind(commandId).first('n'),0)
 }
 const computedWrite=update({[ids.text]:'synthetic-cradle-615 must not change',[ids.computed]:'0'}),computedValid=requestValidator('update')
 assert.equal(computedValid(computedWrite),false,'The generated write document excludes computed fields')
 await call('update',{id:row.id,status:403,body:computedWrite})
 assert.deepEqual(values(await call('get',{id:row.id})),expectedChanged,'A computed-field write changes nothing')
 const cleared=Object.fromEntries(fields.filter(field=>!['name','computed'].includes(field.label)).map(field=>[field.id,null]))
 row=(await call('update',{id:row.id,body:update(cleared)})).result.value.rows[0]
 const expectedCleared={...cleared,[ids.name]:expectedChanged[ids.name],[ids.multi_select]:[],[ids.many]:[],[ids.attachment]:[]}
 const read=await call('get',{id:row.id})
 for(const [id,value]of Object.entries(expectedCleared)){assert.equal(read.fields[id].state,'value');assert.deepEqual(read.fields[id].value,value)}
 assert.equal(read.fields[ids.computed].state,'unavailable','An empty numeric source does not invent a computed result')
}
