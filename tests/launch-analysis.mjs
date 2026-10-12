import test from 'node:test'
import assert from 'node:assert/strict'
import {environment} from './launch-support.mjs'
test('[AI-001 AI-003 AI-006] context is authorized before reads and excludes comments/custom fields',async()=>{
 const e=await environment();try{
 const {r,db,ctx,actor,context}=e,c=await e.campaign('AICTX')
 const custom=await e.commit('custom-field.save',{field:{name:'Private forecast',type:'text'}})
 await e.commit('campaign.patch',{id:c.id,changes:{customFields:{[custom.id]:'PRIVATE_CUSTOM_SECRET'}}},e.expected('campaign',c))
 await db.prepare('INSERT INTO comments(id,created_at,updated_at,version,campaign_id,author_id,body) VALUES(?,1,1,1,?,?,?)').bind(r.createUlid(),c.id,actor,'PRIVATE_COMMENT_SECRET').run()
 const source=await r.launchAnalysisContext(context,ctx,{feature:'campaign-brief',campaignId:c.id})
 assert.equal(source.data.campaign.code,'AICTX');assert.ok(!JSON.stringify(source).includes('PRIVATE_CUSTOM_SECRET'));assert.ok(!JSON.stringify(source).includes('PRIVATE_COMMENT_SECRET'));assert.deepEqual(source.data.campaign.tags,[]);assert.ok(!Object.hasOwn(source.data,'comments'))
 let reads=0
 const denied={...context,db:{prepare(){reads++;throw Error('Raw domain read before authority')}},policy:{...e.policy,scope:async()=>{throw Error('No provider context authority')}}}
 await assert.rejects(()=>r.launchAnalysisContext(denied,ctx,{feature:'campaign-brief',campaignId:c.id}),/No provider context authority/);assert.equal(reads,0)
 const masked={...context,policy:{...e.policy,scope:async(c,i)=>({...await e.policy.scope(c,i),readableFieldIds:[]})}}
 await assert.rejects(()=>r.launchAnalysisContext(masked,ctx,{feature:'campaign-brief',campaignId:c.id}),/not authorized/)
 let called=false
 await assert.rejects(()=>r.prepareAnalysisTask(context,{profile:async()=>{called=true;throw Error('No provider')},context:async()=>{throw Error('No context')},model:{}},ctx,e.command('analysis.request',{feature:'campaign-brief',campaignId:c.id})),/AI is disabled/)
 assert.equal(called,false)
 }finally{await e.close()}
})
