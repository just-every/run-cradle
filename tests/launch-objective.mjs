import test from 'node:test'
import assert from 'node:assert/strict'
import {environment} from './launch-support.mjs'
test('[LAUNCH-OBJECTIVE] only exact canonical human completion can establish readiness',async()=>{
 const e=await environment();try{const c=await e.campaign(),d=await e.commit('deliverable.create',{fields:{campaignId:c.id,title:'Guide',ownerId:e.actor,dueDate:null}}),target={campaignId:c.id,requiredDeliverableIds:[d.id],requiredMilestoneIds:[],requiredDecisionIds:[]},verifier=e.r.createLaunchReadinessVerifier(e.db,e.policy)
 assert.equal((await verifier.check(e.ctx,c.id,target)).state,'failed')
 await e.commit('deliverable.complete',{id:d.id},e.expected('deliverable',d));const evidence=await verifier.check(e.ctx,c.id,target);assert.equal(evidence.state,'passed');assert.equal(evidence.witnesses[0].sourceId,d.id);assert.ok(evidence.guards.length>=2)
 const current=await e.db.prepare('SELECT version FROM deliverables WHERE id=?').bind(d.id).first();await e.commit('deliverable.reopen',{id:d.id},e.expected('deliverable',{id:d.id,version:current.version}));assert.equal((await verifier.check(e.ctx,c.id,target)).state,'failed')
 const all=await e.db.prepare(`SELECT 1 WHERE ${evidence.guards.map(g=>`(${g.sql})`).join(' AND ')}`).bind(...evidence.guards.flatMap(g=>g.values)).first();assert.equal(all,null)
 }finally{await e.close()}
})
