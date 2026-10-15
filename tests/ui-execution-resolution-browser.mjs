import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {chromium} from '@playwright/test'
import {emittedRuntime} from './helpers/emitted-runtime.mjs'
import {createFixtureMail} from './helpers/fixture-mail.mjs'
import {installLegacyFixture} from './helpers/install-legacy-fixture.mjs'
import {executionResolutionFixture} from './helpers/execution-resolution-fixture.mjs'
import {baseHttpSession} from './helpers/base-http-session.mjs'
import {freePort} from './helpers/free-port.mjs'
import {REPAIRS_APP_ID} from '../src/apps/repairs/model.ts'
import {createUlid} from '../src/core/shared/ids.ts'
const directory=await mkdtemp(path.join(tmpdir(),'cradle-human-resolution-')),output=process.env.CRADLE_RESOLUTION_EVIDENCE??path.resolve('test-results/execution-resolution'),port=await freePort(),origin=`http://127.0.0.1:${port}`
let runtime,browser,mail
const checks=[],pages=[],network=[]
try{
 mail=await createFixtureMail(port,async()=>{throw new Error('Human decisions must make no external request')})
 const migration=spawnSync(process.execPath,['scripts/migrate-local.mjs','--persist-to',directory],{encoding:'utf8',maxBuffer:32*1024*1024});assert.equal(migration.status,0,migration.stderr)
 const operator=await installLegacyFixture(directory)
 runtime=await emittedRuntime(directory,port,{AUTH_LOCAL:'true',OWNER_EMAIL:'maya@northstar.example',MAIL_FROM:'auth@localhost.test',SESSION_SECRET:'test-only-human-evidence-session-secret-32-bytes',APP_ORIGIN:origin,...mail.bindings},mail.fetch)
 await runtime.ready
 const db=await runtime.getD1Database('DB'),members=(await db.prepare('SELECT id,email FROM operators ORDER BY id').all()).results,viewer=members.find(m=>m.id!==operator)
 assert.ok(viewer)
 const fixture=await executionResolutionFixture(db,[operator,viewer.id],{appId:REPAIRS_APP_ID}),session=await baseHttpSession(origin,members.find(m=>m.id===operator).email),viewSession=await baseHttpSession(origin,viewer.email)
 // workerd closes an unread rejected POST body; do not reuse that socket for the next authority probe.
 const request=(route,body,who=session)=>fetch(origin+route,{method:body?'POST':'GET',headers:{origin,connection:'close','content-type':'application/json',...(who?{cookie:who.cookie,'x-csrf-token':who.csrfToken}:{})},...(body?{body:JSON.stringify(body)}:{})})
 const envelope=(a,outcome='done')=>({commandId:createUlid(),expected:[],input:{attemptId:a.attemptId,expectedVersion:a.version,outcome,evidence:{summary:'Written confirmation from the recipient, retained with this decision.',reference:'case/receipt-742'}}})
 const direct=await fixture.unknown(),command=envelope(direct)
 for(const [role,who,status] of [['signed-out',null,401],['viewer',viewSession,403]]){const response=await request('/api/v1/commands/attempt.resolve',command,who);assert.equal(response.status,status,await response.clone().text());checks.push({role,status:response.status})}
 for(const input of [{...command.input,evidence:{summary:'',reference:'empty'}},{...command.input,actorId:viewer.id},{...command.input,resolvedAt:'2000-01-01T00:00:00.000Z'},{...command.input,expectedVersion:2}]){const response=await request('/api/v1/commands/attempt.resolve',{...command,input});assert.ok([400,409].includes(response.status));checks.push({check:'invalid or stale request',status:response.status})}
 const first=await request('/api/v1/commands/attempt.resolve',command);assert.equal(first.status,200,await first.clone().text());const receipt=(await first.json()).data.value
 const replay=await request('/api/v1/commands/attempt.resolve',command);assert.equal(replay.status,200,await replay.clone().text());assert.deepEqual((await replay.json()).data.value,receipt)
 for(const input of [{...command.input,outcome:'not_done'},{...command.input,evidence:{...command.input.evidence,reference:'changed'}}])assert.equal((await request('/api/v1/commands/attempt.resolve',{...command,input})).status,409)
 const concurrent=await fixture.unknown(),competing=await Promise.all(['done','not_done'].map(outcome=>request('/api/v1/commands/attempt.resolve',envelope(concurrent,outcome))));assert.deepEqual(competing.map(r=>r.status).sort(),[200,409])
 assert.equal((await db.prepare("SELECT count(*) AS n FROM execution_receipts WHERE attempt_id=? AND method='human_evidence'").bind(direct.attemptId).first()).n,1)
 checks.push({check:'mounted commands, canonical replay and concurrent opposite decisions',passed:true})
 await mkdir(output,{recursive:true})
 browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})
 async function open(who,width,documentStatus=200){const context=await browser.newContext({viewport:{width,height:1000}});await context.addCookies([{name:who.cookie.split('=')[0],value:who.cookie.slice(who.cookie.indexOf('=')+1),url:origin}]);const page=await context.newPage();const errors=[];pages.push({page,width,errors});page.on('pageerror',e=>errors.push(e.message));page.on('response',response=>{const url=new URL(response.url());if(url.origin===origin&&(url.pathname.startsWith('/api/')||response.request().isNavigationRequest()))network.push({width,method:response.request().method(),path:url.pathname,status:response.status()})});const document=await page.goto(origin+'/app/settings');assert.equal(document.status(),documentStatus,'Settings document must enforce the existing viewer authority');if(documentStatus===200){await page.locator('summary').filter({hasText:/^Connections$/}).click();await page.getByText('Evidence review mail',{exact:true}).waitFor();await page.locator('summary').filter({hasText:/^Review external outcomes$/}).click()}return {context,page,errors}}
 async function capture(page,name){await page.evaluate(()=>window.scrollTo(0,0));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.screenshot({path:path.join(output,name),fullPage:true})}
 for(const width of [1440,390]){
  const a=await fixture.unknown(),{context,page,errors}=await open(session,width),card=page.locator('article.cr-card').filter({has:page.getByText(`Original action ${a.attemptId}`,{exact:true})}).last()
  await card.getByRole('button',{name:'Record outcome',exact:true}).waitFor();assert.equal(await card.getByRole('button',{name:'Record outcome',exact:true}).isDisabled(),true)
  await capture(page,`unknown-${width}.png`)
  const outcome=width===1440?'done':'not_done',summary=`Recipient reviewed the original effect and confirmed ${outcome}.`,reference=`support/receipt-${width}`
  const outcomeControl=card.getByRole('combobox',{name:/^Outcome\b/})
  await outcomeControl.selectOption(outcome);await card.getByLabel('Evidence',{exact:true}).fill(summary);await card.getByLabel('Evidence reference',{exact:true}).fill(reference)
  const evidenceBytes=`Provider receipt for original action ${a.attemptId}: delivery confirmed.`;
  const filename=`provider-confirmation-${width}.txt`
  await card.getByLabel('Attach evidence file (optional)',{exact:true}).setInputFiles({name:filename,mimeType:'text/plain',buffer:Buffer.from(evidenceBytes)})
  const prepared=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/v1/commands/upload.begin')
  await card.getByRole('button',{name:'Upload file',exact:true}).click();const uploadResponse=await prepared;assert.equal(uploadResponse.status(),200,await uploadResponse.text());await card.getByRole('button',{name:'File verified',exact:true}).waitFor()
  assert.equal(await outcomeControl.inputValue(),outcome);assert.equal(await card.locator('textarea').inputValue(),summary);assert.equal(await card.getByLabel('Evidence reference',{exact:true}).inputValue(),reference)
  assert.equal((await db.prepare('SELECT state FROM execution_attempts WHERE id=?').bind(a.attemptId).first()).state,'unknown','Uploading preserves the draft and does not submit the outcome')
  checks.push({check:'draft outcome, evidence and reference survive file upload without implicit submission',width,label:await outcomeControl.evaluate(element=>Array.from(element.labels,label=>label.textContent)),passed:true})
  const resolved=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/v1/commands/attempt.resolve');await card.getByRole('button',{name:'Record outcome',exact:true}).click();const response=await resolved;assert.equal(response.status(),200,await response.text())
  await page.reload();await page.locator('summary').filter({hasText:/^Connections$/}).click();await page.getByText('Evidence review mail',{exact:true}).waitFor();await page.locator('summary').filter({hasText:/^Review external outcomes$/}).click();await page.getByText(`Evidence reference: support/receipt-${width}`,{exact:true}).waitFor()
  const saved=await request(`/api/v1/runs/${a.runId}/attempts`);assert.equal(saved.status,200);const attempt=(await saved.json()).data.items[0],savedReceipt=await request(`/api/v1/receipts/${attempt.receiptId}`);assert.equal(savedReceipt.status,200);const data=(await savedReceipt.json()).data;assert.equal(data.humanResolution.actorId,operator);assert.equal(data.humanResolution.outcome,outcome);assert.equal(data.reconciliationMethod,'human_evidence');assert.ok(data.humanResolution.resolvedAt)
  assert.ok(data.evidenceFileId);assert.equal(data.humanResolution.evidence.fileId,data.evidenceFileId)
  const attachment=page.locator('section.cr-card').filter({has:page.getByRole('heading',{name:filename,exact:true})});await attachment.getByRole('link',{name:'Download file',exact:true}).waitFor()
  const downloadEvent=page.waitForEvent('download');await attachment.getByRole('link',{name:'Download file',exact:true}).click();const download=await downloadEvent,downloadPath=path.join(output,filename);await download.saveAs(downloadPath);assert.equal(await readFile(downloadPath,'utf8'),evidenceBytes)
  assert.equal((await request(`/api/v1/files/${data.evidenceFileId}`,undefined,viewSession)).status,404);assert.equal((await request(`/api/v1/files/${data.evidenceFileId}/content`,undefined,viewSession)).status,404);checks.push({check:'mounted source stage/upload, retained attachment and private UI download after reload',width,passed:true})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);await capture(page,`resolved-${width}.png`);checks.push({check:'UI resolution persists after reload without page errors or horizontal overflow',width,outcome,passed:true});await context.close()
 }
 const pending=await fixture.unknown(),viewerReview=await request(`/api/v1/attempts/${pending.attemptId}/review`,undefined,viewSession);assert.equal(viewerReview.status,200);assert.equal((await viewerReview.json()).data.canResolve,false)
 const {context,page,errors}=await open(viewSession,390,404);await page.getByRole('heading',{name:'Page not found',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Record outcome',exact:true}).count(),0);assert.equal(await page.getByLabel('Attach evidence file (optional)',{exact:true}).count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);await capture(page,'viewer-390.png');await context.close();checks.push({check:'viewer review cannot resolve; Settings denies its existing role with no resolution or upload control, page errors or horizontal overflow',status:404,passed:true})
 await writeFile(path.join(output,'route-proof.json'),JSON.stringify({checks,evidence:'Durable narrative/reference plus a file staged and uploaded through mounted production routes, attached via UI, and downloaded after reload; viewer denied private file.'},null,2));console.log('PASS emitted Worker human resolution routes and desktop/narrow UI')
}catch(error){
 await mkdir(output,{recursive:true})
 const screens=[]
 for(const {page,width,errors} of pages){if(page.isClosed())continue;await page.screenshot({path:path.join(output,`failure-${width}.png`),fullPage:true});screens.push({width,errors,alerts:await page.getByRole('alert').allTextContents(),commands:await page.getByRole('status').allTextContents()})}
 await writeFile(path.join(output,'failure.json'),JSON.stringify({error:String(error),screens,network},null,2));throw error
}finally{
 await writeFile(path.join(output,'network-status.json'),JSON.stringify(network,null,2)).catch(()=>{})
 try{await browser?.close()}finally{try{await runtime?.dispose()}finally{await mail?.close();await rm(directory,{recursive:true,force:true})}}
}
