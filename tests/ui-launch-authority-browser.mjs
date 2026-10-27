import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { launchBaseAuthorityRuntime } from './helpers/launch-base-authority-runtime.mjs'
import { chromium } from '@playwright/test'
import { launchAuthorityRuntime, LAUNCH_APP_ID, launchEntities } from './helpers/launch-authority-runtime.mjs'
import { navigateFromSignInToApp } from './helpers/public-app-navigation.mjs'
import { accessibilityCaptureOnly, accessibilityContextOptions, accessibilityEvidence, accessibilityWidths, auditAccessibility } from './helpers/accessibility-evidence.mjs'
import { installKeyboardInteractions } from './helpers/accessibility-keyboard.mjs'

const output=process.env.CRADLE_AUTHORITY_EVIDENCE??path.join(tmpdir(),'launch-authority-browser')
const receipt={ commit:spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(), dirty:!!spawnSync('git',['status','--porcelain'],{encoding:'utf8'}).stdout.trim(), startedAt:new Date().toISOString(), completedAt:null, environment:'local emitted Worker, synthetic D1; no hosted claim', captures:[], created:[], related:[], errors:[], generatedRequests:[] }
const h=await launchAuthorityRuntime()
let browser, production
try {
  await mkdir(output,{recursive:true})
  browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--host-resolver-rules=MAP cradle.authority.test 127.0.0.1','--no-proxy-server']})
  const sample=(await (await h.request(h.ownerSession,'/api/campaigns')).json()).items[0]
  const repair=await h.addPerson({appId:'00000000000000000000000600',name:'Repairs colleague'})
  const revoked=await h.addPerson({name:'Revoked launch colleague'})
  const recordPath=`/app/records/${LAUNCH_APP_ID}/${launchEntities.campaign}/${sample.id}`
  assert.equal((await h.request(revoked.session,recordPath)).status,200)
  await h.db.prepare("UPDATE authority_memberships SET state='removed',version=version+1 WHERE principal_id=? AND app_id=?").bind(revoked.id,LAUNCH_APP_ID).run()
  const capture=async(page,name,width,{publicMissing=false}={})=>{
    await page.waitForLoadState('networkidle')
    // Capture the full document from its top so fixed navigation remains at the
    // viewport origin after form controls have scrolled themselves into view.
    await page.evaluate(()=>window.scrollTo(0,0))
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
    if(!accessibilityCaptureOnly)assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} overflows at ${width}`)
    if(publicMissing){const title=page.getByRole('heading',{level:1});assert.equal(await title.isVisible(),true);assert.ok((await title.innerText()).trim().length>0,'Missing document has a visible descriptive heading');assert.equal(await page.locator('a[href="/app"]').isVisible(),true,'Public missing document offers workspace navigation');assert.equal(await page.locator('.operator-shell').count(),0,'Intentional missing document uses the public frame')}else assert.equal(await page.locator('.operator-shell').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(243, 243, 238)')
    let file=`${name}-${width}.jpg`
    if(accessibilityEvidence){const evidence=await auditAccessibility(page,{screen:`launch-authority-${name}`,width,output});assert.equal(evidence.layout.pageOverflow,false);file=`a11y-launch-authority-${name}-${width}.png`}
    else await page.screenshot({path:path.join(output,file),type:'jpeg',quality:80,fullPage:true})
    receipt.captures.push({file,width,url:new URL(page.url()).pathname,overflow:false})
  }
  for(const width of accessibilityWidths) {
    const context=await browser.newContext(accessibilityContextOptions({viewport:{width,height:960}})),page=await context.newPage()
    installKeyboardInteractions(page)
    page.on('pageerror',error=>{ const failure={path:new URL(page.url()).pathname,message:error.message,stack:error.stack}; receipt.errors.push(failure); console.log('Browser error:',JSON.stringify(failure)) })
    await context.addCookies([{name: h.ownerSession.cookie.split('=')[0], value: h.ownerSession.cookie.slice(h.ownerSession.cookie.indexOf('=')+1),url:h.origin}])
    await page.goto(`${h.origin}/app/campaigns`)
    await page.getByRole('button',{name:'New campaign',exact:true}).click()
    const name=`Autumn launch ${width}`,code=`AUTUMN-${width}`
    await page.getByLabel('Campaign name',{exact:true}).fill(name)
    await page.getByLabel('Campaign code',{exact:true}).fill(code)
    const picker=page.getByLabel('Owner',{exact:true})
    await picker.selectOption(h.owner)
    for(const [label,value] of [['Start date','2026-10-01'],['Launch date','2026-12-01'],['Phase','Planning'],['Status','On track'],['Manually reported health (%)','65'],['Budget (USD)','1000.00'],['Spend so far (USD)','125.00'],['Objective','Ship the autumn collection'],['Status summary','Preparing the launch']]) await (['Phase','Status'].includes(label) ? page.getByLabel(label,{exact:true}).selectOption(value) : page.getByLabel(label,{exact:true}).fill(value))
    assert.equal(await page.getByRole('button',{name:'Create campaign',exact:true}).isEnabled(),true)
    await capture(page,'create-ready',width)
    const submitted=page.waitForResponse(response=>response.url().endsWith('/api/v1/commands/launch.campaign.create')&&response.request().method()==='POST')
    await page.getByRole('button',{name:'Create campaign',exact:true}).click()
    const response=await submitted
    assert.equal(response.status(),200,await response.text())
    await page.getByRole('button',{name:'New campaign',exact:true}).waitFor()
    const row=await h.db.prepare('SELECT id,name,owner_id,budget_minor,spend_minor,version FROM campaigns WHERE code=?').bind(code).first()
    assert.equal(row.name,name);assert.equal(row.owner_id,h.owner);assert.equal(row.budget_minor,100000);assert.equal(row.spend_minor,12500);assert.equal(row.version,1)
    assert.equal((await h.db.prepare("SELECT count(*) n FROM command_admissions WHERE action='launch.campaign.create' AND actor_id=?").bind(h.owner).first()).n,receipt.created.length+1,'Exactly one admission per successful campaign creation')
    receipt.created.push(row)
    await page.goto(`${h.origin}/app/campaigns/${row.id}`)
    await page.getByRole('heading',{name,exact:true}).waitFor()
    await capture(page,'created-campaign',width)
    if (!(await page.getByText('Add or edit deliverables',{exact:true}).evaluate(el=>el.parentElement.open))) await page.getByText('Add or edit deliverables',{exact:true}).click()
    await page.getByRole('button',{name:'Add deliverable',exact:true}).click()
    await page.getByLabel('Title',{exact:true}).fill(`Delivery notes ${width}`)
    await page.getByLabel('Owner',{exact:true}).selectOption(h.owner)
    const relatedSubmission=page.waitForResponse(response=>response.url().endsWith('/api/v1/commands/launch.deliverable.create')&&response.request().method()==='POST')
    await page.getByRole('button',{name:'Save deliverable',exact:true}).click()
    assert.equal((await relatedSubmission).status(),200)
    await page.getByText(`Delivery notes ${width}`,{exact:true}).first().waitFor()
    const related=await h.db.prepare('SELECT id,campaign_id,owner_id,title FROM deliverables WHERE title=?').bind(`Delivery notes ${width}`).first()
    assert.equal(related.campaign_id,row.id);assert.equal(related.owner_id,h.owner);receipt.related.push(related)
    await capture(page,'created-deliverable',width)
    // The mounted repair API validates decision IDs. Exercise its real failure
    // state with a long URL, then the launch operator's scoped denial for a
    // valid decision ID. Authorization precedes any missing-record disclosure.
    const invalidDecision='LongUnavailableApproval'.repeat(14)
    const invalid=await h.request(h.ownerSession,`/api/v1/decisions/${invalidDecision}/review`)
    assert.equal(invalid.status,400)
    const invalidFailure=(await invalid.json()).error
    assert.equal(invalidFailure.code,'validation')
    await page.goto(`${h.origin}/app/approvals/${invalidDecision}`)
    await page.locator('.cr-state').getByText(invalidFailure.message,{exact:true}).waitFor()
    assert.equal(await page.locator('.cr-state button').isVisible(),true,'A failed read offers another attempt')
    await capture(page,'long-resource-error',width)
    const unavailableDecision='0'.repeat(26)
    const deniedDecision=await h.request(h.ownerSession,`/api/v1/decisions/${unavailableDecision}/review`)
    assert.equal(deniedDecision.status,403)
    const deniedFailure=(await deniedDecision.json()).error
    assert.equal(deniedFailure.code,'forbidden')
    await page.goto(`${h.origin}/app/approvals/${unavailableDecision}`)
    await page.locator('.cr-state').getByText(deniedFailure.message,{exact:true}).waitFor()
    assert.equal(await page.locator('.cr-state .cr-tag--access').isVisible(),true,'The resource presents an access state')
    assert.equal(await page.locator('.cr-state button').count(),0,'An authority denial does not offer a futile retry')
    await capture(page,'scoped-resource',width)
    // A real local D1 failure during document read must keep the October frame.
    await h.db.prepare('ALTER TABLE campaigns RENAME TO unavailable_campaigns').run()
    try {
      const failure=await page.goto(`${h.origin}/app/campaigns/${sample.id}`)
      assert.equal(failure.status(),500)
      const document=await failure.text(); assert.match(document,/cr-document-failure/); assert.match(document,/operator-shell/); assert.match(document,/<link[^>]*stylesheet/); assert.doesNotMatch(document,/D1_ERROR|SQLITE|SELECT |SESSION_SECRET|synthetic-launch-authority-test-signing-key/)
      await page.getByRole('heading',{name:'Could not load this page',exact:true}).waitFor()
      assert.doesNotMatch(await page.locator('body').innerText(),/D1_ERROR|SQLITE|SELECT |SESSION_SECRET|synthetic-launch-authority-test-signing-key/)
      await capture(page,'database-error',width)
    } finally { await h.db.prepare('ALTER TABLE unavailable_campaigns RENAME TO campaigns').run() }
    await page.getByRole('button',{name:'Retry',exact:true}).click()
    await page.getByRole('heading',{name:sample.name,exact:true}).waitFor()
    // Replay a real generated client request with a currently valid repair-only session.
    page.on('request',request=>{if(request.url().includes('/_serverFn/')&&new URL(request.url()).searchParams.has('payload'))receipt.generatedRequests.push({url:request.url(),headers:request.headers()})})
    await page.goto(`${h.origin}/docs`)
    await page.getByRole('banner').getByRole('link',{name:'Sign in',exact:true}).click()
    await navigateFromSignInToApp(page)
    await page.getByText('Live campaigns',{exact:true}).waitFor()
    const wire=receipt.generatedRequests.find(request=>new URL(request.url).searchParams.get('payload').includes('/api/portfolio'))
    assert.ok(wire,'observe the real generated client transport')
    const headers={...wire.headers,cookie:repair.session.cookie};delete headers.host
    const rpc=await fetch(wire.url,{headers}),text=await rpc.text()
    assert.ok(!text.includes(sample.name));assert.match(text,/forbidden/)
    const url=new URL(wire.url);url.searchParams.set('payload',url.searchParams.get('payload').replace(JSON.stringify('/api/portfolio'),JSON.stringify(`/api/campaigns/${sample.id}`)))
    const denied=await fetch(url,{headers}),deniedText=await denied.text()
    assert.ok(!deniedText.includes(sample.name));assert.match(deniedText,/permit|error|Error/)
    await context.clearCookies()
    await context.addCookies([{name:repair.session.cookie.split('=')[0],value:repair.session.cookie.slice(repair.session.cookie.indexOf('=')+1),url:h.origin}])
    await page.goto(`${h.origin}/app`)
    await page.getByRole('region',{name:'Your bases',exact:true}).waitFor()
    await page.getByRole('heading',{name:'This work is outside your access',exact:true}).waitFor()
    assert.ok(!(await page.locator('body').innerText()).includes(sample.name))
    await capture(page,'scoped-home',width)
    await context.clearCookies()
    await context.addCookies([{name:revoked.session.cookie.split('=')[0],value:revoked.session.cookie.slice(revoked.session.cookie.indexOf('=')+1),url:h.origin}])
    const authoritySnapshot=async()=>Object.fromEntries(await Promise.all(['authority_memberships','authority_grants','command_admissions'].map(async table=>[table,(await h.db.prepare(`SELECT * FROM ${table}`).all()).results.map(row=>JSON.stringify(row)).sort()])))
    const beforeRead=await authoritySnapshot()
    const forbidden=await page.goto(`${h.origin}${recordPath}`)
    assert.equal(forbidden.status(),404,'Revoked records use the same missing document status as absent records')
    const revokedDocument=await forbidden.text()
    for(const protectedValue of [sample.name,sample.id,recordPath])assert.equal(revokedDocument.includes(protectedValue),false,'Missing document contains no protected record data or requested path')
    await page.getByRole('heading',{level:1}).waitFor()
    const revokedText=await page.locator('body').innerText()
    await capture(page,'revoked-record',width,{publicMissing:true})
    const missingPath=`/app/records/${LAUNCH_APP_ID}/${launchEntities.campaign}/${'0'.repeat(26)}`
    const absent=await page.goto(`${h.origin}${missingPath}`)
    assert.equal(absent.status(),404)
    await page.getByRole('heading',{level:1}).waitFor()
    assert.equal(await page.locator('body').innerText(),revokedText,'Absent and revoked records expose the same visible missing document')
    const absentDocument=await absent.text()
    for(const protectedValue of [sample.name,sample.id,missingPath])assert.equal(absentDocument.includes(protectedValue),false)
    await capture(page,'missing-record',width,{publicMissing:true})
    assert.deepEqual(await authoritySnapshot(),beforeRead,'Revoked and missing document reads preserve every membership, grant and command admission')
    receipt.authorityReadPreservation??=[];receipt.authorityReadPreservation.push({width,unchanged:true,counts:Object.fromEntries(Object.entries(beforeRead).map(([table,rows])=>[table,rows.length]))})
    await context.close()
  }
  // A fresh Base installation on the real emitted Worker over canonical HTTPS:
  // browser DNS resolves only this synthetic test domain to our own listener.
  production=await launchBaseAuthorityRuntime()
  const productionOrigin=production.origin
  const baseOwner=await production.bootstrap()
  const nativeCookie=await production.nativeCredential(baseOwner.owner)
  for(const width of accessibilityWidths) {
    const context=await browser.newContext(accessibilityContextOptions({viewport:{width,height:960},ignoreHTTPSErrors:true})),page=await context.newPage()
    installKeyboardInteractions(page)
    page.on('pageerror',error=>receipt.errors.push({path:new URL(page.url()).pathname,message:error.message}))
    const response=await page.goto(`${productionOrigin}/signin`);assert.equal(response.status(),200)
    await page.getByRole('button',{name:'Send sign-in link',exact:true}).waitFor()
    assert.equal(await page.getByRole('button',{name:'Continue with local development identity'}).count(),0)
    await page.waitForLoadState('networkidle');if(!accessibilityCaptureOnly)assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
    let file=`production-signin-${width}.jpg`
    if(accessibilityEvidence){const evidence=await auditAccessibility(page,{screen:'launch-authority-production-signin',width,output});assert.equal(evidence.layout.pageOverflow,false);file=`a11y-launch-authority-production-signin-${width}.png`}
    else await page.screenshot({path:path.join(output,file),type:'jpeg',quality:80,fullPage:true})
    receipt.captures.push({file,width,url:'/signin',profile:'production HTTPS on local Worker',overflow:false})
    await context.addCookies([{name:'session_id',value:nativeCookie.slice(11),url:productionOrigin,secure:true}])
    await page.goto(`${productionOrigin}/app`)
    assert.equal(new URL(page.url()).pathname,'/signin','A genuine native credential cannot enter the production app')
    await page.getByRole('button',{name:'Send sign-in link',exact:true}).waitFor()
    await context.clearCookies()
    await context.addCookies([{name:'__Host-operator_session',value:baseOwner.cookie.split('=')[1],url:productionOrigin,secure:true,httpOnly:true,sameSite:'Lax'}])
    const ownerDocument=await page.goto(`${productionOrigin}/app`)
    assert.equal(ownerDocument.status(),200)
    assert.equal(new URL(page.url()).pathname,'/app')
    await page.getByRole('region',{name:'Your bases',exact:true}).waitFor()
    await capture(page,'production-home',width)
    await context.close()
  }
  assert.deepEqual(receipt.errors,[])
  // Do not persist cookies, tokens or generated request headers.
  receipt.generatedRequests=receipt.generatedRequests.map(request=>({path:new URL(request.url).pathname}))
  receipt.completedAt=new Date().toISOString()
  await writeFile(path.join(output,'manifest.json'),JSON.stringify(receipt,null,2))
  console.log(JSON.stringify({captures:receipt.captures.length,created:receipt.created.length,related:receipt.related.length,errors:receipt.errors,commit:receipt.commit,dirty:receipt.dirty,output}))
} finally {
  if(browser)await browser.close()
  await production?.close()
  await h.close()
}
