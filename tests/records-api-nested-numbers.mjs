import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {prepareApiSource} from '../src/domains/records/base-transfer/source-api.ts'
import {allocateImportIdentities} from '../src/domains/records/base-transfer/source.ts'
import {previewBaseImport} from '../src/domains/records/base-transfer/plan.ts'
import {readApiSource} from '../vendor/base/modules/import-kit/src/readers/api.ts'
const metadata='{"tables":[{"id":"targets","name":"Targets","fields":[{"id":"name","name":"Name","type":"singleLineText"},{"id":"amount","name":"Amount","type":"number","options":{"precision":18}}]},{"id":"rows","name":"Rows","fields":[{"id":"name","name":"Name","type":"singleLineText"},{"id":"link","name":"Link","type":"multipleRecordLinks","options":{"linkedTableId":"targets"}},{"id":"lookup","name":"Lookup","type":"multipleLookupValues","options":{"recordLinkFieldId":"link","fieldIdInLinkedTable":"amount"}},{"id":"rollup","name":"Rollup","type":"rollup"}]}]}'
const targets='{"records":[{"id":"target","fields":{"Name":"Target","Amount":0.123456789012345678}}]}'
const rows='{"records":[{"id":"row","createdTime":17,"fields":{"Name":"Row","Link":["target"],"Lookup":[0.123456789012345678],"Rollup":[9007199254740993,[0.123456789012345679,1.2300],"9007199254740993"],"Unknown":{"numeric":7}}}]}'
contract('RECORDS-005','API numeric lookup/rollup arrays retain exact nested digits, successful proof, original bytes and honest text counts',async()=>{
 const bodies={meta:metadata,targets,rows},source=await prepareApiSource({metadataUrl:'https://recorded.example/meta',recordsUrl:key=>'https://recorded.example/'+key},async request=>new Response(bodies[new URL(request.url).pathname.slice(1)])),options={name:'Exact nested numeric',tables:{rows:{columns:{lookup:{type:'computed'}}}}},preview=previewBaseImport(source,options,allocateImportIdentities(source)),ids=preview.identities.tables.rows
 assert.equal(source.bundle.records.find(r=>r.kind==='api-schema').payload.fields[1].options.precision,18)
 assert.deepEqual(source.tables[1].rows[0].values.Unknown,{numeric:7});assert.equal(source.bundle.records.find(r=>r.kind==='rows').payload.createdTime,17)
 assert.deepEqual(source.tables[1].rows[0].numericTokens.lookup,[{lexeme:'0.123456789012345678',pointer:'/records/0/fields/Lookup/0',path:[0]}]);assert.deepEqual(source.tables[1].rows[0].numericTokens.rollup.map(t=>t.lexeme),['9007199254740993','0.123456789012345679','1.2300'])
 assert.equal(preview.report.lookups.find(l=>l.columnKey==='lookup').recognized,true);assert.equal(preview.schemaDraft.tables[1].fields.find(f=>f.id===ids.fields.lookup).type,'computed')
 assert.equal(preview.records.find(r=>r.tableKey==='rows').fields[ids.fields.rollup],'[9007199254740993,[0.123456789012345679,1.2300],"9007199254740993"]');assert.equal(preview.report.tables[1].columns.find(c=>c.columnKey==='rollup').converted,1);assert.equal(preview.report.tables[1].rejected,0)
 for(const artifact of source.bundle.artifacts){const text=Buffer.from(artifact.original.base64,'base64').toString();assert.ok(Object.values(bodies).includes(text))}
 const resumed=JSON.parse(JSON.stringify(preview));assert.equal(previewBaseImport(resumed.source,resumed.options,resumed.identities).fingerprint,preview.fingerprint)
 const text=previewBaseImport(source,{name:'Faithful lookup text',tables:{rows:{columns:{lookup:{type:'text'}}}}},preview.identities);assert.equal(text.records.find(r=>r.tableKey==='rows').fields[ids.fields.lookup],'[0.123456789012345678]');assert.equal(text.report.tables[1].columns.find(c=>c.columnKey==='lookup').converted,1)
 const defaultRead=await readApiSource({namespace:'unchanged-default',url:'https://recorded.example/rows',parsePage:body=>({records:body.records.map(row=>({kind:'raw',sourceId:row.id,payload:row}))})},async()=>new Response(rows));assert.equal(typeof defaultRead.records[0].payload.fields.Lookup[0],'number');assert.equal(typeof defaultRead.records[0].payload.createdTime,'number')
})
contract('RECORDS-005','matching declared API lookup is computed automatically by default with exact numeric proof and durable replay',async()=>{
 const bodies={meta:metadata,targets,rows},source=await prepareApiSource({metadataUrl:'https://recorded.example/meta',recordsUrl:key=>'https://recorded.example/'+key},async request=>{
  const key=new URL(request.url).pathname.slice(1);assert.ok(Object.hasOwn(bodies,key));return new Response(bodies[key])
 }),options={name:'Automatic exact lookup'},ids=allocateImportIdentities(source),preview=previewBaseImport(source,options,ids)
 const field=preview.schemaDraft.tables[1].fields.find(field=>field.id===ids.tables.rows.fields.lookup),recognition=preview.report.lookups.find(item=>item.tableKey==='rows'&&item.columnKey==='lookup'),count=preview.report.tables[1].columns.find(column=>column.columnKey==='lookup')
 assert.equal(field.type,'computed');assert.equal(field.readOnly,true);assert.equal(field.resultType,'number')
 assert.deepEqual(field.expression,{kind:'rollup',relationFieldId:ids.tables.rows.fields.link,valueFieldId:ids.tables.targets.fields.amount,aggregate:'lookup'})
 assert.equal(recognition.recognized,true);assert.equal(recognition.firstMismatch,undefined)
 const proof=recognition.candidates.find(candidate=>candidate.relationColumnKey==='link'&&candidate.valueColumnKey==='amount')
 assert.deepEqual({rowsRead:proof.rowsRead,matchedRows:proof.matchedRows,matchesAllRows:proof.matchesAllRows},{rowsRead:1,matchedRows:1,matchesAllRows:true})
 assert.equal(count.chosenType,'computed');assert.equal(count.recomputed,1);assert.equal(count.keptText,0)
 assert.equal(Object.hasOwn(preview.records.find(row=>row.tableKey==='rows').fields,field.id),false)
 assert.equal(preview.records.find(row=>row.tableKey==='targets').fields[ids.tables.targets.fields.amount],'0.123456789012345678')
 assert.deepEqual(source.bundle.artifacts.map(artifact=>Buffer.from(artifact.original.base64,'base64')),Object.values(bodies).map(body=>Buffer.from(body)))
 const stored=JSON.parse(JSON.stringify(preview));assert.equal(previewBaseImport(stored.source,stored.options,stored.identities).fingerprint,preview.fingerprint)
})
contract('RECORDS-005','repeated API identities across pages are rejected before preview without losing original identity structure',async()=>{
 let call=0;await assert.rejects(prepareApiSource({metadataUrl:'https://recorded.example/meta',recordsUrl:()=> 'https://recorded.example/rows'},async()=>new Response([JSON.stringify({tables:[{id:'t',name:'T',fields:[{id:'name',name:'Name',type:'singleLineText'}]}]}),'{"records":[{"id":"same","fields":{"Name":"first"}}],"offset":"next"}','{"records":[{"id":"same","fields":{"Name":"second"}}]}'][call++])),/Duplicate API record identity/)
})
