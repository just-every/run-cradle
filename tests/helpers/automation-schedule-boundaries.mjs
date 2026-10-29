import assert from 'node:assert/strict'

// Instants and expected local slots are independently specified. A null slot
// means no new run; local slot strings describe wall time, including skipped
// times, rather than converting those times back into real UTC instants.
const cases=[
 {name:'spring minutes',schedule:{unit:'minutes',every:15},startsAt:'2024-03-10T06:45:00Z',steps:[
  ['2024-03-10T06:44:00Z',null],
  ['2024-03-10T06:45:00Z','2024-03-10T01:45'],
  ['2024-03-10T06:59:00Z',null],
  ['2024-03-10T07:00:00Z','2024-03-10T03:00',true],
  ['2024-03-10T07:14:00Z',null],
  ['2024-03-10T07:15:00Z','2024-03-10T03:15'],
  ['2024-03-10T08:07:00Z','2024-03-10T04:00'],
 ]},
 {name:'spring missing daily time',schedule:{unit:'daily',time:'02:30'},startsAt:'2024-03-09T07:30:00Z',steps:[
  ['2024-03-09T07:29:00Z',null],
  ['2024-03-09T07:30:00Z','2024-03-09T02:30'],
  ['2024-03-10T06:59:00Z',null],
  ['2024-03-10T07:00:00Z','2024-03-10T02:30',true],
  ['2024-03-10T07:30:00Z',null],
  ['2024-03-11T06:29:00Z',null],
  ['2024-03-11T06:30:00Z','2024-03-11T02:30'],
 ]},
 {name:'fall minutes',schedule:{unit:'minutes',every:15},startsAt:'2024-11-03T05:15:00Z',steps:[
  ['2024-11-03T05:14:00Z',null],
  ['2024-11-03T05:15:00Z','2024-11-03T01:15'],
  ['2024-11-03T05:30:00Z','2024-11-03T01:30'],
  ['2024-11-03T05:45:00Z','2024-11-03T01:45'],
  ['2024-11-03T05:59:00Z',null],
  ['2024-11-03T06:00:00Z',null,true],
  ['2024-11-03T06:15:00Z',null],
  ['2024-11-03T06:30:00Z',null],
  ['2024-11-03T06:45:00Z',null],
  ['2024-11-03T06:59:00Z',null],
  ['2024-11-03T07:00:00Z','2024-11-03T02:00'],
 ]},
 {name:'fall hourly',schedule:{unit:'hourly',minute:30},startsAt:'2024-11-03T05:30:00Z',steps:[
  ['2024-11-03T05:29:00Z',null],
  ['2024-11-03T05:30:00Z','2024-11-03T01:30'],
  ['2024-11-03T05:59:00Z',null],
  ['2024-11-03T06:00:00Z',null,true],
  ['2024-11-03T06:30:00Z',null],
  ['2024-11-03T07:29:00Z',null],
  ['2024-11-03T07:30:00Z','2024-11-03T02:30'],
 ]},
 {name:'fall daily',schedule:{unit:'daily',time:'01:30'},startsAt:'2024-11-03T05:30:00Z',steps:[
  ['2024-11-03T05:29:00Z',null],
  ['2024-11-03T05:30:00Z','2024-11-03T01:30'],
  ['2024-11-03T06:29:00Z',null,true],
  ['2024-11-03T06:30:00Z',null],
  ['2024-11-04T06:29:00Z',null],
  ['2024-11-04T06:30:00Z','2024-11-04T01:30'],
 ]},
 {name:'monthly 31 nonleap and April',schedule:{unit:'monthly',day:31,time:'09:17'},startsAt:'2025-01-31T14:17:00Z',steps:[
  ['2025-01-31T14:16:00Z',null],
  ['2025-01-31T14:17:00Z','2025-01-31T09:17'],
  ['2025-02-28T14:17:00Z',null,true],
  ['2025-03-03T14:17:00Z',null],
  ['2025-03-31T13:16:00Z',null],
  ['2025-03-31T13:17:00Z','2025-03-31T09:17'],
  ['2025-04-30T13:17:00Z',null],
  ['2025-05-01T13:17:00Z',null],
  ['2025-05-31T13:17:00Z','2025-05-31T09:17'],
 ]},
 {name:'monthly 30 leap February',schedule:{unit:'monthly',day:30,time:'09:17'},startsAt:'2024-01-30T14:17:00Z',steps:[
  ['2024-01-30T14:16:00Z',null],
  ['2024-01-30T14:17:00Z','2024-01-30T09:17'],
  ['2024-02-29T14:17:00Z',null,true],
  ['2024-03-01T14:17:00Z',null],
  ['2024-03-30T13:16:00Z',null],
  ['2024-03-30T13:17:00Z','2024-03-30T09:17'],
  ['2024-04-30T13:17:00Z','2024-04-30T09:17'],
 ]},
 {name:'monthly 29 nonleap February',schedule:{unit:'monthly',day:29,time:'09:17'},startsAt:'2025-01-29T14:17:00Z',steps:[
  ['2025-01-29T14:16:00Z',null],
  ['2025-01-29T14:17:00Z','2025-01-29T09:17'],
  ['2025-02-28T14:17:00Z',null,true],
  ['2025-03-01T14:17:00Z',null],
  ['2025-03-29T13:16:00Z',null],
  ['2025-03-29T13:17:00Z','2025-03-29T09:17'],
 ]},
 {name:'monthly 29 leap February',schedule:{unit:'monthly',day:29,time:'09:17'},startsAt:'2024-01-29T14:17:00Z',steps:[
  ['2024-01-29T14:16:00Z',null],
  ['2024-01-29T14:17:00Z','2024-01-29T09:17'],
  ['2024-02-28T14:17:00Z',null],
  ['2024-02-29T14:16:00Z',null,true],
  ['2024-02-29T14:17:00Z','2024-02-29T09:17'],
  ['2024-03-29T13:16:00Z',null],
  ['2024-03-29T13:17:00Z','2024-03-29T09:17'],
 ]},
]

export async function automationScheduleBoundaries(h,{base,save,disable,runs,tick}){
 for(const fixture of cases){
  const name=`synthetic-cradle-149 ${fixture.name}`,anchor=(await h.create(name)).record
  const saved=await save({...base,name,actions:[{kind:'update',fieldId:h.statusId,value:name}],trigger:{kind:'schedule',recordId:anchor.id,startsAt:fixture.startsAt,schedule:fixture.schedule}})
  const expectedKeys=[]
  const check=async at=>{
   const message=`${fixture.name} at ${at}`,history=await runs(saved)
   assert.equal(history.length,expectedKeys.length,message+': exact run count')
   for(const run of history){assert.equal(run.recordId,anchor.id,message);assert.equal(run.state,'Complete',message);assert.deepEqual(run.actions.map(action=>action.state),['Complete'],message)}
   const record=(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/records/${anchor.id}`)).data.record
   assert.equal(record.fields[h.statusId].value,expectedKeys.length?name:null,message+': committed record value')
   assert.equal(record.version,anchor.version+expectedKeys.length,message+': one version per effect')
   const effects=(await h.db.prepare(`SELECT r.trigger_key,a.idempotency_key,c.state,c.action
    FROM automation_runs r JOIN launch_automation_actions a ON a.run_id=r.id
    LEFT JOIN command_admissions c ON c.command_id=a.idempotency_key WHERE r.automation_id=?`).bind(saved.id).all()).results
   assert.deepEqual(effects.map(effect=>effect.trigger_key).sort(),[...expectedKeys].sort(),message+': independently expected wall-clock slots')
   assert.equal(new Set(effects.map(effect=>effect.idempotency_key)).size,expectedKeys.length,message+': distinct committed effects')
   for(const effect of effects){assert.equal(effect.state,'committed',message);assert.equal(effect.action,'record.patch',message)}
  }
  for(const [at,slot,restart]of fixture.steps){
   if(restart)await h.restart()
   if(slot)expectedKeys.push(`${saved.id}:schedule:America/New_York:${Date.parse(slot+':00Z')/60000}:${anchor.id}`)
   await tick(at);await check(at)
   await tick(at);await check(at)
  }
  await h.restart();const last=fixture.steps.at(-1)[0];await tick(last);await check(last)
  await disable(saved)
 }
}
