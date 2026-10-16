import assert from 'node:assert/strict'

export async function expectRead(h,route,status){
 const response=await fetch(h.origin+route,{headers:{cookie:h.ownerSession.cookie}})
 const body=await response.json();assert.equal(response.status,status,`${route}: ${JSON.stringify(body)}`)
 return {response,body}
}
export async function noManualEffects(h){
 for(const table of ['operation_wakes','execution_runs','admission_outbox'])assert.equal((await h.db.prepare(`SELECT count(*) n FROM ${table}`).first()).n,0,table)
 assert.equal(h.edge.calls.length,0)
}
export async function report(h){
 const source=await h.source('Synthetic original report '+h.id())
 const intake=await h.post('intake.submit',{appId:h.REPAIRS_APP_ID,formId:h.REPAIRS_FORM_ID,values:{},text:'Cooling fault '+h.id(),fileIds:[],sourceId:source.sourceId})
 return {source,intake}
}
export async function openInput(h,id){
 const context=await h.read(`/api/v1/intakes/${id}/open-context`)
 return {input:{intakeId:id,asset:context.asset,store:context.store,sourceVersions:context.sourceVersions,mandate:{id:context.mandates[0].id,version:context.mandates[0].version}},expected:[context.intake],context}
}
export async function openReport(h,id){const command=await openInput(h,id);return h.post('repair.open',command.input,command.expected)}
async function membership(h,state){await h.db.prepare('UPDATE authority_memberships SET state=?,version=version+1 WHERE principal_id=? AND app_id=?').bind(state,h.owner,h.REPAIRS_APP_ID).run()}

export async function manualAdmission(h){
 const context=await h.read('/api/v1/repairs/intake-context')
 assert.deepEqual(context.stores.map(s=>s.ref.recordId),[h.fixture.storeId]);assert.deepEqual(context.assets.map(a=>a.ref.recordId),[h.fixture.assetId])
 const source=await h.source('Explicit asset cooling report'),input={appId:h.REPAIRS_APP_ID,formId:h.REPAIRS_FORM_ID,values:{[context.fieldIds.store]:context.stores[0].ref,[context.fieldIds.asset]:context.assets[0].ref},text:'Mounted unit is warm',fileIds:[],sourceId:source.sourceId}
 const expected=[await h.ref('stores',h.fixture.storeId),await h.ref('assets',h.fixture.assetId)],submitted=await h.post('intake.submit',input,expected)
 assert.equal(submitted.value.state,'ready')
 assert.deepEqual((await h.post('intake.submit',input,expected,{commandId:submitted.commandId})).body.data,submitted.body.data)
 assert.equal((await h.db.prepare('SELECT count(*) n FROM repair_intakes').first()).n,1)
 assert.deepEqual((await h.read(`/api/v1/intakes/${submitted.value.id}`)).exactIdentity,h.repairRef('assets',h.fixture.assetId))
 assert.equal((await h.read('/api/v1/intakes?state=ready&limit=1')).items.length,1)
 await expectRead(h,'/api/v1/intakes?state=fiction',400);await expectRead(h,'/api/v1/intakes?appId='+h.id(),404)
 await membership(h,'removed')
 assert.equal((await h.post('intake.submit',input,expected,{commandId:submitted.commandId,status:404})).body.error.code,'not_found')
 await expectRead(h,'/api/v1/repairs/intake-context',403);await expectRead(h,`/api/v1/intakes/${submitted.value.id}`,403)
 assert.equal((await h.db.prepare('SELECT count(*) n FROM repair_intakes').first()).n,1)
 await membership(h,'active')
 const command=await openInput(h,submitted.value.id);assert.equal(command.context.mandates.length,1)
 const opened=await h.post('repair.open',command.input,command.expected),repair=opened.value
 assert.equal(repair.stage,'triage');assert.equal(repair.case.mandateId,h.fixture.mandateId);assert.equal(repair.case.mandateVersion,command.input.mandate.version)
 assert.equal(repair.case.accountableId,h.owner);assert.deepEqual(repair.case.sourceIds,[source.sourceId]);assert.equal(repair.case.nextWakeAt,null)
 for(const table of ['repair_intakes','operation_cases','repair_jobs','repair_work_orders'])assert.equal((await h.db.prepare(`SELECT count(*) n FROM ${table}`).first()).n,1,table)
 assert.deepEqual((await h.post('repair.open',command.input,command.expected,{commandId:opened.commandId})).body.data,opened.body.data)
 const intake=await h.db.prepare('SELECT * FROM repair_intakes WHERE id=?').bind(submitted.value.id).first()
 assert.equal(intake.lifecycle,'admitted');assert.equal(intake.case_id,repair.case.id);assert.equal(intake.work_order_id,repair.workOrder.id)
 const work=await h.db.prepare('SELECT * FROM repair_work_orders WHERE id=?').bind(repair.workOrder.id).first(),job=await h.db.prepare('SELECT * FROM repair_jobs WHERE id=?').bind(work.job_id).first()
 assert.equal(work.intake_id,intake.id);assert.equal(work.case_id,repair.case.id);assert.equal(job.intake_id,intake.id);assert.equal(job.case_id,repair.case.id)
 assert.equal((await h.read(`/api/v1/repairs/${repair.workOrder.id}`)).stage,'triage')
 const currentCase=await h.read(`/api/v1/cases/${repair.case.id}`)
 assert.ok(currentCase.allowedActions.every(a=>['case.pause','case.resume','case.takeover','case.cancel'].includes(a.action)),'Manual controls confer no autonomous actions')
 const facts=(await h.db.prepare("SELECT * FROM admission_audit WHERE action='repair.open'").all()).results
 assert.ok(facts.length>=3);assert.ok(facts.every(f=>JSON.parse(f.source_ids_json).includes(source.sourceId)))
 assert.equal((await h.post('repair.open',command.input,[await h.ref('intakes',intake.id)],{status:409})).body.error.code,'invalid_transition')
 await membership(h,'removed')
 assert.equal((await h.post('repair.open',command.input,command.expected,{commandId:opened.commandId,status:404})).body.error.code,'not_found')
 await expectRead(h,`/api/v1/cases/${repair.case.id}`,403)
 await membership(h,'active');await noManualEffects(h)
 for(const table of ['repair_intakes','operation_cases','repair_jobs','repair_work_orders'])assert.equal((await h.db.prepare(`SELECT count(*) n FROM ${table}`).first()).n,1,`${table} after replay and refusals`)
 return repair
}
