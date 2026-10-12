import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {harness} from './helpers/records-manual-harness.mjs'
import {createUlid} from '../src/core/shared/ids.ts'
import {importAuthority,reserveNewBaseImportAuthority,authoritySize} from '../src/domains/records/base-transfer/authority.server.ts'
import {checkSql} from '../vendor/base/modules/import-kit/src/d1/budget.ts'
contract('RECORDS-005 BASE-SEC-003','real guard-template reservation bounds fresh authority for 20 tables, 80 fields and 10000 choices',async()=>{
 const h=await harness();try{const appId=createUlid(),draft={appId,name:'Maximum declared schema dimensions',tables:Array.from({length:20},(_,t)=>({id:createUlid(),label:'Table '+t,fields:Array.from({length:80},(_,f)=>({id:createUlid(),label:'Column '+f,type:t===0&&f===1?'select':'text',required:false,unique:false,...(t===0&&f===1?{options:Array.from({length:10000},(_,i)=>({id:createUlid(),label:String(i)}))}:{})}))}))},r=await h.runtime(),review=await r.manual.preview(h.ctx,draft),reserved=reserveNewBaseImportAuthority(h.ctx,appId,review.schemas);checkSql(reserved.capacityTemplate);await r.manual.adopt(h.ctx,createUlid(),review.id);const live=await h.runtime(),actual=await importAuthority(h.db,live.policy,h.ctx,appId),size=authoritySize(actual);checkSql(actual);assert.deepEqual(size,{sqlBytes:reserved.sqlBytes,boundBytes:reserved.boundBytes,parameters:reserved.parameters});assert.ok(await h.db.prepare('SELECT 1 WHERE '+actual.sql).bind(...actual.params).first());assert.equal(await h.db.prepare('SELECT 1 WHERE '+reserved.capacityTemplate.sql).bind(...reserved.capacityTemplate.params).first(),null,'Capacity ULID slot is never an actual authority grant')
 }finally{h.close()}
})
