import {createHash} from 'node:crypto'
import {csvDownloadEntries} from './base-csv-download.mjs'
import assert from 'node:assert/strict'
import {recordsImportBrowserRuntime} from './records-import-browser-runtime.mjs'
import {workbookDoors} from './workbook-http.mjs'
import {workbook,workbookSheets,cell,ooxmlFixture,invalidWorkbooks,arithmeticWorkbook} from './workbook-fixtures.mjs'
import {writeWorkbook} from '../../src/domains/records/workbooks/write.ts'
import {readWorkbook} from '../../src/domains/records/workbooks/read.ts'
import {sheetsProvider} from './sheets-provider.mjs'
import {sheetsJourney} from './sheets-journey.mjs'
export async function workbookJourney(){const provider=sheetsProvider(),h=await recordsImportBrowserRuntime(0,{outbound:request=>provider.fetch(request),bindings:{GOOGLE_CLIENT_ID:'synthetic-cradle-client-1',GOOGLE_CLIENT_SECRET:'synthetic-cradle-client-secret-1',CONNECTION_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')}})
 try{const d=await workbookDoors(h),bytes=workbook(),count=async()=>Number((await h.db.prepare('SELECT count(*) n FROM manual_record_bases').first()).n),before=await count()
  const preview=await d.call('/api/v1/records/base-import/preview',d.form(bytes,'synthetic-cradle.xlsx'));assert.equal(await count(),before);assert.equal(preview.schemaDraft.tables.length,2)
  const orders=preview.schemaDraft.tables[0],fields=Object.fromEntries(orders.fields.map(f=>[f.label,f]));assert.equal(fields.Amount.type,'number');assert.equal(fields.Approved.type,'boolean');assert.equal(fields.Company.type,'relation')
  const typed=await d.call('/api/v1/records/base-import/preview',d.form(ooxmlFixture(),'typed.xlsx'));const types=Object.fromEntries(typed.schemaDraft.tables[0].fields.map(f=>[f.label,f.type]));assert.deepEqual(types,{Key:'text',Formula:'computed',Date:'date',Time:'instant',Checked:'boolean'});assert.ok(JSON.stringify(typed.records).includes('synthetic-cradle-shared'))
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
  await workbookArithmeticJourney(h,d)
 }finally{await h.close()}
}

/** Native review, adoption, current readback and retained custody for real formula cells. */
async function workbookArithmeticJourney(h,d){
 const bytes=arithmeticWorkbook(),filename='arithmetic.xlsx',preview=await d.call('/api/v1/records/base-import/preview',d.form(bytes,filename))
 const tables=preview.schemaDraft.tables,orders=tables.find(table=>table.label==='Orders'),packages=tables.find(table=>table.label==='Packages'),field=(table,label)=>table.fields.find(item=>item.label===label)
 const total=field(orders,'Total'),quantity=field(orders,'Quantity'),unit=field(orders,'Unit price'),shipping=field(packages,'Shipping'),weight=field(packages,'Weight'),units=field(packages,'Units')
 assert.deepEqual(total.expression,{kind:'call',fn:'multiply',args:[{kind:'field',fieldId:quantity.id},{kind:'field',fieldId:unit.id}]},'Native arithmetic binds mapped field identities in the correct sheet')
 assert.equal(shipping.type,'computed');assert.equal(shipping.expression.fn,'divide');assert.deepEqual(shipping.expression.args[0],{kind:'call',fn:'add',args:[{kind:'field',fieldId:weight.id},{kind:'field',fieldId:units.id}]})
 const formulas=preview.report.workbookFormulas,byLabel=label=>formulas.find(item=>item.columnKey===preview.source.tables[0].columns.find(column=>column.label===label).key&&item.tableKey==='sheet-1')
 assert.deepEqual(formulas.filter(item=>item.recognized).map(item=>[item.tableKey,item.columnKey,item.matchedRows,item.rowsRead]),[['sheet-1','column-4',4,4],['sheet-2','column-4',2,2]])
 assert.deepEqual(byLabel('Total').sourceFormulas,[2,3,4,5].map((row,index)=>({rowKey:`row-${index+1}`,coordinate:`D${row}`,expression:`B${row}*C${row}`})))
 assert.deepEqual(preview.source.tables[0].rows.map(row=>row.formulas['column-4']),[2,3,4,5].map(row=>({coordinate:`D${row}`,expression:`B${row}*C${row}`})),'Formula coordinates survive source preparation')
 for(const [label,reason]of [['Mismatch',/cache|match/i],['Mixed',/uniform|mixed|same/i],['External',/reference|unsupported/i],['Cycle one',/cycle|depend|referenced formula/i],['Cycle two',/cycle|depend|referenced formula/i]]){
  const refusal=byLabel(label);assert.equal(refusal.recognized,false,label);assert.match(refusal.reason,reason,label);assert.equal(field(orders,label).type,'number',`${label} keeps its cached literal instead of inventing a native formula`)
 }
 assert.equal(byLabel('Mismatch').matchedRows,3,'A mismatched final row prevents adoption after earlier rows matched')
 assert.deepEqual(preview.records.filter(row=>row.entityId===orders.id).map(row=>row.fields[field(orders,'Mismatch').id]),['25','21.75','0','99'])
 assert.ok(preview.records.every(row=>!Object.hasOwn(row.fields,total.id)&&!Object.hasOwn(row.fields,shipping.id)),'Adopted computed cells never persist the source cached literal')
 const sourceArtifact=preview.source.bundle.artifacts[0];assert.equal(sourceArtifact.sha256,createHash('sha256').update(bytes).digest('hex'));assert.deepEqual(Buffer.from(sourceArtifact.original.base64,'base64'),Buffer.from(bytes),'Exact original workbook remains in source custody')
 const explicit={...preview,options:{...preview.options,tables:{'sheet-1':{columns:{'column-4':{type:'number'}}}}}}
 const literal=await d.call('/api/v1/records/base-import/preview',d.form(bytes,filename,explicit));assert.equal(literal.schemaDraft.tables[0].fields.find(item=>item.id===total.id).type,'number');assert.equal(literal.report.workbookFormulas.find(item=>item.tableKey==='sheet-1'&&item.columnKey==='column-4').recognized,false,'Explicit owner scalar choice retains cached results')
 const mailBefore=await h.mailMessages(),{job,status}=await d.adopt(bytes,filename,preview);assert.equal(status.reconciliation.ok,true);assert.deepEqual(await h.mailMessages(),mailBefore,'Formula adoption sends no imported-row mail')
 const query=async table=>(await d.call(`/api/v1/apps/${preview.identities.appId}/entities/${table.id}/query`,{fields:table.fields.map(item=>item.id),sort:[{fieldId:table.fields[0].id,direction:'asc'}]})).items
 const rows=await query(orders);assert.deepEqual(rows.map(row=>row.fields[total.id].value),['25','21.75','0','-3'],'Every admitted source row independently matches the expected arithmetic result')
 assert.deepEqual((await query(packages)).map(row=>row.fields[shipping.id].value),['3','7.5'],'A second sheet computes from its own field identities')
 const receiptPath=`/api/v1/records/base-import/jobs/${job.id}/receipt.json`,receipt=await d.call(receiptPath)
 assert.deepEqual(receipt.workbookFormulas.map(item=>[item.tableKey,item.columnKey,item.recognized]),formulas.map(item=>[item.tableKey,item.columnKey,item.recognized]),'Receipt retains both supported formula decisions and refusals')
 assert.ok(receipt.notCarried.find(item=>item.id==='formulas').statement.match(/unsupported|other|except/i),'Receipt does not deny formulas it actually preserved')
 await h.restart();const restarted=await workbookDoors(h);assert.deepEqual((await restarted.call(receiptPath)).workbookFormulas,receipt.workbookFormulas,'Formula proof and refusal decisions survive Worker restart')
 const current=(await restarted.call(`/api/v1/apps/${preview.identities.appId}/entities/${orders.id}/query`,{fields:orders.fields.map(item=>item.id),sort:[{fieldId:orders.fields[0].id,direction:'asc'}]})).items[0]
 await restarted.command('record.patch',{ref:current.ref,changes:{[quantity.id]:'5'}},[{ref:current.ref,version:current.version}])
 const next=(await restarted.call(`/api/v1/apps/${preview.identities.appId}/entities/${orders.id}/query`,{fields:orders.fields.map(item=>item.id),sort:[{fieldId:orders.fields[0].id,direction:'asc'}]})).items
 assert.equal(next[0].fields[total.id].value,'62.5','The next read recomputes from the edited input instead of retaining 25');assert.equal(next[0].fields[field(orders,'Mismatch').id].value,'25','A refused formula remains its reviewed literal after an input edit')
}
