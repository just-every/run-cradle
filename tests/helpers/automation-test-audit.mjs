import assert from 'node:assert/strict'

/** Read the actual test commands in the owner's retained log and both exports. */
export async function automationTestAudit(h,session,fixture,erased=false){
 const endpoint='/api/v1/launch/admin-audit?base='+fixture.appId
 const expected=new Set(fixture.runs.map(run=>run.id)),read=async suffix=>{
  const response=await fetch(h.origin+endpoint+suffix,{headers:{cookie:session.cookie,connection:'close'}})
  assert.equal(response.status,200,'The current owner can read retained test audit history')
  return response.text()
 }
 const rows=JSON.parse(await read('')).data.items.filter(row=>expected.has(row.eventId))
 assert.equal(rows.length,expected.size,'Every populated dry, live and Unknown test has one retained audit event')
 assert.equal(new Set(rows.map(row=>row.eventId)).size,expected.size,'Test replay does not duplicate the retained audit event')
 for(const row of rows){
  assert.equal(row.action,'automation.test')
  assert.equal(row.personId,erased?null:fixture.ownerId)
  assert.equal(row.person,erased?'Erased or unavailable person':fixture.owner.name)
 }
 for(const format of ['json','csv']){
  const text=await read('&format='+format)
  if(erased)for(const literal of [fixture.ownerId,fixture.owner.name,fixture.owner.email])assert.ok(!text.includes(literal),'Retained test exports expose no erased author identity')
  if(format==='json')assert.deepEqual(JSON.parse(text).data.items.filter(row=>expected.has(row.eventId)),rows,'JSON export preserves each test audit event')
  else for(const id of expected)assert.equal(text.split('\r\n').filter(line=>line.includes(id)&&line.includes('automation.test')).length,1,'CSV export preserves each test audit event once')
 }
 return rows.map(({personId,person,...event})=>event).toSorted((a,b)=>a.eventId.localeCompare(b.eventId))
}
