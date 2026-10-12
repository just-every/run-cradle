const { readActivityMessage } = await import('../src/apps/launch/activity-message.ts')
import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import { contract } from './contract.mjs'
const { activityActions, activityValue } = await import('../src/core/features/portfolio/ui/activity-presentation.ts')
const { campaignLifecycle } = await import('../src/apps/launch/lifecycle.ts')
const { formatDate, formatDateTime } = await import('../src/core/features/portfolio/ui/portfolio-format.ts')
contract('CAMP-002', 'Launch selects use the current validation policy', () => {
 assert.deepEqual(campaignLifecycle.phases, ['Planning','Build','Production','Review','Launch prep'])
 assert.deepEqual(campaignLifecycle.statuses, ['On track','Watch','At risk','Blocked'])
})
contract('ACT-003', 'Calendar dates and due instants use human dates with workspace timezone', () => {
 assert.equal(formatDate('2026-10-20'), 'Oct 20, 2026')
 assert.equal(formatDateTime('2026-10-20T15:00:00Z', 'Australia/Brisbane'), 'Oct 21, 2026, 1:00 AM')
 assert.equal(formatDateTime('2026-10-20T15:00:00Z', 'America/New_York'), 'Oct 20, 2026, 11:00 AM')
})
contract('ACT-001', 'One readable action retains all field facts and separates escalation from approval', () => {
 const actor={id:'mira',name:'Mira Example',initials:'ME'}
 const base={actor,occurredAt:'2026-10-08T09:00:00Z',subjectId:'decision',subjectTitle:'Launch date',type:'decision.updated',description:'decision.updated: state'}
 const facts=['state','outcome_at','outcome_by_id','rationale','risk_id'].map((fieldName,index)=>({...base,id:String(index),fieldName,previousValue:'before',nextValue:fieldName==='state'?'Approved':'after'}))
 const actions=activityActions([...facts,{...base,id:'risk',subjectId:'risk',subjectTitle:'Supplier delay',type:'risk.updated',fieldName:'state',previousValue:'Watching',nextValue:'Escalated'}])
 assert.equal(actions.length,2);assert.equal(actions[0].description,'approved decision “Launch date”');assert.equal(actions[0].facts.length,5)
 assert.deepEqual(actions[0].facts,facts);assert.equal(actions[1].description,'escalated risk “Supplier delay”')
})

contract('ACT-001', 'Command identity separates simultaneous actions and groups linked escalation facts', () => {
 const base={actor:{id:'mira',name:'Mira Example',initials:'ME'},occurredAt:'2026-10-08T09:00:00Z',description:'',subjectTitle:'Risk',previousValue:null}
 const entries=[{...base,id:'1',actionId:'escalate',subjectId:'risk',type:'risk.updated',fieldName:'state',nextValue:'Escalated'},{...base,id:'2',actionId:'escalate',subjectId:'decision',type:'decision.created',fieldName:'state',nextValue:'Awaiting approval'},{...base,id:'3',actionId:'approve',subjectId:'decision',subjectTitle:'Launch date',type:'decision.updated',fieldName:'state',nextValue:'Approved'}]
 const actions=activityActions(entries); assert.equal(actions.length,2);assert.equal(actions[0].facts.length,2);assert.equal(actions[0].description,'escalated risk “Risk”');assert.equal(actions[1].description,'approved decision “Launch date”')
})

contract('ACT-001', 'Structured activity provenance fails explicitly when malformed and preserves original prose', () => {
 const message='decision.updated: state',commandId='00000000000000000000000001'
 assert.deepEqual(readActivityMessage(JSON.stringify({commandId,message})),{actionId:commandId,message})
 assert.deepEqual(readActivityMessage('Owner added a comment'),{actionId:null,message:'Owner added a comment'})
 for(const value of ['{"commandId":',JSON.stringify({commandId,message:42}),JSON.stringify({commandId:'wrong',message}),JSON.stringify({commandId,message,extra:'unexpected'})]) assert.throws(()=>readActivityMessage(value),/Campaign activity command metadata is invalid/)
})

contract('ACT-003', 'Change details format calendar and instant facts without modifying canonical audit values', () => {
 const instant='2026-10-20T15:00:00Z', epoch=String(Date.parse(instant))
 assert.equal(activityValue('launch_date','2026-10-20','Australia/Brisbane'),'Oct 20, 2026')
 assert.equal(activityValue('outcome_at',instant,'Australia/Brisbane'),'Oct 21, 2026, 1:00 AM')
 assert.equal(activityValue('outcome_at',epoch,'America/New_York'),'Oct 20, 2026, 11:00 AM')
 assert.equal(instant,'2026-10-20T15:00:00Z');assert.equal(activityValue('signal','2026-10-20','Australia/Brisbane'),'2026-10-20')
})

contract('ACT-001', 'A committed campaign import reads as the actual user action and retains its fact', () => {
 const fact={id:'import',actor:{id:'mira',name:'Mira Example',initials:'ME'},occurredAt:'2026-10-08T09:00:00Z',subjectId:'campaign',subjectTitle:'Autumn collection',type:'import.committed',description:'CSV import committed',fieldName:null,previousValue:null,nextValue:null}
 const [action]=activityActions([fact]);assert.equal(action.description,'imported campaign “Autumn collection”');assert.deepEqual(action.facts,[fact])
})
