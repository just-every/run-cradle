import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {contract} from './contract.mjs'
import {prepareReviewRetention} from '../src/domains/records/base-transfer/review-retention.ts'

contract('RECORDS-005 BASE-INPUT-001','review retention preflight preserves complete Unicode, source text and report metadata across bounded SQL chunks',()=>{
 const text='Quoted "value", emoji 🌳\r\n'.repeat(4000)
 const detail={alpha:{original:text,raw:'=SUM(1) <script>inert</script>'},omega:{choices:['First',' Untrimmed'],counts:{created:2,rejected:1,rowsRead:3}}}
 const prepared=prepareReviewRetention(detail),chunks=prepared.statements.flatMap(statement=>{
  assert.ok(Buffer.byteLength(statement.params[1])<2000000)
  assert.equal(statement.params.length,2)
  return JSON.parse(statement.params[1])
 })
 assert.ok(chunks.length>1)
 assert.deepEqual(chunks.map(chunk=>chunk.ordinal),Array.from({length:chunks.length},(_,i)=>i))
 assert.deepEqual(JSON.parse(chunks.map(chunk=>chunk.body).join('')),detail)
 assert.equal(JSON.parse(prepared.manifest).chunks,chunks.length)
 assert.equal(prepared.detailHash,createHash('sha256').update(JSON.stringify(detail)).digest('hex'))
})
