import {emittedMailRuntime} from './helpers/emitted-mail-runtime.mjs'
import {baseHttpSession} from './helpers/base-http-session.mjs'
import {testDevKey} from './helpers/dev-gate.mjs'
import { contract } from './contract.mjs'
import { versionedSessionProof } from './helpers/versioned-session-proof.mjs'
import { navigateFromSignInToApp, openSignInFromDocs } from './helpers/public-app-navigation.mjs'
import http from 'node:http'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from '@playwright/test'
import { installLegacyFixture } from './helpers/install-legacy-fixture.mjs'

let port = Number(process.env.CRADLE_TEST_PORT ?? 0)
let origin = `http://127.0.0.1:${port}`
const mode = process.env.CRADLE_RUNTIME_MODE ?? 'dev'
assert.ok(['dev', 'preview', 'wrangler'].includes(mode))
const evidence = process.env.CRADLE_MIGRATION_EVIDENCE
assert.ok(evidence, 'Evidence directory is required')
await mkdir(evidence, { recursive: true })
contract('BASE-ACCESS-002 AUTH-BASE-001 HOME-002', `${mode} browser transport, Origin and document boundaries`, async()=>{
const directory = await mkdtemp(path.join(tmpdir(), 'cradle-migration-browser-'))
let variables = `APP_ORIGIN=${origin}\nAUTH_LOCAL=true\nRER_DEV_KEY=${testDevKey}\nOWNER_EMAIL=maya@northstar.example\nMAIL_PROVIDER=development\nMAIL_FROM=auth@localhost.test\nSESSION_SECRET=test-only-session-secret-32-characters-long\n`
let worker, browser, output = '', oldVariables, oldEmittedVariables, variablesChanged=false, emittedVariablesChanged=false
try {
  assert.equal(await fetch(origin).catch(() => null), null, 'Refuse occupied port')
  const migration = spawnSync(process.execPath, ['scripts/migrate-local.mjs', '--persist-to', directory], { encoding:'utf8', maxBuffer:16*1024*1024 })
  assert.equal(migration.status, 0, migration.stderr || migration.stdout)
  const member = await installLegacyFixture(directory)
  // Credential acquisition uses the real emitted app with only SendGrid's
  // paid transport replaced. Dispose it before the selected CLI owns the DB.
  let credentialRuntime,mail,cookie,csrfToken
  try{
    const bindings=Object.fromEntries(variables.trim().split('\n').map(line=>{const separator=line.indexOf('=');return [line.slice(0,separator),line.slice(separator+1)]}))
    ;({runtime:credentialRuntime,mail,port,origin}=await emittedMailRuntime(directory,port,bindings))
    variables=variables.replace(/^APP_ORIGIN=.*$/m,`APP_ORIGIN=${origin}`)
    await credentialRuntime.ready
    ;({cookie,csrfToken}=await baseHttpSession(origin))
  }finally{try{await credentialRuntime?.dispose()}finally{await mail?.close()}}
  oldVariables = await readFile('.dev.vars').catch(() => null)
  await writeFile('.dev.vars', variables);variablesChanged=true
  if(mode!=='dev'){oldEmittedVariables=await readFile('dist/server/.dev.vars').catch(()=>null);await writeFile('dist/server/.dev.vars',variables);emittedVariablesChanged=true}
  const args = mode === 'wrangler'
    ? ['exec','wrangler','dev','--config','dist/server/wrangler.json','--local','--port',String(port),'--inspector-port','0','--persist-to',directory]
    : ['exec','vite',...(mode === 'preview' ? ['preview'] : []),'--host','127.0.0.1','--port',String(port),'--strictPort']
  // Let the hostile Host probe reach the Worker through Vite preview's outer
  // host guard. This test-process exception never changes production host policy.
  const previewProbeEnv = mode === 'preview' ? { __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: 'unsupported.invalid' } : {}
  worker = spawn('pnpm', args, { detached:true, stdio:['ignore','pipe','pipe'], env:{...process.env,...previewProbeEnv,CRADLE_PERSIST_PATH:directory} })
  worker.stdout.on('data', data => { output += data }); worker.stderr.on('data', data => { output += data })
  let ready = false
  for(let i=0;i<200;i++) { if((await fetch(origin+'/health').catch(()=>null))?.status===200){ready=true;break} await new Promise(resolve=>setTimeout(resolve,100)) }
  assert.ok(ready, output)
  const api=async url=>(await fetch(origin+url,{headers:{cookie}})).json()
  const campaigns=await api('/api/campaigns'), risk=await api('/api/risks/lens'), timeline=await api('/api/milestones/timeline')
  for(const collection of [risk,timeline]) { assert.equal(typeof collection.total,'number'); assert.equal(typeof collection.totalLabel,'string'); assert.ok('nextCursor' in collection) }
  await writeFile(path.join(evidence,`${mode}-automations.html`),await (await fetch(origin+'/app/automations',{headers:{cookie}})).text())
  const target=campaigns.items[0], before=await api('/api/campaigns/'+target.id)
  const hostile=await fetch(origin+'/api/campaigns/'+target.id,{method:'PATCH',headers:{cookie,origin:'https://hostile.invalid','content-type':'application/json','x-csrf-token':csrfToken},body:JSON.stringify({version:target.version,name:'Unauthorized mutation'})})
  assert.equal(hostile.status,403);await hostile.arrayBuffer();assert.deepEqual(await api('/api/campaigns/'+target.id),before)
  if(mode!=='dev') {
    const checks=[]
    for(const route of ['/missing','/app/missing','/api/missing','/assets/missing.js','/@vite/client','/@id/virtual:tanstack-start-dev-client-entry','/@tanstack-start/styles.css','/src/core/app/styles.css'])for(const navigation of [false,true]){
      const response=await fetch(origin+route,{redirect:'manual',headers:{cookie,...(navigation?{'sec-fetch-mode':'navigate'}:{})}})
      await response.arrayBuffer();assert.equal(response.status,404,route);checks.push({route,navigation,status:response.status})
    }
    const wrongHost=await new Promise((resolve,reject)=>http.get(origin+'/app',{headers:{cookie,host:'unsupported.invalid','sec-fetch-mode':'navigate'}},response=>{response.resume();resolve(response.statusCode)}).on('error',reject))
    assert.equal(wrongHost,404)
    await writeFile(path.join(evidence,`${mode}-404.json`),JSON.stringify({checks,wrongHost},null,2))
  }
  browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH})
  const results=[]
  for(const width of [1440,390]) {
    const context=await browser.newContext({viewport:{width,height:960}})
    await context.addCookies([{name: cookie.split('=')[0], value: cookie.slice(cookie.indexOf('=')+1),url:origin}])
    const page=await context.newPage(), errors=[], failed=[], responses=[], paths=new Set();let navigations=0
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text())})
    page.on('pageerror',error=>errors.push(error.message))
    page.on('requestfailed',request=>failed.push({url:request.url(),error:request.failure()}))
    page.on('response',response=>{if(response.status()>=400)responses.push({url:response.url(),status:response.status()})})
    page.on('request',request=>{paths.add(new URL(request.url()).pathname);if(request.isNavigationRequest()&&request.frame()===page.mainFrame())navigations++})
    await page.goto(origin+'/docs');await page.getByRole('banner').getByRole('link',{name:'Open workspace',exact:true}).waitFor();await page.waitForLoadState('networkidle')
    const time=await page.evaluate(()=>performance.timeOrigin)
    await openSignInFromDocs(page);await page.waitForURL('**/app');await page.waitForLoadState('networkidle')
    await navigateFromSignInToApp(page, { mailConfigured: false });await page.waitForURL('**/app');await page.getByRole('region',{name:'Your bases',exact:true}).waitFor();await page.waitForLoadState('networkidle')
    assert.equal(await page.evaluate(()=>performance.timeOrigin),time);assert.equal(navigations,1)
    for(const route of ['/app', '/app/overview','/app/campaigns',`/app/campaigns/${target.id}`,'/app/lenses/risks','/app/lenses/timeline','/app/settings','/app/notifications','/app/automations']) {
      await page.goto(origin+route);await page.waitForLoadState('networkidle')
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,route)
    }
    if(mode==='wrangler'&&width===1440)await versionedSessionProof({page,origin,cookie,directory,member,campaignId:target.id,evidence})
    await page.screenshot({path:path.join(evidence,`${mode}-${width}.png`),fullPage:true})
    results.push({width,errors,failed,responses,paths:[...paths],stableTimeOrigin:true})
    await writeFile(path.join(evidence,`${mode}-browser.json`),JSON.stringify(results,null,2))
    assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.deepEqual(responses,[])
    await context.close()
  }
  console.log(JSON.stringify({mode,passed:true,results}))
} finally {
  if(browser)await browser.close()
  if(worker&&worker.exitCode===null){const closed=new Promise(resolve=>worker.once('exit',resolve));process.kill(-worker.pid,'SIGTERM');await closed}
  if(emittedVariablesChanged){if(oldEmittedVariables)await writeFile('dist/server/.dev.vars',oldEmittedVariables);else await rm('dist/server/.dev.vars',{force:true})}
  if(variablesChanged){if(oldVariables)await writeFile('.dev.vars',oldVariables);else await rm('.dev.vars',{force:true})}
  await writeFile(path.join(evidence,`${mode}-worker.log`),output)
  await rm(directory,{recursive:true,force:true})
}

})
