import test from 'node:test'
import assert from 'node:assert/strict'
import {environment} from './launch-support.mjs'
import { capacityFailure } from './helpers/capacity-message.mjs'
test('[SEARCH-001 BASE-CAPACITY] real 50k campaign capacity, indexed prefix and bounded counts',async()=>{
 const e=await environment();try{const {db,r,actor}=e
 await db.prepare("WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<50000) INSERT INTO campaigns(id,created_at,updated_at,version,code,name,owner_id,start_date,launch_date,objective,status_summary,phase,status,health,health_updated_at,budget_minor,spend_minor) SELECT printf('%026d',100000+n),1,1,1,'S'||n,'Searchable campaign '||n,?,'2026-01-01','2026-10-01','','','Planning','On track',70,1,0,0 FROM seq").bind(actor).run()
 await assert.rejects(()=>e.campaign('OVER'),error=>error.code==='capacity_limit')
 const repository=r.createSearchRepository({$client:db}),times=[]
 for(let i=0;i<20;i++){const start=performance.now(),rows=await repository.search('Searchab',false);times.push(performance.now()-start);assert.equal(rows.length,20);assert.equal(rows[0].recordType,'Campaign')}
 times.sort((a,b)=>a-b);console.log('Local real D1 50k campaign prefix search p95 milliseconds:',times[18]);assert.ok(times[18]<500,capacityFailure(times[18],500))
 const page=await r.createLaunchReader(db,e.policy).list(e.ctx,'campaign',{limit:200});assert.equal(page.items.length,200);assert.deepEqual(page.total,{kind:'at_least',value:10000})
 }finally{await e.close()}
})
