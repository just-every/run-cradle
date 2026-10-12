import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {prepareApiSource} from '../src/domains/records/base-transfer/source-api.ts'
import {allocateImportIdentities} from '../src/domains/records/base-transfer/source.ts'
import {previewBaseImport} from '../src/domains/records/base-transfer/plan.ts'

contract('RECORDS-005','JSON restored API rows treat inherited-looking and pointer-sensitive field names as exact own data',async()=>{
 const fields=['Name','constructor','toString','__proto__','a/b','a~b']
 const metadata=JSON.stringify({tables:[{id:'table',name:'Own fields',fields:fields.map(name=>({id:name,name,type:'singleLineText'}))}]})
 const records='{"records":[{"id":"one","fields":{"Name":"First","constructor":"inert constructor","toString":"inert function","__proto__":"inert prototype","a/b":"slash","a~b":"tilde"}},{"id":"two","fields":{"Name":"Second"}}]}'
 const source=await prepareApiSource({metadataUrl:'https://recorded.example/schema',recordsUrl:()=> 'https://recorded.example/rows'},async request=>new Response(request.url.endsWith('/schema')?metadata:records)),ids=allocateImportIdentities(source),options={name:'Own keys'},preview=previewBaseImport(source,options,ids)
 const restored=JSON.parse(JSON.stringify(preview)),again=previewBaseImport(restored.source,restored.options,restored.identities)
 assert.equal(again.fingerprint,preview.fingerprint)
 const first=again.records.find(row=>row.rowKey==='one'),second=again.records.find(row=>row.rowKey==='two')
 assert.deepEqual(fields.map(field=>first.fields[ids.tables.table.fields[field]]),['First','inert constructor','inert function','inert prototype','slash','tilde'])
 assert.deepEqual(fields.map(field=>second.fields[ids.tables.table.fields[field]]),['Second','','','','',''])
 assert.equal(again.report.tables[0].rejected,0)
 const optional=JSON.parse(JSON.stringify(ids));delete optional.tables.table.options.__proto__
 const selected=previewBaseImport(source,{name:'Own keys',tables:{table:{columns:{['__proto__']:{type:'select'}}}}},optional)
 assert.equal(Object.hasOwn(Object.prototype,'inert prototype'),false,'Source option mapping never writes the global object prototype')
 assert.deepEqual(selected.schemaDraft.tables[0].fields.find(field=>field.id===ids.tables.table.fields.__proto__).options.map(option=>option.label),['inert prototype'])
 assert.throws(()=>previewBaseImport(source,{name:'Own keys',tables:{missing:{columns:{}}}},ids),/Unknown mapping table/)
 assert.throws(()=>previewBaseImport(source,{name:'Own keys',tables:{table:{columns:{missing:{sourceChoices:['hidden']}}}}},ids),/Unknown mapping column/)
})
