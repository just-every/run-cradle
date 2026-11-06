import {recordsBrowserWidths} from './records-browser-widths.mjs'
import {displayAction,tableAction,tableCommand} from './records-table-tools.mjs'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'
import { recordsBrowserRuntime } from './records-browser-runtime.mjs'
import { recordsJourney } from './records-browser-journey.mjs'
import { browserCall, liveCommand } from './records-live-fixture.mjs'
import { createUlid } from '../../src/core/shared/ids.ts'
import { newField } from '../../src/ui/records/schema/templates.ts'

const schemaEntity = '00000000000000000000000001'
const titles={A:'Confirm scope',B:'Build supplier portal',C:'Review delivery requirements',D:'Run receiving trial',E:'Approve packaging',F:'Release purchase orders',G:'Stage warehouse rollout',H:'Go live'}
const date = day => new Date(Date.UTC(2026, 9, 19 + day)).toISOString().slice(0, 10)

async function fixture(page, h, width) {
  const appId = createUlid(), entityId = createUlid(), title = newField('Task'), start = newField('Starts', 'date'), end = newField('Ends', 'date'), team = newField('Team')
  const dependency = { ...newField('Predecessors', 'relation'), relation: { ownerAppId: appId, entityId, cardinality: 'many', onDelete: 'restrict' } }
  const preview = await browserCall(page, '/api/v1/records/schema-preview', { appId, name: `Project schedule ${width}`, tables: [{ id: entityId, label: 'Tasks', primaryFieldId: title.id, fields: [title, start, end, team, dependency] }] })
  await browserCall(page, '/api/v1/commands/release.adopt', liveCommand({ kind: 'manual_schema', previewId: preview.id }))
  const base = `/api/v1/apps/${appId}/entities/${entityId}`, schema = await browserCall(page, base), rows = {}
  const tasks = [
    ['A', 0, 2, []], ['B', 2, 6, ['A']], ['C', 2, 4, ['A']], ['D', 6, 9, ['B']],
    ['E', 4, 6, ['C']], ['F', 9, 10, ['D', 'E']], ['G', 10, 12, ['F']], ['H', 12, 13, ['G']],
  ]
  for (const [key, from, to, prior] of tasks) {
    rows[key] = (await browserCall(page, '/api/v1/commands/record.create', liveCommand({ appId, entityId, values: {
      [title.id]: titles[key], [start.id]: date(from), [end.id]: date(to), [team.id]: ['A', 'C', 'E'].includes(key) ? 'Design' : 'Delivery',
      [dependency.id]: prior.map(key => rows[key].ref),
    } }, [{ ref: { appId, entityId: schemaEntity, recordId: entityId }, version: schema.version }]))).value
  }
  return { appId, entityId, title, start, end, team, dependency, rows, base, path: `${h.origin}/app/records/${appId}/${entityId}` }
}

/** VIEW-012: invoked by the existing date-views browser contract. */
export async function timelineBrowserJourney() {
  const output = path.resolve('.private/timeline'); await mkdir(output, { recursive: true })
  let h, browser
  try {
    h = await recordsBrowserRuntime(0)
    browser = await chromium.launch({ headless: true, args: ['--use-mock-keychain', '--password-store=basic'] })
    for (const width of recordsBrowserWidths()) {
      const context = await browser.newContext({ viewport: { width, height: width <= 390 ? 844 : 1000 } }), page = await context.newPage(), j = recordsJourney(page, h.origin, output, width)
      try {
        page.setDefaultTimeout(20000)
        await context.addCookies([{ name: h.cookie.split('=')[0], value: h.cookie.slice(h.cookie.indexOf('=') + 1), url: h.origin }])
        await page.goto(h.origin + '/app/records');await page.getByRole('button',{name:/^Base ▾/}).waitFor()
        const f = await fixture(page, h, width), call = (url, input, status) => browserCall(page, url, input, status)
        const patch = () => page.waitForResponse(response => response.url().endsWith('/commands/record.patch') && response.request().method() === 'POST')
        const getRow = async key => (await call(`${f.base}/records/${f.rows[key].id}`)).record
        const all = async () => (await call(f.base + '/query', { limit: 200 })).items
        const update = async (key, changes, status) => { const row = await getRow(key); return call('/api/v1/commands/record.patch', liveCommand({ appId: f.appId, entityId: f.entityId, rows: [{ recordId: row.id, changes }] }, [{ ref: row.ref, version: row.version }]), status) }
        const critical = async keys => {
          const expected = keys.map(key => f.rows[key].id).sort()
          await page.waitForFunction(expected => JSON.stringify([...document.querySelectorAll('[data-timeline-row][data-critical="true"]')].map(node => node.getAttribute('data-timeline-row')).sort()) === JSON.stringify(expected), expected)
        }
        await page.goto(f.path)
        await tableAction(page,'Save view')
        await page.getByLabel('Name', { exact: true }).fill('Delivery plan')
        await page.getByLabel('Display', { exact: true }).selectOption('timeline')
        await page.getByLabel('Date', { exact: true }).selectOption(f.start.id)
        await page.getByLabel('End date', { exact: true }).selectOption(f.end.id)
        await page.getByLabel('Predecessor links', { exact: true }).selectOption(f.dependency.id)
        await page.getByLabel('Group timeline by', { exact: true }).selectOption(f.team.id)
        await j.capture('timeline-view-editor')
        await j.command(page.locator('form').filter({ has: page.getByLabel('Name', { exact: true }) }).getByRole('button', { name: 'Save view', exact: true }), 'view.save')
        const getView = async () => (await call(`/api/v1/apps/${f.appId}/views`)).items.find(view => view.name === 'Delivery plan')
        const open = async () => { await displayAction(page,'Delivery plan'); await page.getByRole('status').filter({ hasText: '8 records in this timeline' }).waitFor() }
        await open(); let view = await getView()
        const query = () => call(`/api/v1/views/${view.id}/query`, { limit: 200 })
        await critical(['A', 'B', 'D', 'F', 'G', 'H'])
        assert.equal(await page.locator('[data-timeline-dependency]').count(), 8)
        assert.equal(await page.locator('.cr-timeline-group').count(), 2)
        assert.match(await page.getByRole('status').filter({ hasText: '8 records in this timeline' }).textContent(), /Critical path duration: 13 days/)
        await j.capture('timeline-gantt')
        await tableAction(page,'Find')
        const findInput=page.getByLabel('Find in visible fields',{exact:true})
        await findInput.fill('Design'); await findInput.press('Enter')
        await page.locator(`.cr-view-match[data-field-id="${f.team.id}"]`).waitFor()
        assert.match(await page.locator(`.cr-view-match[data-field-id="${f.team.id}"]`).innerText(), /Design/)
        await page.getByRole('button',{name:'Close find',exact:true}).click()
        const widths = []
        for (const zoom of ['Day', 'Week', 'Month', 'Quarter', 'Year']) {
          const button = page.getByRole('group', { name: 'Timeline zoom', exact: true }).getByRole('button', { name: zoom, exact: true })
          await button.click(); assert.equal(await button.getAttribute('aria-pressed'), 'true')
          widths.push(await page.locator(`[data-timeline-bar="${f.rows.B.id}"]`).evaluate(node => node.getBoundingClientRect().width))
          assert.equal(await page.locator('[data-timeline-bar]').count(), 8)
        }
        assert.ok(widths[0] > widths[1] && widths[1] > widths[2] && widths[2] > widths[3] && widths[3] >= widths[4])
        await j.capture('timeline-year')
        await page.getByRole('group', { name: 'Timeline zoom', exact: true }).getByRole('button', { name: 'Week', exact: true }).click()
        await j.command(page.getByRole('button', { name: 'Capture baseline', exact: true }), 'view.save')
        await page.locator(`[data-timeline-baseline="${f.rows.B.id}"]`).waitFor()
        view = await getView()
        assert.deepEqual(view.timelineBaseline.records, [], 'metadata listing must not carry historical row dates')
        const originalBaseline = (await query()).view.timelineBaseline
        assert.equal(originalBaseline.records.length, 8)
        await page.reload(); await open()
        assert.deepEqual((await query()).view.timelineBaseline, originalBaseline)
        await j.capture('timeline-baseline')
        // The shorter branch becomes longest when E's duration grows, even though its drawn placement conflicts.
        await update('E', { [f.end.id]: date(10) })
        await critical(['A', 'C', 'E', 'F', 'G', 'H'])
        assert.equal(await page.locator(`[data-timeline-row="${f.rows.F.id}"]`).getAttribute('data-conflict'), 'true')
        assert.equal(await page.locator(`[data-timeline-dependency="${f.rows.E.id}:${f.rows.F.id}"]`).getAttribute('data-conflict'), 'true')
        assert.match(await page.getByRole('status').filter({ hasText: '8 records in this timeline' }).textContent(), /Critical path duration: 14 days/)
        await j.capture('timeline-critical-recomputed')
        await update('E', { [f.end.id]: date(6) }); await critical(['A', 'B', 'D', 'F', 'G', 'H'])
        const before = await all()
        if (width === 1440) {
          const bar = page.locator(`[data-timeline-bar="${f.rows.B.id}"]`), track = page.locator(`[data-timeline-row="${f.rows.B.id}"] .cr-timeline-track`)
          const left = await bar.evaluate(node => parseFloat(node.style.left))
          const pending = patch(); await bar.dragTo(track, { sourcePosition: { x: 5, y: 14 }, targetPosition: { x: left + 24 + 5, y: 34 } }); assert.equal((await pending).status(), 200)
        } else {
          await page.getByRole('button', { name: `Move record ${f.rows.B.id}`, exact: true }).click()
          await page.getByLabel('New start date', { exact: true }).fill(date(3))
          await j.command(page.getByRole('button', { name: 'Move record', exact: true }), 'record.patch')
        }
        const after = await all(), moved = await getRow('B')
        assert.equal(moved.fields[f.start.id].value, date(3)); assert.equal(moved.fields[f.end.id].value, date(7))
        assert.deepEqual(after.filter(row => row.id !== moved.id), before.filter(row => row.id !== moved.id), 'a move must not change any other record')
        assert.deepEqual((await query()).view.timelineBaseline, originalBaseline)
        await page.waitForFunction(id => document.querySelector(`[data-timeline-row="${id}"]`)?.getAttribute('data-conflict') === 'true', f.rows.D.id)
        await j.capture('timeline-moved-baseline-comparison')
        const history = page.getByRole('group', { name: 'Record editing', exact: true })
        await tableCommand(page,'Undo',j)
        assert.equal((await getRow('B')).fields[f.start.id].value, date(2))
        await tableCommand(page,'Redo',j)
        assert.equal((await getRow('B')).fields[f.start.id].value, date(3))
        // Preserve a draft's original version while another operator changes the same dates.
        await page.getByRole('button', { name: `Move record ${f.rows.B.id}`, exact: true }).click()
        await j.capture('timeline-move-form')
        await update('B', { [f.start.id]: date(4), [f.end.id]: date(8) })
        await page.getByLabel('New start date', { exact: true }).fill(date(5))
        const refused = patch(); await page.getByRole('button', { name: 'Move record', exact: true }).click(); assert.equal((await refused).status(), 409)
        assert.equal((await getRow('B')).fields[f.start.id].value, date(4))
        await page.getByRole('button', { name: 'Cancel move', exact: true }).click()
        await j.capture('timeline-stale-refused')
        // Cycles are explicit and cannot produce a fabricated critical path.
        await update('A', { [f.dependency.id]: [f.rows.H.ref] })
        await page.getByRole('alert').filter({ hasText: 'Dependency cycle detected' }).waitFor()
        assert.equal(await page.locator('[data-timeline-row][data-critical="true"]').count(), 0)
        await j.capture('timeline-cycle')
        await update('A', { [f.dependency.id]: [] }); await critical(['A', 'B', 'D', 'F', 'G', 'H'])
        // Native export and import preview preserve and remap the persisted plan and dependencies.
        const exported = await call('/api/v1/records/base-export', { appId: f.appId, format: 'json' }), portable = JSON.parse(exported.content).base.views.find(item => item.id === view.id)
        assert.deepEqual(portable.timelineBaseline, originalBaseline); assert.equal(portable.layout.dependencyFieldId, f.dependency.id)
        const imported = await page.evaluate(async content => {
          const csrf = (await (await fetch('/auth/csrf')).json()).csrfToken, body = new FormData()
          body.append('files', new File([content], 'schedule.cradle.json', { type: 'application/json' })); body.append('options', JSON.stringify({ name: 'Schedule copy' }))
          const response = await fetch('/api/v1/records/base-import/preview', { method: 'POST', headers: { 'x-csrf-token': csrf }, body })
          return { status: response.status, body: await response.json() }
        }, exported.content)
        assert.equal(imported.status, 200, JSON.stringify(imported.body))
        const copied = imported.body.data.portableViews.find(item => item.name === 'Delivery plan')
        assert.notEqual(copied.layout.dependencyFieldId, f.dependency.id); assert.notEqual(copied.timelineBaseline.startFieldId, f.start.id)
        assert.ok(copied.timelineBaseline.records.every(row => !originalBaseline.records.some(before => before.recordId === row.recordId)))
        assert.deepEqual(copied.timelineBaseline.records.map(row => [row.start, row.end]), originalBaseline.records.map(row => [row.start, row.end]))
        const policy = await h.db.prepare('SELECT id,rules_json FROM authority_policies WHERE app_id=?').bind(f.appId).first(), rules = JSON.parse(policy.rules_json)
        for (const rule of rules) if (rule.entityId === f.entityId) { rule.writableFields = []; rule.actions = rule.actions.filter(action => action !== 'record.patch') }
        await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules), policy.id).run()
        const readonly = await getRow('B')
        await call('/api/v1/commands/record.patch', liveCommand({ appId: f.appId, entityId: f.entityId, rows: [{ recordId: readonly.id, changes: { [f.start.id]: date(5) } }] }, [{ ref: readonly.ref, version: readonly.version }]), 403)
        await page.reload(); await open()
        assert.equal(await page.locator('[data-timeline-bar][draggable="true"]').count(), 0)
        assert.equal(await page.getByRole('button', { name: 'Move date', exact: true }).count(), 0)
        assert.deepEqual((await query()).view.timelineBaseline, originalBaseline)
        await j.capture('timeline-readonly')
        for(const rule of rules)if(rule.entityId===f.entityId)rule.rows={kind:'condition',fieldId:f.title.id,op:'ne',value:titles.A}
        await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),policy.id).run()
        await page.reload();await displayAction(page,'Delivery plan');await page.getByRole('status').filter({hasText:'7 records in this timeline'}).waitFor()
        const restricted=await query();assert.equal(restricted.records.items.length,7);assert.equal(restricted.view.timelineBaseline.records.length,7);assert.equal(JSON.stringify(restricted).includes(f.rows.A.id),false)
        assert.equal(await page.locator(`[data-timeline-row="${f.rows.A.id}"]`).count(),0)
        assert.equal(await page.locator('[data-timeline-row][data-critical="true"]').count(),0)
        await page.getByRole('alert').filter({hasText:'Critical path requires complete row visibility'}).waitFor()
        await j.capture('timeline-restricted')
        const point={appId:f.appId,entityId:f.entityId,name:'Arrival milestones',display:'timeline',fields:[f.title.id,f.start.id],filter:{kind:'all',conditions:[]},sort:[],groupBy:[],layout:{titleFieldId:f.title.id,startFieldId:f.start.id},timelineZoom:'day',visibility:'private',shipped:false}
        const expected=[{ref:{appId:f.appId,entityId:schemaEntity,recordId:f.entityId},version:1}]
        await call('/api/v1/commands/view.save',liveCommand({view:{...point,timelineBaseline:originalBaseline}},expected),400)
        await call('/api/v1/commands/view.save',liveCommand({view:point},expected))
        await page.reload();await displayAction(page,'Arrival milestones');await page.getByRole('status').filter({hasText:'7 records in this timeline'}).waitFor()
        assert.equal(await page.locator('[data-timeline-bar]').count(),7)
        assert.equal(await page.locator('[data-timeline-bar]').evaluateAll(bars=>bars.every(bar=>bar.dataset.start===bar.dataset.end)),true)
        await j.capture('timeline-point-dates')
      } finally { await context.close() }
    }
  } finally { await browser?.close(); await h?.close() }
}
