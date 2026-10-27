import {test} from 'node:test'
import assert from 'node:assert/strict'
import {fixture} from './repair-case-harness.mjs'
async function setup(){
 const h=await fixture({realEvidence:true}),r=h.r,id=h.b.ev.sourceId
 await h.db.prepare('INSERT INTO evidence_source_versions(id,source_id,version,sha256,content,file_ids,known_at) VALUES(?,?,2,?,?,?,?)').bind(r.createUlid(),id,'corrected-content-sha','Corrected quotation: additional excluded work','[]',h.ctx.now).run()
 await h.db.prepare('UPDATE evidence_sources SET current_version=2 WHERE id=?').bind(id).run()
 const descriptors=r.createDescriptorRegistry(r.repairDescriptors),http=r.createEvidenceHttp({...h.d,admission:h.admission,access:{checkReference:r.createReferenceAccess(h.db,h.d.policy,r.createApplicationEntityRegistry(descriptors))},cursorSecret:'synthetic-source-history-cursor-secret',authenticate:async()=>h.ctx,resolveCapture:async()=>{throw new Error('No writes in this read test')}})
 return {...h,id,get:(path,sourceId=id)=>http.request('/api/v1/sources/'+sourceId+path)}
}
test('cited source version journey preserves immutable bytes and current policy through erasure',async()=>{
 const h=await setup()
 try{
  try{
  const old=await h.get('?version=1'),latest=await h.get('')
  assert.equal(old.status,200);assert.equal(old.headers.get('cache-control'),'no-store')
  const original=(await old.json()).data,current=(await latest.json()).data
  assert.equal(original.version,1);assert.equal(current.version,2);assert.notEqual(original.sha256,current.sha256)
  assert.equal(original.accessibleContentUrl,`/api/v1/sources/${h.id}/content?version=1`)
  assert.equal(current.accessibleContentUrl,`/api/v1/sources/${h.id}/content?version=2`)
  assert.equal((await (await h.get('/content?version=1')).json()).data.text,'Synthetic private credential source')
  assert.equal((await (await h.get('/content?version=2')).json()).data.text,'Corrected quotation: additional excluded work')
  assert.equal((await h.get('?version=3')).status,404)
  for(const version of ['0','-1','1.5','garbage','9007199254740992',''])assert.equal((await h.get('?version='+version)).status,400)
 }catch(error){throw new Error("cited source metadata and content read exact immutable bytes while latest stays distinct; unsupported versions fail closed"+': '+error.message,{cause:error})}
  try{
  await h.auth.setRules(h.auth.rules.map(rule=>rule.entityId===h.r.REPAIR_ENTITIES.stores?{...rule,readableFields:rule.readableFields.filter(id=>id!==h.r.repairFieldId('stores','repair_evidence'))}:rule))
  const missing=h.r.createUlid()
  assert.equal(await h.db.prepare('SELECT id FROM evidence_sources WHERE id=?').bind(missing).first(),null)
  for(const path of ['?version=1','/content?version=1','?version=2','/content?version=2']){
   const outcomes=[]
   for(const sourceId of [h.id,missing]){
    const response=await h.get(path,sourceId)
    assert.equal(response.status,404)
    const body=await response.json()
    assert.equal(body.error.code,'not_found')
    // Only the per-request identifier and requested path differ between these reads.
    const {requestId,operation,...error}=body.error
    outcomes.push({...body,error})
   }
   assert.deepEqual(outcomes[0],outcomes[1])
  }
  await h.auth.setRules(h.auth.rules)
  await h.db.prepare('UPDATE evidence_sources SET erased_at=? WHERE id=?').bind(h.ctx.now,h.id).run()
  for(const path of ['?version=1','/content?version=1','?version=2','/content?version=2'])assert.equal((await h.get(path)).status,404)
 }catch(error){throw new Error("historical source reads retain current field policy and erasure checks for both metadata and content"+': '+error.message,{cause:error})}
 }finally{await h.close()}
})
