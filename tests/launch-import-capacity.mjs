import test from 'node:test'
import assert from 'node:assert/strict'
import {environment} from './launch-support.mjs'
test('[IMPORT-001] 10000 row real D1 legacy preview preparation meets sixty seconds',async()=>{
 const e=await environment();try{const adapter=e.r.createLegacyImportAdapter(e.context,'campaign'),rows=Array.from({length:10000},(_,i)=>({id:e.r.createUlid(),values:{code:'BULK'+i,name:'Imported '+i,ownerId:e.actor,startDate:'2026-01-01',launchDate:'2026-10-01',health:'80'}})),started=performance.now(),prepared=await adapter.prepareBatch(e.ctx,rows),elapsed=performance.now()-started
 console.log('Real D1 legacy 10000-row prepare milliseconds:',elapsed);assert.equal(prepared.filter(r=>r.prepared).length,10000);assert.ok(elapsed<60000);assert.equal((await e.db.prepare('SELECT COUNT(*) n FROM campaigns').first()).n,0)
 }finally{await e.close()}
})
