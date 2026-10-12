import test from 'node:test'
import assert from 'node:assert/strict'
import { environment } from './launch-support.mjs'

test('[BASE-CAPACITY VIEW-005] campaign pages retain each record projection across cursors', async () => {
 const e=await environment()
 try {
  const custom=await e.commit('custom-field.save',{field:{name:'Page value',type:'text'}})
  const campaigns=[]
  for(const code of ['PAGE-A','PAGE-B','PAGE-C']) campaigns.push(await e.campaign(code))
  for(const [index,campaign] of campaigns.entries()) {
   await e.commit('campaign.patch',{id:campaign.id,changes:{customFields:{[custom.id]:`value-${index}`}}},e.expected('campaign',campaign))
   await e.db.prepare('INSERT INTO campaign_tags(id,created_at,updated_at,version,campaign_id,tag) VALUES(?,1,1,1,?,?)').bind(e.r.createUlid(),campaign.id,`tag-${index}`).run()
   const deliverable=await e.commit('deliverable.create',{fields:{campaignId:campaign.id,title:`Task ${index}`,ownerId:e.actor,dueDate:null}})
   if(index===1)await e.commit('deliverable.complete',{id:deliverable.id},e.expected('deliverable',deliverable))
   await e.commit('risk.create',{fields:{campaignId:campaign.id,title:`Risk ${index}`,ownerId:e.actor,severity:['Low','High','Critical'][index],dueDate:null,signal:'Observed',mitigation:'Review'}})
  }
  const reader=e.r.createLaunchReader(e.db,e.policy)
  const first=await reader.list(e.ctx,'campaign',{limit:2}),second=await reader.list(e.ctx,'campaign',{limit:2,cursor:first.nextCursor})
  assert.equal(first.items.length,2);assert.equal(second.items.length,1);assert.equal(second.nextCursor,null)
  assert.deepEqual(first.total,{kind:'exact',value:3})
  const all=[...first.items,...second.items];assert.equal(new Set(all.map(row=>row.id)).size,3)
  for(const [index,campaign]of campaigns.entries()){
   const row=all.find(row=>row.id===campaign.id)
   assert.deepEqual(row.tags,[`tag-${index}`]);assert.equal(row.deliverableTotal,1);assert.equal(row.deliverableComplete,index===1?1:0)
   assert.equal(row.riskRating,['Low','High','Critical'][index]);assert.deepEqual(row.customFields,{[custom.id]:`value-${index}`})
   assert.deepEqual(await reader.get(e.ctx,'campaign',campaign.id),row)
  }
 }finally{await e.close()}
})
