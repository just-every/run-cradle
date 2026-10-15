import assert from 'node:assert/strict'
import {expectRead} from './repair-outcome-manual.mjs'

export async function issueReviewedGrant(h,spec){
 const prepared=await h.post('grant.prepare',{spec}),expected=[{ref:h.repairRef('workOrders',prepared.value.id),version:1}]
 const input={grantId:prepared.value.id,confirmedImpactHash:prepared.value.impactHash}
 const wrong=await h.post('grant.issue',{...input,confirmedImpactHash:'0'.repeat(64)},expected,{status:409})
 assert.equal(wrong.body.error.code,'version_conflict')
 assert.deepEqual(await h.db.prepare('SELECT state,version FROM authority_grants WHERE id=?').bind(input.grantId).first(),{state:'proposed',version:1})
 assert.equal((await h.db.prepare('SELECT count(*) n FROM authority_budgets WHERE grant_id=?').bind(input.grantId).first()).n,0)
 const issued=await h.post('grant.issue',input,expected)
 assert.deepEqual((await h.post('grant.issue',input,expected,{commandId:issued.commandId})).body.data,issued.body.data)
 assert.equal((await h.db.prepare('SELECT count(*) n FROM authority_grants WHERE id=?').bind(input.grantId).first()).n,1)
 assert.deepEqual(await h.db.prepare('SELECT state,version FROM authority_grants WHERE id=?').bind(input.grantId).first(),{state:'active',version:2})
 assert.equal((await h.db.prepare("SELECT count(*) n FROM command_admissions WHERE action='grant.issue' AND command_id=?").bind(issued.commandId).first()).n,1)
 return issued
}
export async function receiptAuthority(h,grant,receiptId){
 const route='/api/v1/receipts/'+receiptId,before=await h.read(route)
 await h.post('grant.revoke',{grantId:grant.id,reason:'Stop future provider work after the completed receipt'},[{ref:h.repairRef('workOrders',grant.id),version:grant.version}])
 assert.deepEqual(await h.read(route),before,'Grant revocation retains readable original effect evidence')
 await h.db.prepare("UPDATE authority_principals SET state='removed' WHERE id=?").bind(h.owner).run()
 const {body}=await expectRead(h,route,401);assert.equal(body.error.code,'signed_out');assert.equal(body.data,undefined);assert.ok(!JSON.stringify(body).includes(receiptId),'Removed principal receives no receipt identity')
 await h.db.prepare("UPDATE authority_principals SET state='active' WHERE id=?").bind(h.owner).run()
 assert.deepEqual(await h.read(route),before)
}
