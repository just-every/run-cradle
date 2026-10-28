// Table tools Fill down and Ctrl/Cmd+D run in the existing Home browser scenario;
// this native range contract also runs on CI workers without Chromium.
import './helpers/typescript-loader.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openImportD1 } from './helpers/records-import-d1-runtime.mjs'
import { harness, add } from './helpers/records-manual-harness.mjs'
import { newField } from '../src/ui/records/schema/templates.ts'
import { createUlid } from '../src/core/shared/ids.ts'
import { createCommandHttp } from '../src/core/registry/http.ts'
import { createRecordHttp } from '../src/domains/records/routes.server.ts'

test('VIEW-014 VIEW-008 VIEW-015 native HTTP range paste is atomic, reversible, stale-safe and policy checked', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cradle-range-'))
  let storage
  try {
    storage = await openImportD1(directory, true)
    const h = await harness(storage), appId = createUlid()
    const fields = [newField('Name'), newField('Number', 'number'), newField('Date', 'date'), newField('Checked', 'boolean'), newField('Website', 'url'), newField('Memo')]
    const draft = { appId, name: 'Range fixture', tables: [{ id: createUlid(), label: 'Rows', fields }] }
    const { r } = await h.create(draft), schema = r.registry.get(appId, draft.tables[0].id).schema
    const initial = []
    for (let index = 0; index < 50; index++) initial.push(await add(h, r, schema, { [fields[0].id]: `Before ${index}`, [fields[1].id]: '1', [fields[2].id]: '2026-10-17', [fields[3].id]: false, [fields[4].id]: 'https://before.example' }))
    const http = createCommandHttp({ commands: r.commands, admission: r.admission, authenticate: async () => h.ctx })
    const read = createRecordHttp({ ...r.services, authenticate: async () => h.ctx })
    async function query() {
      const response = await read.fetch(new Request(`https://records.example/api/v1/apps/${appId}/entities/${schema.id}/query`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ limit: 100, sort: [{ fieldId: fields[0].id, direction: 'asc' }] }) }))
      assert.equal(response.status, 200, await response.clone().text())
      return (await response.json()).data.items
    }
    const values = index => ({ [fields[0].id]: `Pasted ${String(index).padStart(2, '0')}`, [fields[1].id]: `${index}.25`, [fields[2].id]: '2027-01-15', [fields[3].id]: true, [fields[4].id]: `https://after.example/${index}` })
    const payload = { appId, entityId: schema.id, rows: initial.map((row, index) => ({ recordId: row.id, changes: values(index) })) }
    const expected = rows => rows.map(row => ({ ref: row.ref, version: row.version }))
    async function patch(input, revisions, status = 200) {
      const response = await http.fetch(new Request('https://records.example/api/v1/commands/record.patch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ commandId: createUlid(), expected: revisions, input }) }))
      const body = await response.json()
      assert.equal(response.status, status, JSON.stringify(body))
      return body
    }
    const invalid = structuredClone(payload)
    invalid.rows[10].changes[fields[1].id] = 'not a number'
    invalid.rows[20].changes[fields[2].id] = '2027-02-30'
    const refused = await patch(invalid, expected(initial), 400)
    assert.equal(refused.error.issues.length, 2)
    assert.match(refused.error.issues[0].message, /Row 11, Number/)
    assert.match(refused.error.issues[1].message, /Row 21, Date/)
    const snapshot = rows => rows.map(row => ({ id: row.id, version: row.version, fields: row.fields })).sort((a, b) => a.id.localeCompare(b.id))
    assert.deepEqual(snapshot(await query()), snapshot(initial))
    const pasted = (await patch(payload, expected(initial))).data.value
    assert.equal(pasted.rows.length, 50)
    assert.equal(pasted.inverse.length, 50)
    for (const [index, row] of pasted.rows.entries()) { assert.equal(row.version, 2); for (const [id, value] of Object.entries(values(index))) assert.deepEqual(row.fields[id].value, value) }
    assert.deepEqual(snapshot(await query()), snapshot(pasted.rows))
    const restored = (await patch({ appId, entityId: schema.id, rows: pasted.inverse }, expected(pasted.rows))).data.value
    assert.deepEqual((await query()).map(row => row.fields[fields[0].id].value).sort(), initial.map(row => row.fields[fields[0].id].value).sort())
    const redone = (await patch({ appId, entityId: schema.id, rows: restored.inverse }, expected(restored.rows))).data.value
    assert.equal(redone.rows.length, 50)
    const inverseWithCells=result=>result.inverse.map(change=>({...change,unchangedSince:result.rows.find(row=>row.id===change.recordId).version,ifValues:Object.fromEntries(Object.keys(change.changes).map(id=>[id,result.rows.find(row=>row.id===change.recordId).fields[id].value]))}))
    // An unrelated cell edit must survive a cell-scoped undo and redo.
    const target=redone.rows[1]
    await patch({ref:target.ref,changes:{[fields[5].id]:'Colleague note'}},expected([target]))
    const one={rows:[target],inverse:[redone.inverse[1]]}
    const undoneCell=(await patch({appId,entityId:schema.id,rows:inverseWithCells(one)},expected([target]))).data.value
    assert.equal(undoneCell.rows[0].fields[fields[5].id].value,'Colleague note')
    const redoneCell=(await patch({appId,entityId:schema.id,rows:inverseWithCells(undoneCell)},expected(undoneCell.rows))).data.value
    assert.equal(redoneCell.rows[0].fields[fields[5].id].value,'Colleague note')
    const changed = (await patch({ ref: redone.rows[0].ref, changes: { [fields[0].id]: 'Concurrent edit' } }, expected([redone.rows[0]]))).data.value
    const beforeStale = await query()
    const stale = await patch({ appId, entityId: schema.id, rows: redone.inverse }, expected(redone.rows), 409)
    assert.match(stale.error.issues.find(issue => issue.fieldId === fields[0].id).message, /Row 1, Name:.*Concurrent edit/)
    assert.equal(stale.error.currentVersions[0].version, changed.version)
    assert.deepEqual(snapshot(await query()), snapshot(beforeStale))
    const guardedConflict=await patch({appId,entityId:schema.id,rows:inverseWithCells(redone)},expected(redone.rows),409)
    assert.equal(guardedConflict.error.issues.length,1)
    assert.equal(guardedConflict.error.issues[0].fieldId,fields[0].id)
    assert.deepEqual(snapshot(await query()),snapshot(beforeStale))
    const policy = await h.db.prepare('SELECT id,rules_json FROM authority_policies WHERE app_id=?').bind(appId).first()
    const rules = JSON.parse(policy.rules_json)
    for (const rule of rules) if (rule.entityId === schema.id) rule.writableFields = []
    await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules), policy.id).run()
    await patch({ appId, entityId: schema.id, rows: [{ recordId: changed.id, changes: { [fields[0].id]: 'Forbidden' } }] }, expected([changed]), 403)
    assert.deepEqual(snapshot(await query()), snapshot(beforeStale))
    await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(policy.rules_json,policy.id).run()
    // A real competing command commits after preparation, before the final SQL guard.
    const current=(await query()).find(row=>row.id===changed.id)
    let intervene=true
    const racing=await h.runtime(admission=>({...admission,async commit(ctx,plan){
      if(intervene&&plan.action==='record.patch'){
        intervene=false
        await patch({ref:current.ref,changes:{[fields[1].id]:'7.25'}},expected([current]))
      }
      return admission.commit(ctx,plan)
    }}))
    const racedHttp=createCommandHttp({...racing,authenticate:async()=>h.ctx})
    const response=await racedHttp.fetch(new Request('https://records.example/api/v1/commands/record.patch',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({commandId:createUlid(),expected:expected([current]),input:{appId,entityId:schema.id,rows:[{recordId:current.id,changes:{[fields[1].id]:'99'},ifValues:{[fields[1].id]:current.fields[fields[1].id].value}}]}})}))
    const raced=await response.json();assert.equal(response.status,409)
    assert.match(raced.error.issues?.find(issue=>issue.fieldId===fields[1].id)?.message??'',/Number:.*current value is.*7\.25/)
    assert.equal((await query()).find(row=>row.id===current.id).fields[fields[1].id].value,'7.25')
    const beforeRestriction=(await query()).find(row=>row.id===current.id)
    let restrict=true
    const restricted=await h.runtime(admission=>({...admission,async commit(ctx,plan){
      if(restrict&&plan.action==='record.patch'){
        restrict=false
        await patch({ref:beforeRestriction.ref,changes:{[fields[1].id]:'810045.75'}},expected([beforeRestriction]))
        const hidden=JSON.parse(policy.rules_json)
        for(const rule of hidden)if(rule.entityId===schema.id){rule.readableFields=rule.readableFields.filter(id=>id!==fields[1].id);rule.writableFields=rule.writableFields.filter(id=>id!==fields[1].id)}
        await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(hidden),policy.id).run()
      }
      return admission.commit(ctx,plan)
    }}))
    const restrictedHttp=createCommandHttp({...restricted,authenticate:async()=>h.ctx})
    const hiddenResponse=await restrictedHttp.fetch(new Request('https://records.example/api/v1/commands/record.patch',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({commandId:createUlid(),expected:expected([beforeRestriction]),input:{ref:beforeRestriction.ref,changes:{[fields[1].id]:'100'}}})}))
    assert.equal(hiddenResponse.status,403)
    assert.doesNotMatch(await hiddenResponse.text(),/810045\.75/,'Conflict diagnosis must not disclose a value hidden after preparation')
  } finally { await storage?.close(); await rm(directory, { recursive: true, force: true }) }
})
