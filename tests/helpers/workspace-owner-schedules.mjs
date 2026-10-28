import assert from 'node:assert/strict'
import {LAUNCH_APP_ID,launchEntities} from './launch-authority-runtime.mjs'

/** Exercise future owner schedules while their real authoring session is still live. */
export async function ownerScheduleOperations(h,{command,change,read,campaignId}){
 const now=Date.now(),monday=new Date(now)
 monday.setUTCHours(2,15,0,0)
 while(monday.getUTCDay()!==1||monday.getTime()<=now)monday.setUTCDate(monday.getUTCDate()+1)
 const schedules=[]
 for(const localRule of ['daily 08:00','weekly 1 08:00'])schedules.push(await command('launch.automation.save',{definition:{name:`Workspace schedule ${localRule}`,enabled:true,trigger:{kind:'schedule',localRule,timezone:'UTC'},actions:[{command:'add-activity',input:{campaignId,message:'Owner-authored workspace schedule'}}]}}))
 const runs=async id=>(await h.db.prepare('SELECT * FROM automation_runs WHERE automation_id=? ORDER BY id').bind(id).all()).results
 const definitions=(await h.db.prepare('SELECT * FROM automations WHERE id IN (?,?) ORDER BY id').bind(...schedules.map(s=>s.id)).all()).results
 const tick=async at=>{
  const result=await(await h.runtime.getWorker()).scheduled({cron:'* * * * *',scheduledTime:at})
  assert.equal(result.outcome,'ok','Owner schedule tick must finish without an authority or execution error')
 }
 await tick(monday.getTime())
 for(const schedule of schedules)assert.equal((await runs(schedule.id)).length,0,'The original UTC schedule is not due at 02:15 UTC')
 await change({timezone:'Asia/Kathmandu'})
 const monitor=(await read('/api/automations')).automations
 for(const schedule of schedules)assert.ok(monitor.find(row=>row.id===schedule.id).trigger.includes('Asia/Kathmandu'),'Monitor names the effective workspace timezone')
 assert.deepEqual((await h.db.prepare('SELECT * FROM automations WHERE id IN (?,?) ORDER BY id').bind(...schedules.map(s=>s.id)).all()).results,definitions,'Timezone changes preserve saved definitions and their UTC timestamps')
 await tick(monday.getTime())
 for(const schedule of schedules){
  const shifted=await runs(schedule.id)
  assert.equal(shifted.length,1,'Daily and weekly owner schedules move to 08:00 in the workspace zone')
  assert.equal(shifted[0].trigger_key,'schedule:'+monday.toISOString().slice(0,10))
 }
 await tick(monday.getTime()+345*60000)
 for(const schedule of schedules){
  assert.equal((await runs(schedule.id)).length,1,'The old explicit-zone fire time creates no extra run')
  await command('launch.automation.disable',{id:schedule.id},[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities.automation,recordId:schedule.id},version:schedule.version}])
 }
 await change({timezone:'UTC'})
}
