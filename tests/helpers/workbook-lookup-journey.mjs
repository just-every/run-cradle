import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {lookupSheets,formulaWorkbook} from './workbook-fixtures.mjs'
import {workbookDoors} from './workbook-http.mjs'
import {connectSheets} from './sheets-journey.mjs'

export async function workbookLookupJourney(h,d,provider){
 const bytes=formulaWorkbook(lookupSheets()),filename='lookups.xlsx',preview=await d.call('/api/v1/records/base-import/preview',d.form(bytes,filename))
 const table=preview.schemaDraft.tables[0],vendors=preview.schemaDraft.tables[1],field=(t,label)=>t.fields.find(f=>f.label===label),link=field(table,'Vendor'),price=field(table,'V price'),city=field(table,'X city')
 assert.equal(link.type,'relation');assert.equal(link.relation.entityId,vendors.id);assert.equal(link.relation.cardinality,'one')
 assert.deepEqual(price.expression,{kind:'rollup',relationFieldId:link.id,valueFieldId:field(vendors,'Price').id,aggregate:'lookup'})
 assert.equal(city.type,'computed');assert.equal(city.resultType,'text')
 const decisions=preview.report.workbookFormulas,decision=label=>decisions.find(f=>f.columnKey===preview.source.tables[0].columns.find(c=>c.label===label).key)
 assert.deepEqual(['V price','X city'].map(label=>[decision(label).recognized,decision(label).matchedRows,decision(label).rowsRead]),[[true,3,3],[true,3,3]])
 assert.equal(decision('Bad cache').recognized,false);assert.equal(decision('Bad cache').matchedRows,2);assert.match(decision('Bad cache').reason,/mismatch/i)
 assert.equal(decision('Approximate').recognized,false);assert.match(decision('Approximate').reason,/exact|approximate/i)
 assert.equal(field(table,'Extended').type,'number','Arithmetic depending on a converted link lookup stays a truthful cache until that formula family is supported')
 assert.deepEqual(decision('V price').sourceFormulas.map(f=>f.coordinate),['D2','D3','D4'])
 assert.ok(preview.records.filter(r=>r.tableKey==='sheet-1').every(r=>!Object.hasOwn(r.fields,price.id)&&!Object.hasOwn(r.fields,city.id)))
 assert.equal(preview.source.bundle.artifacts[0].sha256,createHash('sha256').update(bytes).digest('hex'))
 for(const [variant,reason]of [[{duplicate:true},/unique/i],[{partial:true},/every imported data row/i],[{mixed:true},/unsupported|mixed/i]]){
  const refused=await d.call('/api/v1/records/base-import/preview',d.form(formulaWorkbook(lookupSheets(variant)),'refused.xlsx')),proof=refused.report.workbookFormulas.find(f=>f.columnKey==='column-4'&&f.tableKey==='sheet-1')
  assert.equal(proof.recognized,false);assert.match(proof.reason,reason)
  assert.notEqual(field(refused.schemaDraft.tables[0],'V price').type,'computed')
 }
 const scalar=await d.call('/api/v1/records/base-import/preview',d.form(bytes,filename,{...preview,options:{...preview.options,tables:{'sheet-1':{columns:{'column-2':{type:'text'}}}}}}))
 assert.equal(field(scalar.schemaDraft.tables[0],'Vendor').type,'text');assert.equal(field(scalar.schemaDraft.tables[0],'V price').type,'number');assert.equal(scalar.report.workbookFormulas.find(f=>f.columnKey==='column-4').recognized,false)
 const before=await h.mailMessages(),{job,status}=await d.adopt(bytes,filename,preview);assert.equal(status.reconciliation.ok,true);assert.deepEqual(await h.mailMessages(),before)
 const query=async(doors,base,t)=>(await doors.call(`/api/v1/apps/${base.identities.appId}/entities/${t.id}/query`,{fields:t.fields.map(f=>f.id),sort:[{fieldId:t.fields[0].id,direction:'asc'}]})).items
 assert.deepEqual((await query(d,preview,table)).map(r=>[r.fields[price.id].value,r.fields[city.id].value]),[['12.5','Brisbane'],['7.25','Perth'],['12.5','Brisbane']],'Every adopted lookup equals independently specified source results, including the repeated vendor')
 const receiptPath=`/api/v1/records/base-import/jobs/${job.id}/receipt.json`,receipt=await d.call(receiptPath)
 assert.deepEqual(receipt.workbookFormulas.filter(f=>f.recognized).map(f=>f.column),['V price','X city'])
 await h.restart();d=await workbookDoors(h);assert.deepEqual((await d.call(receiptPath)).workbookFormulas,receipt.workbookFormulas)
 const vendor=(await query(d,preview,vendors))[0]
 await d.command('record.patch',{ref:vendor.ref,changes:{[field(vendors,'Price').id]:'15',[field(vendors,'City').id]:'Sydney'}},[{ref:vendor.ref,version:vendor.version}])
 assert.deepEqual((await query(d,preview,table)).map(r=>[r.fields[price.id].value,r.fields[city.id].value,r.fields[field(table,'Bad cache').id].value]),[['15','Sydney','12.5'],['7.25','Perth','99'],['15','Sydney','12.5']],'Next read recomputes both lookup families for every linked row, and leaves refused caches unchanged')
 // Capture actual formula metadata through the consented read-only provider door.
 const google=lookupSheets();google[0].headers.push('Local arithmetic');google[0].rows.forEach((row,i)=>row.push({type:'number',value:['4','6','8'][i],formula:`C${i+2}*2`,coordinate:`I${i+2}`}))
 provider.setWorkbook(google)
 const connectionId=await connectSheets(d,provider,{appId:preview.identities.appId}),capture=await d.call('/api/v1/records/sheets-source',{connectionId}),captured=Buffer.from(capture.content)
 const sheets=await d.call('/api/v1/records/base-import/preview',d.form(captured,capture.filename))
 assert.deepEqual(sheets.source.tables[0].rows.map(r=>r.formulas['column-4'].coordinate),['D2','D3','D4'])
 const native=sheets.schemaDraft.tables[0],local=field(native,'Local arithmetic')
 assert.equal(local.type,'computed');assert.equal(field(native,'V price').type,'computed');assert.equal(field(native,'X city').type,'computed')
 await d.adopt(captured,capture.filename,sheets)
 const googleRows=await query(d,sheets,native)
 assert.deepEqual(googleRows.map(r=>[r.fields[field(native,'V price').id].value,r.fields[field(native,'X city').id].value,r.fields[local.id].value]),[['12.5','Brisbane','4'],['7.25','Perth','6'],['12.5','Brisbane','8']])
 await d.command('record.patch',{ref:googleRows[0].ref,changes:{[field(native,'Quantity').id]:'5'}},[{ref:googleRows[0].ref,version:googleRows[0].version}])
 assert.equal((await query(d,sheets,native))[0].fields[local.id].value,'10','Google formula input edits recompute instead of preserving the provider cache')
 provider.setWorkbook(null)
}
