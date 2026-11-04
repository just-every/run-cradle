import assert from 'node:assert/strict'

// Independent provider receipts: different counters and resolved models expose
// swapped features, copied totals and use of the configured model as readback.
export const usageReceipts={
 'campaign-brief':{model:'synthetic-cradle-brief',inputTokens:13,outputTokens:7},
 'risk-readout':{model:'synthetic-cradle-risk',inputTokens:23,outputTokens:11},
 'lens-proposal':{model:'synthetic-cradle-lens',inputTokens:31,outputTokens:17},
}
export function usageClock(){
 // Reuse one pinned scheduler instant even if execution crosses midnight.
 const at=Date.now()+3600000,day=new Date(at+14*3600000).toISOString().slice(0,10)
 return{at,day,timezone:'Pacific/Kiritimati'}
}
export async function providerPause(){
 const started=Date.now()
 await new Promise(resolve=>setTimeout(resolve,40))
 return{started,finished:Date.now()}
}
export function assertUsageCalls(actual,expected,operatorId){
 assert.equal(actual.length,expected.length,'Every admitted call is publicly readable exactly once')
 assert.deepEqual(actual.map(call=>call.id).sort(),expected.map(call=>call.id).sort())
 for(const proof of expected){
  const call=actual.find(call=>call.id===proof.id)
  const fields=['id','day','feature','model','subject','inputTokens','outputTokens','state']
  assert.deepEqual(Object.fromEntries(fields.map(key=>[key,call[key]])),Object.fromEntries(fields.map(key=>[key,proof[key]])))
  assert.equal(call.operatorId,operatorId);assert.equal(call.runId,null)
  assert.equal(call.reportedCost,null,'Unreported provider cost must not become zero or an estimate')
  assert.ok(Number.isInteger(call.durationMs))
  assert.ok(call.durationMs>=proof.edge.finished-proof.edge.started,`Call ${proof.id} includes observed provider time`)
  assert.ok(call.durationMs<=proof.finished-proof.started,`Call ${proof.id} fits observed execution time`)
  assert.ok(Date.parse(call.createdAt)>=proof.started&&Date.parse(call.createdAt)<=proof.edge.started)
 }
}
export function usageTotals(expected){
 const groups=new Map()
 for(const call of expected){
  const key=call.day+' '+call.feature
  const row=groups.get(key)??{day:call.day,purpose:call.feature,requests:0,inputTokens:0,outputTokens:0,cost:null}
  row.requests++
  for(const key of ['inputTokens','outputTokens'])row[key]=row[key]===null||call[key]===null?null:row[key]+call[key]
  groups.set(key,row)
 }
 return[...groups.values()].sort((a,b)=>b.day.localeCompare(a.day)||a.purpose.localeCompare(b.purpose))
}
