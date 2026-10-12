import './helpers/typescript-loader.mjs'
import {contract} from './contract.mjs'
const test=(name,fn)=>contract('RECORDS-005',name,fn)
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {decimalSource,decimalRows} from './helpers/records-api-decimal-source.mjs'
import {allocateImportIdentities} from '../src/domains/records/base-transfer/source.ts'
import {previewBaseImport} from '../src/domains/records/base-transfer/plan.ts'
const preview=(source,options={name:'Exact API'},ids=allocateImportIdentities(source))=>previewBaseImport(source,options,ids)
const values=p=>p.records.map(row=>row.fields[p.identities.tables.table.fields.amount])
test('RECORDS-005 exact API bytes reach preview without rounding, with durable origins and honest conversions',async()=>{
 const tokens=['0.123456789012345678','0.123456789012345679','0.12345678901234567890123456789012','0.99999999999999999999999999999999','9007199254740991.1','-0.123456789012345678','1.2300','123e-2','1.23E+2','1E-7','0','-0','-0.00E+9999999999999999999','42','"42"'],expected=[...tokens.slice(0,6),'1.23','1.23','123','0.0000001','0','0','0','42','42']
 assert.equal(Number(tokens[0]),Number(tokens[1]));assert.equal(Number(tokens[4]),9007199254740991)
 const {source,calls,bodies}=await decimalSource([decimalRows(tokens)],{chunkSize:1}),p=preview(source)
 assert.deepEqual(values(p),expected);assert.equal(calls.length,2);assert.equal(calls.filter(url=>url.endsWith('/rows')).length,1)
 assert.equal(p.report.tables[0].created,tokens.length);assert.equal(p.report.tables[0].rejected,0)
 assert.equal(p.report.tables[0].columns[1].converted,tokens.length-1);assert.equal(p.report.tables[0].columns[1].unparseable,0)
 assert.ok(p.report.tables[0].columns[1].validTypes.includes('number'))
 assert.equal(p.report.diagnostics.filter(d=>d.code==='CELL_CONVERTED').length,tokens.length-1)
 for(let index=0;index<tokens.length-1;index++){
  const origin=source.tables[0].rows[index].numericOrigins.amount
  assert.deepEqual(origin,{lexeme:tokens[index],pointer:`/records/${index}/fields/Amount`})
  const d=p.report.diagnostics.find(d=>d.code==='CELL_CONVERTED'&&d.rowKey===`r${index}`)
  assert.equal(d.raw,tokens[index]);assert.equal(d.location.pointer,origin.pointer);assert.equal(d.location.page,1);assert.match(d.message,/API JSON number to native number string/);assert.ok(d.message.includes(JSON.stringify(expected[index])))
 }
 assert.equal(source.tables[0].rows.at(-1).numericOrigins,undefined)
 for(const [index,artifact]of source.bundle.artifacts.entries()){
  assert.equal(Buffer.from(artifact.original.base64,'base64').toString(),bodies[index]);assert.equal(artifact.sha256,createHash('sha256').update(bodies[index]).digest('hex'))
 }
 const restored=JSON.parse(JSON.stringify(p));assert.deepEqual(restored.source.tables[0].rows[0].numericOrigins.amount,source.tables[0].rows[0].numericOrigins.amount)
 assert.equal(preview(restored.source,restored.options,restored.identities).fingerprint,p.fingerprint)
 const text=preview(source,{name:'Exact text',tables:{table:{columns:{amount:{type:'text'}}}}},p.identities)
 assert.deepEqual(values(text),tokens.map(token=>token==='"42"'?'42':token));assert.equal(text.report.tables[0].columns[1].converted,tokens.length-1)
 assert.match(text.report.diagnostics.find(d=>d.columnKey==='amount').message,/API JSON number to native text string/)
 // Prove the origin itself participates in the fingerprint, independent of custody.
 const originChanged=structuredClone(source);delete originChanged.tables[0].rows[13].numericOrigins
 assert.notEqual(preview(originChanged,p.options,p.identities).fingerprint,p.fingerprint)
 const first=await decimalSource([decimalRows([tokens[0]])]),second=await decimalSource([decimalRows([tokens[1]])]),ids=allocateImportIdentities(first.source)
 assert.notEqual(preview(first.source,p.options,ids).fingerprint,preview(second.source,p.options,ids).fingerprint)
 assert.notDeepEqual(values(preview(first.source,p.options,ids)),values(preview(second.source,p.options,ids)))
})
test('RECORDS-005 unsafe integers and native bounds reject only their rows and retain exact locations and tokens',async()=>{
 const invalid=['9007199254740992','9007199254740993','-9007199254740993','90071992547409930e-1','0.123456789012345678901234567890123','1e309','1e-999999999999999999999999','1e999999999999999999999999','9'.repeat(129)+'.1'],valid=['1e-32','0.123456789012345678','42']
 const {source}=await decimalSource([decimalRows([...invalid,...valid])]),p=preview(source),account=p.report.tables[0],errors=p.report.diagnostics.filter(d=>d.code==='CELL_CONVERSION')
 assert.equal(account.created,3);assert.equal(account.rejected,invalid.length);assert.equal(account.columns[1].unparseable,invalid.length);assert.equal(account.columns[1].converted,3);assert.equal(errors.length,invalid.length)
 assert.equal(account.columns[1].validTypes.includes('number'),false);assert.ok(account.columns[1].validTypes.includes('text'))
 assert.deepEqual(values(p),['0.'+'0'.repeat(31)+'1','0.123456789012345678','42'])
 for(const [index,error]of errors.entries()){
  assert.equal(error.raw,invalid[index]);assert.equal(error.location.page,1);assert.equal(error.location.pointer,`/records/${index}/fields/Amount`);assert.match(error.location.artifact,/^table\//)
  assert.ok(error.message.includes(error.location.artifact));assert.ok(error.message.includes(error.location.pointer));assert.ok(error.message.includes(invalid[index]));assert.match(error.message,index<4?/Unsafe API integer/:/128 integer \/ 32 fractional/)
 }
})
test('RECORDS-005 page, record and actual ID-or-label coordinates preserve escaped and prototype-looking field tokens',async()=>{
 const metadata='{"tables":[{"id":"table","name":"Key mapping","fields":[{"id":"name","name":"Name","type":"singleLineText"},{"id":"a/b~c","name":"北雪","type":"number"},{"id":"__proto__","name":"Proto","type":"number"},{"id":"constructor","name":"Construct","type":"number"},{"id":"toString","name":"String method","type":"number"}]}]}'
 const page1=String.raw`{"records":[{"id":"first","fields":{"Name":"digits 123 { } quote \" and 北","a\/b~c":0.123456789012345678,"北雪":99,"__proto__":1.200,"constructor":42,"String method":-0,"Nested":{"number":7},"Array":[1,2],"Bool":true,"Null":null}}],"offset":"next"}`
 const page2=String.raw`{"records":[{"id":"second","fields":{"Name":"second","\u5317雪":0.123456789012345679,"Proto":2.300,"Construct":"42","toString":1e-7}}]}`
 const {source,calls}=await decimalSource([page1,page2],{metadata,chunkSize:1}),p=preview(source),rows=source.tables[0].rows
 assert.equal(calls.length,3);assert.match(calls[2],/offset=next/);assert.equal(rows[0].numericOrigins['a/b~c'].pointer,'/records/0/fields/a~1b~0c');assert.equal(rows[1].numericOrigins['a/b~c'].pointer,'/records/0/fields/北雪')
 assert.equal(rows[0].location.page,1);assert.equal(rows[1].location.page,2);assert.notEqual(rows[0].location.artifact,rows[1].location.artifact)
 for(const [index,expected]of [['0.123456789012345678','1.2','42','0'],['0.123456789012345679','2.3','42','0.0000001']].entries())assert.deepEqual(['a/b~c','__proto__','constructor','toString'].map(key=>p.records[index].fields[p.identities.tables.table.fields[key]]),expected)
 assert.deepEqual(p.report.tables[0].columns.map(c=>c.converted),[0,2,2,1,2]);assert.equal(Object.hasOwn(rows[1].numericOrigins,'constructor'),false);assert.equal({}.polluted,undefined)
 assert.deepEqual(rows[0].values.Nested,{number:7});assert.deepEqual(rows[0].values.Array,[1,2]);assert.equal(rows[0].values.Bool,true);assert.equal(rows[0].values.Null,null)
 assert.equal(rows[0].values.name,'digits 123 { } quote " and 北');assert.equal(p.report.tables[0].rejected,0)
 assert.equal(preview(JSON.parse(JSON.stringify(source)),p.options,p.identities).fingerprint,p.fingerprint)
})
