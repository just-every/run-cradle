import assert from 'node:assert/strict'
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
 const time=new Date();time.setUTCHours(time.getUTCHours()+1,0,0,0)
 const tick=async at=>(await h.runtime.getWorker()).scheduled({scheduledTime:at,cron:'* * * * *'})
 await tick(time.getTime());let row=await h.db.prepare('SELECT * FROM record_sheet_schedules WHERE id=?').bind(schedule.id).first();assert.equal(row.state,'active',row.result_json);assert.deepEqual(JSON.parse(row.result_json),{creates:1,updates:1,unchanged:0})
 const registry=await h.descriptors(),descriptor=registry.get(identity.appId,identity.entityId),versions=async()=>JSON.stringify((await h.db.prepare(`SELECT id,version FROM "${descriptor.table.tableId}" ORDER BY id`).all()).results),before=await versions()
 await tick(time.getTime()+3600000);row=await h.db.prepare('SELECT * FROM record_sheet_schedules WHERE id=?').bind(schedule.id).first();assert.equal(row.state,'active',row.result_json);assert.deepEqual(JSON.parse(row.result_json),{creates:0,updates:0,unchanged:2});assert.equal(await versions(),before)
 const reads=provider.reads;await tick(time.getTime()+3601000);assert.equal(provider.reads,reads,'A second tick in the same hour does not read or write')
 // Current product policy can remove import authority even while native sign-in remains active.
 const policies=(await h.db.prepare('SELECT id,rules_json FROM authority_policies WHERE app_id=?').bind(identity.appId).all()).results
 for(const p of policies){const rules=JSON.parse(p.rules_json);for(const rule of rules)if(rule.actions)rule.actions=rule.actions.filter(action=>!action.startsWith('import.')&&!action.startsWith('connection.'));await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),p.id).run()}
 await tick(time.getTime()+7200000);assert.equal((await h.db.prepare('SELECT state FROM record_sheet_schedules WHERE id=?').bind(schedule.id).first()).state,'paused');assert.equal(await versions(),before)
 const exported=await d.call('/api/v1/records/base-export',{appId:preview.identities.appId,format:'json'});assert.ok(!JSON.stringify(exported).includes('synthetic-cradle-access-1'));assert.ok(!JSON.stringify(exported).includes('synthetic-cradle-refresh-1'))
}
