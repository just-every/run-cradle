import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {prepareApiSource} from '../src/domains/records/base-transfer/source-api.ts'
import {allocateImportIdentities} from '../src/domains/records/base-transfer/source.ts'
import {previewBaseImport} from '../src/domains/records/base-transfer/plan.ts'

const metadata='{"tables":[{"id":"targets","name":"Targets","fields":[{"id":"name","name":"Name","type":"singleLineText"},{"id":"amount","name":"Amount","type":"number"}]},{"id":"rows","name":"Rows","fields":[{"id":"name","name":"Name","type":"singleLineText"},{"id":"link","name":"Link","type":"multipleRecordLinks","options":{"linkedTableId":"targets"}},{"id":"lookup","name":"Lookup","type":"multipleLookupValues","options":{"recordLinkFieldId":"link","fieldIdInLinkedTable":"amount"}}]}]}'
const targets='{"records":[{"id":"target","fields":{"Name":"Target","Amount":0.123456789012345678}}]}'
const rows='{"records":[{"id":"first","fields":{"Name":"First","Link":["target"],"Lookup":[0.123456789012345678]}},{"id":"second","fields":{"Name":"Second","Link":["target"],"Lookup":[1.23456789012345678e-1]}},{"id":"late-mismatch","fields":{"Name":"Late mismatch","Link":["target"],"Lookup":[0.123456789012345679]}},{"id":"mixed","fields":{"Name":"Mixed","Link":["target"],"Lookup":[9007199254740993,[1.2300,"1.2300"],"9007199254740993",{"precise":0.123456789012345679,"quoted":"0.123456789012345679"}]}},{"id":"last-match","fields":{"Name":"Last match","Link":["target"],"Lookup":[0.123456789012345678]}}]}'
// Handwritten original JSON representations distinguish numeric tokens from
// text with the same digits, including values that binary Number would round.
const expected=[
 '[0.123456789012345678]',
 '[1.23456789012345678e-1]',
 '[0.123456789012345679]',
 '[9007199254740993,[1.2300,"1.2300"],"9007199254740993",{"precise":0.123456789012345679,"quoted":"0.123456789012345679"}]',
 '[0.123456789012345678]',
]

contract('RECORDS-005','late API lookup proof failure preserves exact nested numeric and quoted-text content for every row',async()=>{
 const bodies={meta:metadata,targets,rows},source=await prepareApiSource({metadataUrl:'https://recorded.example/meta',recordsUrl:key=>'https://recorded.example/'+key},async request=>{
  const key=new URL(request.url).pathname.slice(1)
  assert.ok(Object.hasOwn(bodies,key),'Only this test\'s recorded responses are requested')
  return new Response(bodies[key])
 }),options={name:'Faithful failed lookup',tables:{rows:{columns:{lookup:{type:'computed'}}}}},ids=allocateImportIdentities(source),preview=previewBaseImport(source,options,ids)
 const recognition=preview.report.lookups.find(item=>item.tableKey==='rows'&&item.columnKey==='lookup')
 assert.equal(recognition.recognized,false)
 const proof=recognition.candidates.find(item=>item.relationColumnKey==='link'&&item.valueColumnKey==='amount')
 assert.deepEqual({rowsRead:proof.rowsRead,matchedRows:proof.matchedRows,matchesAllRows:proof.matchesAllRows},{rowsRead:5,matchedRows:3,matchesAllRows:false})
 const mismatch=recognition.firstMismatch
 assert.equal(mismatch.code,'LOOKUP_MISMATCH');assert.equal(mismatch.tableKey,'rows');assert.equal(mismatch.columnKey,'lookup');assert.equal(mismatch.rowKey,'late-mismatch')
 assert.deepEqual(mismatch.location,source.tables[1].rows[2].location);assert.equal(mismatch.location.pointer,'/records/2')
 assert.match(mismatch.message,/Lookup retained as TEXT:.*first mismatch at/)
 const field=preview.schemaDraft.tables.find(table=>table.id===ids.tables.rows.entityId).fields.find(field=>field.id===ids.tables.rows.fields.lookup)
 assert.equal(field.type,'text');assert.equal(field.expression,undefined)
 assert.deepEqual(preview.records.filter(row=>row.tableKey==='rows').map(row=>row.fields[field.id]),expected)
 assert.deepEqual(preview.report.tables.map(table=>[table.rowsRead,table.created,table.rejected]),[[1,1,0],[5,5,0]])
 const accounting=preview.report.tables[1].columns.find(column=>column.columnKey==='lookup')
 assert.equal(accounting.keptText,5);assert.equal(accounting.converted,5);assert.equal(accounting.unparseable,0);assert.equal(accounting.recomputed,0)
 assert.deepEqual(source.bundle.artifacts.map(artifact=>Buffer.from(artifact.original.base64,'base64')),Object.values(bodies).map(body=>Buffer.from(body)))
 const retained=JSON.parse(JSON.stringify(preview)),replayed=previewBaseImport(retained.source,retained.options,retained.identities)
 assert.equal(replayed.fingerprint,preview.fingerprint)
 assert.deepEqual(replayed.records.filter(row=>row.tableKey==='rows').map(row=>row.fields[field.id]),expected)
})
