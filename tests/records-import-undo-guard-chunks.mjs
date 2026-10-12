import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {boundedUndoJson,nativeUndoMarkerGuards} from '../src/domains/records/base-transfer/undo-guards.server.ts'
import {checkSql} from '../vendor/base/modules/import-kit/src/d1/budget.ts'

contract('RECORDS-005','undo marker guards preserve every typed value across exact UTF-8 bounds at 34000 effects',()=>{
 const markers=Array.from({length:34000},(_,index)=>({target_kind:'record:01'+String(index%4).padStart(24,'0'),record_id:'01'+String(index).padStart(24,'0'),revision:'import:'+String(index).padStart(26,'0')+':'+('a'.repeat(64))})),guards=nativeUndoMarkerGuards('destination',markers),chunks=guards.slice(1).map(guard=>guard.params[0])
 assert.ok(chunks.length>10);assert.ok(chunks.every(chunk=>Buffer.byteLength(chunk)<=500000));assert.deepEqual(chunks.flatMap(chunk=>JSON.parse(chunk)),markers)
 assert.equal(guards[0].params[1],34000);for(const guard of guards){checkSql(guard);assert.ok(guard.sql.length<100000)}
 for(const column of ['target_kind','record_id','revision'])assert.ok(guards.slice(1).every(guard=>guard.sql.includes(`typeof(m.${column})=json_type(e.value,'$.${column}')`)&&guard.sql.includes(`m.${column} IS json_extract(e.value,'$.${column}')`)))
 const unicode=['😀'.repeat(124999),null,0,false,'é',{'line':'\n"\\'}],encoded=boundedUndoJson(unicode)
 assert.ok(encoded.every(chunk=>Buffer.byteLength(chunk)<=500000));assert.deepEqual(encoded.flatMap(chunk=>JSON.parse(chunk)),unicode)
 assert.deepEqual(boundedUndoJson([]),[]);assert.throws(()=>boundedUndoJson(['😀'.repeat(125000)]),/IMPORT_D1_VALUE_LIMIT/)
})
