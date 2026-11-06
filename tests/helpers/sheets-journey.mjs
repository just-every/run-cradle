import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {baseHttpSession} from './base-http-session.mjs'
import {workbookDoors} from './workbook-http.mjs'
export async function connectSheets(d,provider,identity){
 const configured=(await d.command('connection.configure',{appId:identity.appId,adapterId:'google-sheets',name:'Synthetic Cradle Google Sheets',accountId:provider.id,scopes:[{resource:provider.id,readFields:[],actions:['connection.sync']}],ownership:[],credentialRef:null})).value,connectionId=configured.connectionId
 const consent=(await d.command('connection.begin-consent',{connectionId,returnTo:'/app/records'})).value,url=new URL(consent.authorizationUrl);assert.deepEqual(url.searchParams.get('scope').split(' '),['https://www.googleapis.com/auth/spreadsheets.readonly'])
 const callback=await d.raw('/oauth/google/callback?'+new URLSearchParams({code:'synthetic-cradle-code-1',state:url.searchParams.get('state')}));assert.equal(callback.status,303,await callback.clone().text())
 return connectionId
}
export async function sheetsJourney(h,d,provider,identity,fields,mapping){
 const connectionId=await connectSheets(d,provider,identity)
 const capture=await d.call('/api/v1/records/sheets-source',{connectionId});assert.equal(capture.sheets.length,2);assert.equal(capture.sheets[0].rows[0][1].type,'number');assert.equal(capture.sheets[0].rows[0][3].value,true)
 const preview=await d.call('/api/v1/records/base-import/preview',d.form(Buffer.from(capture.content),capture.filename));assert.equal(preview.schemaDraft.tables.length,2);await d.adopt(Buffer.from(capture.content),capture.filename,preview)
 const schedule=await d.call('/api/v1/records/sheets-schedule',{...identity,connectionId,sheet:'Orders',mapping,mergeFieldId:fields.Order.id,enabled:true});assert.equal(schedule.state,'active')
 const time=Date.UTC(2026,9,24,12)
 const tick=async at=>{const result=await(await h.runtime.getWorker()).scheduled({scheduledTime:at,cron:'* * * * *'});assert.equal(result.outcome,'ok',JSON.stringify(result))}
 const route='/api/v1/records/sheets-schedule?id='+schedule.id,outcome=()=>d.call(route)
 const read=async()=>{const {evaluatedAt:_,...data}=await d.call(`/api/v1/apps/${identity.appId}/entities/${identity.entityId}/query`,{fields:mapping.map(item=>item.fieldId),sort:[{fieldId:fields.Order.id,direction:'asc'}]});return data}
 await tick(time);let result=await outcome();assert.equal(result.state,'active');assert.equal(result.outcome.status,'committed');assert.deepEqual(result.outcome.prospective,{creates:1,updates:1,unchanged:0,rejected:0});assert.deepEqual(result.outcome.applied,{creates:1,updates:1});assert.deepEqual(result.outcome.refusals,[])
 assert.deepEqual((await read()).items.map(row=>[row.fields[fields.Order.id].value,row.fields[fields.Amount.id].value]),[['synthetic-cradle-1','31'],['synthetic-cradle-2','20'],['synthetic-cradle-3','40'],['synthetic-cradle-4','45']])
 const registry=await h.descriptors(),descriptor=registry.get(identity.appId,identity.entityId),versions=async()=>JSON.stringify((await h.db.prepare(`SELECT id,version FROM "${descriptor.table.tableId}" ORDER BY id`).all()).results),before=await versions()
 await tick(time+3600000);result=await outcome();assert.equal(result.state,'active');assert.equal(result.outcome.status,'unchanged');assert.deepEqual(result.outcome.prospective,{creates:0,updates:0,unchanged:2,rejected:0});assert.deepEqual(result.outcome.applied,{creates:0,updates:0});assert.equal(await versions(),before)
 const reads=provider.reads;await tick(time+3601000);assert.equal(provider.reads,reads,'A second tick in the same hour does not read or write')
 // Every category is independently known: one proposed update, create, unchanged row and typed refusal.
 const mixed=[['synthetic-cradle-1',32,'2026-10-22',true,'North'],['synthetic-cradle-3',40,'2026-10-24',false,'North'],['synthetic-cradle-5',50,'2026-10-25',false,'North'],['synthetic-cradle-6','not-a-number','2026-10-26',false,'North']]
 provider.orders(mixed)
 const snapshot=async()=>({records:(await h.db.prepare(`SELECT * FROM "${descriptor.table.tableId}" ORDER BY id`).all()).results,imports:(await h.db.prepare("SELECT * FROM command_admissions WHERE app_id=? AND action='import.commit' AND command_id IN (SELECT command_id FROM record_csv_previews WHERE command_id IS NOT NULL) ORDER BY command_id").bind(identity.appId).all()).results,audit:(await h.db.prepare("SELECT * FROM admission_audit WHERE app_id=? AND action LIKE 'record.%' ORDER BY id").bind(identity.appId).all()).results,events:(await h.db.prepare('SELECT id,command_id,record_id,event,record_version FROM record_automation_events WHERE app_id=? ORDER BY id').bind(identity.appId).all()).results})
 const untouched=await snapshot(),publicBefore=await read()
 await tick(time+7200000);const held=await outcome()
 assert.equal(held.state,'paused');assert.equal(held.outcome.status,'review_required');assert.deepEqual(held.outcome.prospective,{creates:1,updates:1,unchanged:1,rejected:1});assert.deepEqual(held.outcome.applied,{creates:0,updates:0})
 assert.equal(held.outcome.refusals.length,1);assert.equal(held.outcome.refusals[0].row,5);assert.equal(held.outcome.refusals[0].label,'synthetic-cradle-6');assert.match(held.outcome.refusals[0].message,/number|numeric/i)
 const retained=JSON.parse((await h.db.prepare('SELECT detail_json FROM record_csv_previews WHERE id=?').bind(held.outcome.previewId).first()).detail_json)
 assert.equal(retained.id,held.outcome.previewId);assert.deepEqual(retained.errors,held.outcome.refusals);assert.equal(retained.rows.find(row=>row.operation==='update').before[fields.Amount.id],'31');assert.equal(retained.rows.find(row=>row.operation==='update').values[fields.Amount.id],'32')
 assert.deepEqual(await snapshot(),untouched,'A refused row holds every valid change without record, version, audit or captured-event effects');assert.deepEqual(await read(),publicBefore)
 const pausedReads=provider.reads
 await tick(time+7201000);await h.restart();await tick(time+10800000)
 assert.equal(provider.reads,pausedReads,'A held run stays paused across duplicate ticks and Worker restart');assert.deepEqual(await outcome(),held);assert.deepEqual(await snapshot(),untouched);assert.deepEqual(await read(),publicBefore)
 const configure={...identity,connectionId,sheet:'Orders',mapping,mergeFieldId:fields.Order.id,enabled:true}
 const refusal=await d.call('/api/v1/records/sheets-schedule',configure,400);assert.match(refusal.error.message,/fresh.*refused/i);assert.ok(provider.reads>pausedReads,'Re-enabling reads the source again');assert.deepEqual(await outcome(),held);assert.deepEqual(await snapshot(),untouched)
 // Outcome reads are private and recheck destination authority, even for the current installation owner.
 const anonymous=await fetch(h.origin+route);assert.equal(anonymous.status,401)
 const currentPolicies=(await h.db.prepare('SELECT id,rules_json FROM authority_policies WHERE app_id=?').bind(identity.appId).all()).results
 async function changePolicies(change){for(const policy of currentPolicies){const rules=JSON.parse(policy.rules_json);change(rules);await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),policy.id).run()}}
 await changePolicies(rules=>{for(const rule of rules)rule.actions=rule.actions.filter(action=>action!=='import.preview')})
 const denied=await d.call(route,undefined,403);assert.ok(!JSON.stringify(denied).includes(held.outcome.previewId));await d.call('/api/v1/records/sheets-schedule',configure,403);assert.deepEqual(await snapshot(),untouched)
 await changePolicies(()=>{})
 await changePolicies(rules=>{for(const rule of rules)rule.readableFields=rule.readableFields.filter(id=>id!==fields.Amount.id)})
 await d.call(route,undefined,403);await changePolicies(()=>{})
 const operator=await h.db.prepare('SELECT o.id FROM oa_operators o JOIN cradle_base_operators m ON m.base_id=o.id JOIN record_sheet_schedules s ON s.owner_id=m.principal_id WHERE s.id=?').bind(schedule.id).first()
 const member=createUlid()
 await h.db.prepare("INSERT INTO oa_operators(id,email,display_name,role,status,created_at) SELECT ?,'synthetic-cradle-7.'||email,'synthetic-cradle-7','member','active',created_at FROM oa_operators WHERE id=?").bind(member,operator.id).run()
 const {email}=await h.db.prepare('SELECT email FROM oa_operators WHERE id=?').bind(member).first(),{cookie}=await baseHttpSession(h.origin,email),memberDoors=await workbookDoors({origin:h.origin,cookie})
 await memberDoors.call(route,undefined,403)
 // Repairing the source alone does not resume it; an owner must obtain a new current preview.
 provider.orders(mixed.slice(0,3));const repairedReads=provider.reads
 await tick(time+14400000);assert.equal(provider.reads,repairedReads);assert.deepEqual(await outcome(),held);assert.deepEqual(await snapshot(),untouched)
 assert.equal((await d.call('/api/v1/records/sheets-schedule',configure)).state,'active');assert.ok(provider.reads>repairedReads);assert.deepEqual(await snapshot(),untouched,'Enabling previews but applies no writes')
 await tick(time+18000000);result=await outcome();assert.equal(result.outcome.status,'committed');assert.notEqual(result.outcome.previewId,held.outcome.previewId);assert.deepEqual(result.outcome.prospective,{creates:1,updates:1,unchanged:1,rejected:0});assert.deepEqual(result.outcome.applied,{creates:1,updates:1})
 assert.deepEqual((await read()).items.map(row=>[row.fields[fields.Order.id].value,row.fields[fields.Amount.id].value]),[['synthetic-cradle-1','32'],['synthetic-cradle-2','20'],['synthetic-cradle-3','40'],['synthetic-cradle-4','45'],['synthetic-cradle-5','50']])
 const recovered=await snapshot();await tick(time+18001000);assert.deepEqual(await snapshot(),recovered)
 // Current product policy can remove import authority even while native sign-in remains active.
 const policies=(await h.db.prepare('SELECT id,rules_json FROM authority_policies WHERE app_id=?').bind(identity.appId).all()).results
 for(const p of policies){const rules=JSON.parse(p.rules_json);for(const rule of rules)if(rule.actions)rule.actions=rule.actions.filter(action=>!action.startsWith('import.')&&!action.startsWith('connection.'));await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),p.id).run()}
 const authorizedVersions=await versions();await tick(time+21600000);assert.equal((await h.db.prepare('SELECT state FROM record_sheet_schedules WHERE id=?').bind(schedule.id).first()).state,'paused');assert.equal(await versions(),authorizedVersions);assert.deepEqual(await snapshot(),recovered)
 const exported=await d.call('/api/v1/records/base-export',{appId:preview.identities.appId,format:'json'});assert.ok(!JSON.stringify(exported).includes('synthetic-cradle-access-1'));assert.ok(!JSON.stringify(exported).includes('synthetic-cradle-refresh-1'))
}
