import assert from 'node:assert/strict'
import {mkdir,rm,rename,mkdtemp,readFile,writeFile,copyFile} from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import {randomBytes} from 'node:crypto'
import {chromium} from '@playwright/test'
import {contract} from './contract.mjs'
import {freshLocalCopy} from './helpers/local-signin-copy.mjs'
import {localInstallerJourney} from './helpers/local-installer-journey.mjs'
import {browserObservations} from './helpers/browser-observations.mjs'
import {availableMachine} from './helpers/available-machine.mjs'
import {outboxSession} from './helpers/rer-development.mjs'
import {bindings} from './helpers/rer-data-fixture.mjs'
import {signInAs} from '../vendor/base/modules/operator-auth/dev/sign-in-as.mjs'
import {rebind} from './helpers/rer-archive-integrity.mjs'
import {sha256,canonicalJson} from '@runeditrun/rer/modules/portability'

// A tunnel or reverse proxy rewrites the Host header to the local origin, so the origin
// looks local. Only the key can tell this request from the person at the terminal.
function forwardingProxy(origin){
 const target=new URL(origin)
 const server=http.createServer((request,response)=>{
  const upstream=http.request({host:target.hostname,port:target.port,path:request.url,method:request.method,headers:{...request.headers,host:target.host}},reply=>{response.writeHead(reply.statusCode,reply.headers);reply.pipe(response)})
  upstream.on('error',()=>response.destroy());request.pipe(upstream)
 })
 return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve({origin:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(done=>server.close(done))})))
}
const id=()=>randomBytes(16).toString('hex').slice(0,26).toUpperCase()
const status=async pending=>{const response=await pending;await response.body?.cancel();return response.status}

async function journey(viewport,evidence){
 const copy=await freshLocalCopy();let installation,browser,proxy,target,failed=false,phase='setup'
 try{
  await availableMachine()
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})})
  installation=await localInstallerJourney(copy,browser,{identity:true})
  const {origin,key,openUrl}=installation
  assert.ok(openUrl?.startsWith(origin+'/')&&new URL(openUrl).hash.startsWith('#rer-dev='),'dev prints the one-time key exchange link')
  await mkdir(evidence,{recursive:true})
  const context=await browser.newContext({viewport});context.setDefaultTimeout(30000)
  const page=await context.newPage();let observations
  const shot=name=>page.screenshot({path:path.join(evidence,`${name}-${viewport.width}.png`),fullPage:true})
  const badge=page.locator('#rer-dev-badge summary')
  const switchTo=async label=>{await badge.click();await page.getByRole('link',{name:label,exact:true}).click();await page.waitForLoadState('networkidle')}

  phase='opens signed in'
  await page.goto(openUrl)
  await page.waitForURL(origin+'/setup')
  // The key exchange's own POST is cut off by the navigation it triggers; watch everything after it.
  await page.waitForLoadState('networkidle');observations=browserObservations(page,origin)
  assert.equal(page.url().includes('rer-dev'),false,'The key leaves the address bar')
  await badge.waitFor();assert.match(await badge.innerText(),/Dev: local-owner@example\.test \(owner\)/)
  await page.getByLabel('Workspace name',{exact:true}).waitFor();await shot('dev-open-setup')
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No horizontal scroll at '+viewport.width)
  await page.getByRole('button',{name:'Open my workspace',exact:true}).click();await page.waitForURL(origin+'/app')
  await page.getByRole('link',{name:'Open records',exact:true}).waitFor();await shot('dev-owner-app')
  observations.assertClean(undefined,'owner')

  phase='persona switch and signed out'
  const personas=await (await fetch(origin+'/__dev/personas',{headers:{'x-rer-dev-key':key}})).json()
  assert.deepEqual(personas.map(persona=>persona.as),['owner','admin','member','signed-out'])
  await switchTo('Switch to admin');await page.waitForURL(origin+'/app')
  assert.match(await badge.innerText(),/Dev: admin@dev\.localhost \(admin\)/);await shot('dev-admin-app')
  await switchTo('Switch to member');assert.match(await badge.innerText(),/Dev: member@dev\.localhost \(member\)/);await shot('dev-member-app')
  await switchTo('Sign out');await page.waitForURL(origin+'/')
  assert.match(await badge.innerText(),/Dev: signed out/);await shot('dev-signed-out')
  assert.equal(new URL((await context.request.get(origin+'/app',{maxRedirects:0})).headers().location,origin).pathname,'/signin','Signed out reaches the sign-in page')
  await switchTo('Switch to owner');await page.waitForURL(origin+'/app');assert.match(await badge.innerText(),/Dev: local-owner@example\.test \(owner\)/)
  observations.assertClean(undefined,'personas')

  phase='forwarded requests'
  proxy=await forwardingProxy(origin)
  for(const route of ['/auth/dev/enter?as=owner','/__dev/personas','/__dev/outbox'])assert.equal(await status(fetch(proxy.origin+route,{redirect:'manual'})),404,`${route} answers 404 through a forwarding proxy without the key`)
  assert.equal(await status(fetch(proxy.origin+'/__dev/key',{method:'POST',headers:{'content-type':'application/json',origin:proxy.origin},body:JSON.stringify({key:'wrong-'.repeat(8)})})),404,'A wrong key buys no cookie')
  const owner=await signInAs({origin,key,as:'owner'}),sessionOnly=owner.cookies.find(cookie=>cookie.name==='operator_session_local')
  const hold=await fetch(proxy.origin+'/app',{redirect:'manual',headers:{cookie:`${sessionOnly.name}=${sessionOnly.value}`}})
  assert.equal(hold.status,303);assert.equal(new URL(hold.headers.get('location'),origin).pathname,'/signin','A dev session without the key counts for nothing');await hold.body?.cancel()

  phase='credential gate'
  const csrf=(await (await fetch(origin+'/auth/csrf',{headers:{cookie:owner.header}})).json()).csrfToken
  const send=(route,body)=>fetch(origin+route,{method:body?'POST':'GET',headers:{cookie:owner.header,origin,...(body?{'content-type':'application/json','x-csrf-token':csrf}:{})},...(body?{body:JSON.stringify(body)}:{})})
  const appId=(await (await send('/api/v1/apps')).json()).data.items[0].id
  const entityId=(await (await send(`/api/v1/apps/${appId}/entities`)).json()).data.items[0].id,route=`/api/v1/apps/${appId}/entities`
  const issue=async(name,cookie,token)=>{
   const response=await fetch(origin+'/api/user-keys',{method:'POST',headers:{cookie,origin,'content-type':'application/json','x-csrf-token':token},body:JSON.stringify({commandId:id(),appId,entityId,name,permissions:'read',expiresAt:new Date(Date.now()+86400000).toISOString()})})
   assert.equal(response.status,201,'A user key is issued');return (await response.json()).data.key
  }
  const devKey=await issue('Minted in a dev session',owner.header,csrf)
  const bearer=secret=>({authorization:`Bearer ${secret}`})
  assert.equal(await status(fetch(origin+route,{headers:{...bearer(devKey.secret),'x-rer-dev-key':key}})),200,'A dev-minted key works on a request carrying the key')
  assert.equal(await status(fetch(origin+route,{headers:bearer(devKey.secret)})),401,'A dev-minted key is refused without the key')
  assert.equal(await status(fetch(proxy.origin+route,{headers:bearer(devKey.secret)})),401,'A dev-minted key is refused through a forwarding proxy')
  // An ordinary session (a real email link) mints an ordinary key: unchanged, no key needed.
  const asked=await fetch(origin+'/auth/magic-link',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email:'local-owner@example.test',returnTo:'/app'})});assert.equal(asked.status,202);await asked.body?.cancel()
  const ordinary=await outboxSession(origin,key),ordinaryCsrf=(await (await fetch(origin+'/auth/csrf',{headers:{cookie:ordinary.cookie}})).json()).csrfToken
  const plainKey=await issue('Minted in an ordinary session',ordinary.cookie,ordinaryCsrf)
  assert.equal(await status(fetch(origin+route,{headers:bearer(plainKey.secret)})),200,'An ordinary-session key keeps working without the key')
  assert.equal(await status(fetch(proxy.origin+route,{headers:bearer(plainKey.secret)})),200,'And through a forwarding proxy')
  const recorded=await bindings(copy.source,async({DB})=>(await DB.prepare("SELECT id FROM oa_dev_credentials WHERE credential='authority_credentials'").all()).results.map(row=>row.id))
  assert.deepEqual(recorded,[devKey.id],'Only the key minted in the dev session is recorded as dev-minted')
  await context.close()
  await installation.close();installation=undefined

  phase='export drops dev credentials'
  await copy.rer(['export','--output','exports/dev.rer','--non-interactive'])
  const text=await readFile(path.join(copy.source,'exports/dev.rer'),'utf8')
  const records=text.trim().split('\n').map(line=>JSON.parse(line)),manifest=records[0]
  const rows=records.filter(record=>record.kind==='part').flatMap(part=>part.items).filter(item=>item.kind==='row')
  for(const table of ['authority_credentials','oa_dev_credentials','oa_sessions'])assert.ok(manifest.excludedTables.includes(table),table+' never travels')
  assert.equal(manifest.tables.some(table=>/^oa_/.test(table.name)||table.name==='authority_credentials'),false,'No credential or session table is archived')
  for(const secret of [devKey.secret,plainKey.secret])assert.equal(text.includes(secret),false,'No key secret is archived')
  assert.deepEqual(rows.filter(row=>row.table==='operators'&&row.row.email.endsWith('@dev.localhost')).map(row=>row.row.active),[0,0],'The personas are archived suspended')
  if(viewport.width===1440){
   phase='import refuses dev data'
   const records=text.trim().split('\n').map(line=>JSON.parse(line)),hostile=structuredClone(records),tables=hostile[0].tables
   // An archive that carries Base's dev-credential record: the table inventory no longer matches this install.
   tables.push({...tables.find(table=>table.name==='workspace'),name:'oa_dev_credentials',count:0})
   hostile[0].schema=await sha256(canonicalJson(tables.map(({name,sql})=>({name,sql}))))
   rebind(hostile)
   target=await freshLocalCopy()
   await target.rer(['install','--non-interactive']);await target.command(['run','db:migrate:local'])
   await writeFile(path.join(target.source,'dev-data.rer'),hostile.map(record=>JSON.stringify(record)).join('\n')+'\n',{mode:0o600});await copyFile(path.join(copy.source,'exports/dev.rer'),path.join(target.source,'dev.rer'))
   await assert.rejects(target.rer(['import','--input','dev-data.rer','--yes','--non-interactive']),'An archive carrying a dev-credential table is refused')
   assert.equal(await bindings(target.source,async({DB})=>(await DB.prepare('SELECT COUNT(*) AS n FROM campaigns').first()).n),0,'The refused archive changed nothing')
   await target.rer(['import','--input','dev.rer','--yes','--non-interactive'])
   const restored=await bindings(target.source,async({DB})=>({credentials:(await DB.prepare('SELECT COUNT(*) AS n FROM authority_credentials').first()).n,recorded:(await DB.prepare('SELECT COUNT(*) AS n FROM oa_dev_credentials').first()).n,dev:(await DB.prepare("SELECT COUNT(*) AS n FROM oa_sessions WHERE kind='dev'").first()).n,sessions:(await DB.prepare('SELECT COUNT(*) AS n FROM oa_sessions').first()).n}))
   assert.deepEqual(restored,{credentials:0,recorded:0,dev:0,sessions:0},'The restored install holds no key, dev record or session')
  }
 }catch(error){
  failed=true
  throw new Error((phase+': '+String(error.message)).replace(/(rer-dev=|token=)[^\s"'<>&]+/g,'$1[redacted]'))
 }finally{
  await proxy?.close();await browser?.close();await installation?.close();await copy.log.close();await target?.log.close();if(target)await rm(target.root,{recursive:true,force:true})
  if(failed){await mkdir(evidence,{recursive:true});const retained=await mkdtemp(path.join(evidence,`failed-dev-${viewport.width}-`));await rename(copy.root,path.join(retained,'installation'));console.log('Stopped dev-identity fixture retained privately at '+retained)}
  else await rm(copy.root,{recursive:true,force:true})
 }
}

contract('SC-05 AUTH-BASE-001 BASE-ACCESS-002','a fresh install opens signed in, switches personas and signs out, refuses a forwarded request without the key, and gates dev-minted keys at both sizes',async()=>{
 const evidence=path.resolve(process.env.CRADLE_DEV_IDENTITY_EVIDENCE??'tmp/dev-identity-evidence')
 for(const viewport of [{width:1440,height:900},{width:390,height:844}])await journey(viewport,evidence)
})
