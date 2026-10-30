import {createHash} from 'node:crypto'
import {csvDownloadEntries} from './base-csv-download.mjs'
import assert from 'node:assert/strict'
import {recordsImportBrowserRuntime} from './records-import-browser-runtime.mjs'
import {workbookDoors} from './workbook-http.mjs'
import {workbook,workbookSheets,cell,ooxmlFixture,invalidWorkbooks} from './workbook-fixtures.mjs'
import {writeWorkbook} from '../../src/domains/records/workbooks/write.ts'
import {readWorkbook} from '../../src/domains/records/workbooks/read.ts'
import {sheetsProvider} from './sheets-provider.mjs'
import {sheetsJourney} from './sheets-journey.mjs'
export async function workbookJourney(){const provider=sheetsProvider(),h=await recordsImportBrowserRuntime(0,{outbound:request=>provider.fetch(request),bindings:{GOOGLE_CLIENT_ID:'synthetic-cradle-client-1',GOOGLE_CLIENT_SECRET:'synthetic-cradle-client-secret-1',CONNECTION_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')}})
 try{const d=await workbookDoors(h),bytes=workbook(),count=async()=>Number((await h.db.prepare('SELECT count(*) n FROM manual_record_bases').first()).n),before=await count()
  const preview=await d.call('/api/v1/records/base-import/preview',d.form(bytes,'synthetic-cradle.xlsx'));assert.equal(await count(),before);assert.equal(preview.schemaDraft.tables.length,2)
  const orders=preview.schemaDraft.tables[0],fields=Object.fromEntries(orders.fields.map(f=>[f.label,f]));assert.equal(fields.Amount.type,'number');assert.equal(fields.Approved.type,'boolean');assert.equal(fields.Company.type,'relation')
  const typed=await d.call('/api/v1/records/base-import/preview',d.form(ooxmlFixture(),'typed.xlsx'));const types=Object.fromEntries(typed.schemaDraft.tables[0].fields.map(f=>[f.label,f.type]));assert.deepEqual(types,{Key:'text',Formula:'number',Date:'date',Time:'instant',Checked:'boolean'});assert.ok(JSON.stringify(typed.records).includes('synthetic-cradle-shared'))
  for(const invalid of invalidWorkbooks()){const r=await d.raw('/api/v1/records/base-import/preview',d.form(invalid.bytes,invalid.name)),body=await r.json();assert.equal(r.status,400,JSON.stringify(body));assert.match(body.error.message,invalid.reason);assert.equal(await count(),before)}
  const ambiguous=workbookSheets();ambiguous[1].rows.push([cell('North'),cell('Sydney')]);const ambiguousPreview=await d.call('/api/v1/records/base-import/preview',d.form(writeWorkbook(ambiguous),'ambiguous.xlsx'));assert.ok(ambiguousPreview.report.diagnostics.some(x=>/ambig|duplicate/i.test(x.code+' '+x.message))||ambiguousPreview.report.tables.some(t=>t.links.some(l=>l.ambiguous>0)),'Repeated target labels are refused, never guessed')
  await d.adopt(bytes,'synthetic-cradle.xlsx',preview);const identity={appId:preview.identities.appId,entityId:orders.id},mapping=['Order','Amount','Due','Approved'].map(column=>({column,fieldId:fields[column].id})),query=()=>d.call(`/api/v1/apps/${identity.appId}/entities/${identity.entityId}/query`,{fields:mapping.map(m=>m.fieldId),sort:[{fieldId:fields.Order.id,direction:'asc'}]})
  assert.equal((await query()).items.length,2)
  const changed=workbookSheets();changed[0].rows[0][1]=cell('30','number');changed[0].rows.push([cell('synthetic-cradle-4'),cell('45','number'),cell('2026-10-25','date'),cell(true),cell('North')]);const merge=await d.call('/api/v1/records/import-preview',{...identity,workbook:{filename:'merge.xlsx',base64:Buffer.from(writeWorkbook(changed)).toString('base64'),sheet:'Orders'},mapping,mergeFieldId:fields.Order.id})
  assert.deepEqual([merge.creates,merge.updates,merge.unchanged],[1,1,1]);assert.equal(merge.rows.find(r=>r.operation==='update').before[fields.Amount.id],'12.5');assert.equal(merge.rows.find(r=>r.operation==='update').values[fields.Amount.id],'30')
  await d.command('records.import-commit',{previewId:merge.id});assert.equal((await query()).items.length,3)
  const view=(await d.command('view.save',{view:{...identity,name:'Workbook ordered view',display:'grid',fields:[fields.Approved.id,fields.Amount.id,fields.Order.id],filter:{kind:'all',conditions:[]},sort:[{fieldId:fields.Order.id,direction:'desc'}],groupBy:[],layout:{titleFieldId:fields.Order.id},visibility:'app',shipped:false}})).value
  const exported=await d.call('/api/v1/records/export-xlsx',{...identity,viewId:view.id,query:{}}),sheets=readWorkbook(Buffer.from(exported.content,'base64'),'view.xlsx');assert.deepEqual(sheets[0].headers,['Approved','Amount','Order']);assert.equal(sheets[0].rows[0][2].value,'synthetic-cradle-4');assert.equal(sheets[0].rows[0][0].value,true)
  const base=await d.call('/api/v1/records/base-export',{appId:identity.appId,format:'xlsx'});assert.equal(readWorkbook(Buffer.from(base.content,'base64'),'base.xlsx').length,2)
  const baseJson=JSON.parse((await d.call('/api/v1/records/base-export',{appId:identity.appId,format:'json'})).content)
  assert.equal(baseJson.base.tables.find(table=>table.id===identity.entityId).records.length,3,'Complete JSON includes every current record')
  const csvSet=await d.call('/api/v1/records/base-export',{appId:identity.appId,format:'csv-set'}),entries=csvDownloadEntries(Buffer.from(csvSet.content,'base64')),correspondence=JSON.parse(new TextDecoder().decode(entries.find(entry=>entry.name==='correspondence.json').bytes))
  assert.equal(correspondence.tables.length,baseJson.base.tables.length)
  for(const table of correspondence.tables){const file=entries.find(entry=>entry.name===table.filename);assert.ok(file);assert.equal(table.rows.length,baseJson.base.tables.find(source=>source.id===table.id).records.length);assert.equal(table.bytes,file.bytes.length);assert.equal(table.sha256,createHash('sha256').update(file.bytes).digest('hex'))}
  const reimport=await d.call('/api/v1/records/base-import/preview',d.form(Buffer.from(base.content,'base64'),'base.xlsx'));assert.equal(reimport.schemaDraft.tables[0].fields.find(f=>f.label==='Amount').type,'number')
  // A percent field leaves as a numeric cell with a percentage format and returns as a percent field, value unchanged.
  const rates=writeWorkbook([{name:'Rates',headers:['Name','Rate'],rows:[[cell('synthetic-cradle-r1'),{value:'0.25',type:'number',format:'percentage'}],[cell('synthetic-cradle-r2'),{value:'0.075',type:'number',format:'percentage'}]]}])
  const ratePreview=await d.call('/api/v1/records/base-import/preview',d.form(rates,'rates.xlsx')),rateField=ratePreview.schemaDraft.tables[0].fields.find(f=>f.label==='Rate');assert.equal(rateField.type,'number');assert.equal(rateField.numberFormat,'percent','A percentage-formatted column is a percent field')
  await d.adopt(rates,'rates.xlsx',ratePreview)
  const rateExport=await d.call('/api/v1/records/base-export',{appId:ratePreview.identities.appId,format:'xlsx'}),rateSheet=readWorkbook(Buffer.from(rateExport.content,'base64'),'rates.xlsx')[0]
  assert.deepEqual(rateSheet.rows.map(r=>[r[1].value,r[1].type,r[1].percent]).sort(),[['0.075','number',true],['0.25','number',true]],'Percent values are unchanged numeric cells with a percentage format')
  const returned=await d.call('/api/v1/records/base-import/preview',d.form(Buffer.from(rateExport.content,'base64'),'rates-return.xlsx'));assert.equal(returned.schemaDraft.tables[0].fields.find(f=>f.label==='Rate').numberFormat,'percent','The export returns as a percent field')
  const rateJson=await d.call('/api/v1/records/base-export',{appId:ratePreview.identities.appId,format:'json'});assert.equal(JSON.parse(rateJson.content).base.tables[0].fields.find(f=>f.label==='Rate').numberFormat,'percent')
  await sheetsJourney(h,d,provider,identity,fields,mapping)
  // Explicit create-only uses the same workbook door on a populated table.
  const fresh=await d.adopt(bytes,'synthetic-cradle-create-only.xlsx'),createIdentity={appId:fresh.preview.identities.appId,entityId:fresh.preview.schemaDraft.tables[0].id},createFields=Object.fromEntries(fresh.preview.schemaDraft.tables[0].fields.map(field=>[field.label,field])),createMapping=['Order','Amount','Due','Approved'].map(column=>({column,fieldId:createFields[column].id})),createQuery=()=>d.call(`/api/v1/apps/${createIdentity.appId}/entities/${createIdentity.entityId}/query`,{fields:createMapping.map(item=>item.fieldId),sort:[{fieldId:createFields.Order.id,direction:'asc'}]})
  const createSheets=workbookSheets();createSheets[0].rows=[createSheets[0].rows[0],createSheets[0].rows[0].map((value,index)=>index===1?cell('71','number'):value),[cell('synthetic-cradle-invalid'),cell('invalid'),cell('2026-10-25','date'),cell(true),cell('North')]]
  const createInput={...createIdentity,workbook:{filename:'create-only.xlsx',base64:Buffer.from(writeWorkbook(createSheets)).toString('base64'),sheet:'Orders'},mapping:createMapping,mergeFieldId:'_create_all'}
  const originals=(await createQuery()).items
  const saved=await d.call('/api/v1/records/import-mappings',{...createIdentity,action:'save',sourceName:'synthetic-cradle-workbook',mapping:createMapping,mergeFieldId:createInput.mergeFieldId,expectedVersion:null})
  const used=await d.call('/api/v1/records/import-mappings',{...createIdentity,action:'use',sourceName:saved.sourceName,headers:createSheets[0].headers})
  assert.equal(used.mergeFieldId,'_create_all');assert.deepEqual(used.mapping,createMapping)
  const create=await d.call('/api/v1/records/import-preview',{...createInput,mergeFieldId:used.mergeFieldId,mapping:used.mapping})
  assert.deepEqual([create.creates,create.updates,create.unchanged,create.rejected],[2,0,0,1]);assert.ok(create.rows.every(row=>row.operation==='create'&&row.version===null&&Object.keys(row.before).length===0))
  const commandId=(await import('../../src/core/shared/ids.ts')).createUlid(),command={commandId,expected:[],input:{previewId:create.id}}
  const receipt=await d.call('/api/v1/commands/records.import-commit',command)
  assert.deepEqual(receipt.value,{id:create.id,creates:2,updates:0,unchanged:0,rejected:1})
  assert.deepEqual(await d.call('/api/v1/commands/records.import-commit',command),receipt)
  const created=(await createQuery()).items;assert.equal(created.length,originals.length+2)
  for(const original of originals)assert.deepEqual(created.find(row=>row.id===original.id),original)
  assert.deepEqual(created.filter(row=>!originals.some(original=>original.id===row.id)).map(row=>row.fields[createFields.Amount.id].value).sort(),['12.5','71'])

 }finally{await h.close()}
}
