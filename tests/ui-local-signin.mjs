import assert from 'node:assert/strict'
import { mkdir, readFile, lstat, writeFile, rm, readdir, rename, mkdtemp } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { contract } from './contract.mjs'
import { freshLocalCopy } from './helpers/local-signin-copy.mjs'
import { verifyIdentityAndRecovery } from './helpers/local-signin-recovery.mjs'
import { verifyExpiredLink } from './helpers/local-signin-expired.mjs'
import {localInstallerJourney} from './helpers/local-installer-journey.mjs'
import { browserObservations } from './helpers/browser-observations.mjs'
import {bindings} from './helpers/rer-data-fixture.mjs'
import {availableMachine} from './helpers/available-machine.mjs'
import {accessibilityAction,accessibilityCaptureOnly,accessibilityContextOptions,accessibilityEvidence,accessibilityWidths,auditAccessibility,verifyNavigationDrawerWithKeyboard} from './helpers/accessibility-evidence.mjs'
import { sanitizeEvidenceText, stringifySafeEvidence } from './helpers/accessibility-redaction.mjs'
import {gateCookie} from './helpers/dev-gate.mjs'
import {installKeyboardInteractions} from './helpers/accessibility-keyboard.mjs'


async function freshViewport(viewport,evidence){
  const copy=await freshLocalCopy()
  let installation,browser,origin,failed=false,phase='initial setup'
  const receipt={viewports:[],secretsPrinted:false,realBase:true}
  const accessibilityScreens=[]
  try {
    await availableMachine()
    browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})})
    installation=await localInstallerJourney(copy,browser);origin=installation.origin
    phase='browser journey'
    const vars=await copy.readVars()
    assert.equal(vars.APP_ORIGIN,origin);assert.equal(vars.AUTH_LOCAL,'true');assert.equal(vars.MAIL_PROVIDER,'development')
    assert.ok(vars.SESSION_SECRET.length>=64);assert.ok(vars.SETUP_TOKEN.length>=64);assert.notEqual(vars.SESSION_SECRET,vars.SETUP_TOKEN)
    assert.equal((await lstat(path.join(copy.source,'.dev.vars'))).mode&0o777,0o600)
    assert.equal(vars.WORKSPACE_NAME,'My records');assert.equal(vars.WORKSPACE_TIMEZONE,'Australia/Brisbane');assert.equal(vars.WORKSPACE_CURRENCY,'AUD')
    await mkdir(evidence,{recursive:true})
      const context=await browser.newContext(accessibilityContextOptions({viewport}))
      context.setDefaultTimeout(30000)
      const gate=await gateCookie(origin,installation.key)
      await context.addCookies([gate])
      const page=await context.newPage()
      installKeyboardInteractions(page)
      const observations=browserObservations(page,origin)
      const navigateClient=async to=>{
        // The SSR links exist before Start has mounted its router. Finish the
        // document bootstrap before driving client navigation.
        await page.waitForLoadState('networkidle')
        await page.waitForFunction(()=>typeof window.__TSR_ROUTER__?.navigate==='function')
        observations.assertClean(undefined,'before client navigation')
        await page.evaluate(to=>window.__TSR_ROUTER__.navigate({to}),to)
      }
      let nativeContext,nativePage
      const check=async(label,screenshot=true)=>{
        // Axe temporarily changes inline styles while measuring contrast. Let
        // the actual document modules settle before allowing those mutations;
        // the independent JavaScript-disabled context proves native POST.
        await page.waitForLoadState('networkidle')
        if(!accessibilityCaptureOnly)assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${label} horizontal overflow`)
        let accessibility
        if(accessibilityEvidence){
          accessibility=await auditAccessibility(page,{screen:label,width:viewport.width,output:evidence,screenshot})
          const severe=[...accessibility.axe.wcag22aa,...accessibility.axe.targetSize].filter(violation=>['serious','critical'].includes(violation.impact))
          if(!accessibilityCaptureOnly)assert.deepEqual(severe.map(violation=>violation.id),[],`${label} WCAG 2.2 AA serious/critical accessibility`)
          accessibilityScreens.push({screen:label,width:viewport.width,wcagFindings:accessibility.axe.wcag22aa.length,targetSizeFindings:accessibility.axe.targetSize.length,controls:accessibility.layout.controls.length,tabbable:accessibility.keyboard.tabbableCount,tabOrderComplete:accessibility.keyboard.missing.length===0,keyboardActivations:accessibility.keyboard.activations.length,smallTargets:accessibility.layout.targetsBelow24.length})
        }else{
          const results=await new AxeBuilder({page}).analyze()
          if(results.violations.length){
            const structure=await page.evaluate(()=>({
              landmarks:[...document.querySelectorAll('main,[role="main"],header,aside,footer')].map(node=>({tag:node.tagName,id:node.id,className:node.className,parents:[...function*(n){while(n.parentElement){n=n.parentElement;yield n.tagName+'.'+n.className}}(node)]})),
              router:{status:window.__TSR_ROUTER__?.state.status,matches:window.__TSR_ROUTER__?.state.matches.map(match=>({routeId:match.routeId,status:match.status}))}
            }))
            await writeFile(path.join(evidence,`${label}-${viewport.width}-accessibility.json`),stringifySafeEvidence({violations:results.violations.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(node=>node.target)})),structure}))
            if(screenshot)await page.screenshot({path:path.join(evidence,`${label}-${viewport.width}-failure.png`),fullPage:true})
          }
          assert.deepEqual(results.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id),[],`${label} accessibility`)
          if(['signed-in','import-base'].includes(label))assert.deepEqual(results.violations.map(v=>v.id),[],`${label} all accessibility impacts`)
        }
        observations.assertClean(undefined,label)
        if(!accessibilityEvidence&&screenshot)await page.screenshot({path:path.join(evidence,`${label}-${viewport.width}.png`),fullPage:true})
      }
      await page.goto(origin+'/');await page.getByRole('link',{name:'Finish setup',exact:true}).waitFor();await check('home-public')
      assert.equal(await page.getByRole('heading',{level:1}).count(),1,'The Lobby has one h1')
      const signinResponse=await fetch(origin+'/signin',{redirect:'manual'});assert.equal(signinResponse.status,200,'Bare sign-in renders without a canonical search redirect')
      const html=await signinResponse.text();assert.match(html,/id="signin-email"/);assert.doesNotMatch(html,/Checking sign-in|Welcome back|Continue with local development identity/)
      await page.goto(origin+'/signin');await page.waitForLoadState('networkidle');observations.assertClean(undefined,'sign-in bootstrap');await page.getByLabel('Email address').fill('local-owner@example.test');await check('signin')
      assert.equal(await page.getByRole('link',{name:'Back to home',exact:true}).count(),1)
      nativeContext=await browser.newContext(accessibilityContextOptions({viewport,javaScriptEnabled:false}));nativeContext.setDefaultTimeout(30000);await nativeContext.addCookies([gate])
      nativePage=await nativeContext.newPage();installKeyboardInteractions(nativePage)
      // Exercise the actual SSR query boundary, including prototype keys and
      // forged markup. Notices are presentation only; none creates authority.
      for(const notice of ['<img src=x onerror=alert(1)>','__proto__','constructor','unrecognised']){
       await nativePage.goto(origin+'/signin?'+new URLSearchParams({notice,returnTo:'//foreign.example.test'}))
       assert.equal(await nativePage.getByRole('alert').count(),0)
       assert.equal(await nativePage.getByRole('status').count(),0)
       assert.equal(await nativePage.locator('.cr-identity img').count(),0)
       assert.equal(await nativePage.locator('input[name="returnTo"]').inputValue(),'/setup')
       assert.equal((await nativePage.locator('.cr-identity').innerText()).includes(notice),false)
      }
      for(const notice of ['rate_limited','mail_unavailable','auth_unavailable','client_ip_unavailable','invalid_origin','invalid_input']){
       await nativePage.goto(origin+'/signin?'+new URLSearchParams({notice}))
       assert.notEqual((await nativePage.getByRole('alert').innerText()).trim(),'')
       await nativePage.getByLabel('Email address').waitFor()
      }
      for(const unsafe of ['https://foreign.example.test','/%2f%2fforeign.example.test','/app/../../foreign','/app\\foreign','["/app","//foreign.example.test"]']){
       await nativePage.goto(origin+'/signin?'+new URLSearchParams({next:unsafe}))
       assert.equal(await nativePage.locator('input[name="returnTo"]').inputValue(),'/setup')
      }
      await nativePage.goto(origin+'/signin?'+new URLSearchParams({next:'/app/records?view=recent'}))
      assert.equal(await nativePage.locator('input[name="returnTo"]').inputValue(),'/app/records?view=recent')
      await nativePage.goto(origin+'/signin?'+new URLSearchParams({returnTo:'/setup',next:'/app/records'}))
      assert.equal(await nativePage.locator('input[name="returnTo"]').inputValue(),'/setup')
      await nativePage.getByLabel('Email address').fill('incomplete@localhost')
      const invalidRequest=nativePage.waitForResponse(response=>new URL(response.url()).pathname==='/auth/magic-link'&&response.request().method()==='POST')
      await accessibilityAction(nativePage,nativePage.getByRole('button',{name:'Send sign-in link',exact:true}))
      const invalidResponse=await invalidRequest;assert.equal(invalidResponse.status(),303)
      const invalidNotice=new URL(invalidResponse.headers().location,origin)
      assert.equal(invalidNotice.origin,origin);assert.equal(invalidNotice.pathname,'/signin');assert.equal(invalidNotice.searchParams.get('notice'),'invalid_email')
      await nativePage.waitForURL(url=>url.origin===origin&&url.pathname==='/signin'&&url.searchParams.get('notice')==='invalid_email');await nativePage.getByRole('alert').waitFor()
      assert.equal(await nativePage.locator('input[name="returnTo"]').inputValue(),'/setup')
      await nativePage.screenshot({path:path.join(evidence,`native-error-${viewport.width}.png`),fullPage:true})
      const nativeRequest=async(email,returnTo='/setup')=>{
       await nativePage.getByLabel('Email address').fill(email)
       const requested=nativePage.waitForResponse(response=>new URL(response.url()).pathname==='/auth/magic-link'&&response.request().method()==='POST')
       await accessibilityAction(nativePage,nativePage.getByRole('button',{name:'Send sign-in link',exact:true}))
       const response=await requested;assert.equal(response.status(),303);assert.equal(response.headers()['set-cookie'],undefined)
       const notice=new URL(response.headers().location,origin)
       assert.equal(notice.origin,origin);assert.equal(notice.pathname,'/signin');assert.equal(notice.searchParams.get('notice'),'sent');assert.equal(notice.searchParams.get('returnTo'),returnTo==='/app'?null:returnTo)
       await nativePage.waitForURL(url=>url.origin===origin&&url.pathname==='/signin'&&url.searchParams.get('notice')==='sent'&&url.searchParams.get('returnTo')===(returnTo==='/app'?null:returnTo))
       await nativePage.getByRole('heading',{name:'Request received',exact:true}).waitFor()
       await nativePage.getByRole('status').waitFor()
       assert.equal((await nativeContext.cookies()).some(cookie=>cookie.name==='operator_session_local'),false,'A pre-hydration request creates no session')
       assert.equal((await nativeContext.request.get(origin+'/auth/session')).status(),401,'A notice grants no session')
       return nativePage.getByRole('status').innerText()
      }
      const requestedDestination='/app'
      await nativePage.goto(origin+'/signin?'+new URLSearchParams({next:requestedDestination}))
      const unknownFeedback=await nativeRequest('unknown-person@example.test',requestedDestination)
      await nativePage.screenshot({path:path.join(evidence,`native-feedback-${viewport.width}.png`),fullPage:true})
      assert.equal(await nativePage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Native feedback fits the viewport')
      await accessibilityAction(nativePage,nativePage.getByRole('link',{name:'Use another address',exact:true}))
      await nativePage.getByLabel('Email address').waitFor()
      assert.equal(new URL(nativePage.url()).searchParams.has('notice'),false)
      assert.equal(await nativePage.locator('input[name="returnTo"]').inputValue(),requestedDestination,'Use another address retains the safe destination after the Base redirect')
      assert.equal(await nativeRequest('unknown-person@example.test',requestedDestination),unknownFeedback,'Resending after an omitted Base returnTo keeps /app and generic feedback')
      await nativePage.goto(origin+'/signin')
      if(viewport.width===1440){
       assert.equal(await nativeRequest('local-owner@example.test'),unknownFeedback,'Allowed and unknown addresses receive identical public feedback')
       await accessibilityAction(nativePage,nativePage.getByRole('link',{name:'Open development outbox',exact:true}))
       await accessibilityAction(nativePage,nativePage.getByRole('link',{name:'Read message',exact:true}).first())
       await accessibilityAction(nativePage,nativePage.getByRole('link',{name:'Open this link',exact:true}))
       await nativePage.getByRole('heading',{name:'Confirm sign-in to Cradle',exact:true}).waitFor()
       assert.equal((await nativeContext.cookies()).some(cookie=>cookie.name==='operator_session_local'),false,'Native outbox navigation and confirmation preview create no session')
       await page.goto(origin+'/__dev/outbox')
      }else{
       const requested=page.waitForResponse(response=>new URL(response.url()).pathname==='/auth/request'&&response.request().method()==='POST')
       await accessibilityAction(page,page.getByRole('button',{name:'Send sign-in link',exact:true}))
       const response=await requested;assert.equal(response.status(),200);assert.deepEqual(await response.json(),{status:'accepted'})
       await page.getByRole('heading',{name:'Request received'}).waitFor()
       assert.equal(await page.getByRole('status').innerText(),unknownFeedback,'JavaScript and native requests share generic feedback')
       await accessibilityAction(page,page.getByRole('link',{name:'Open development outbox',exact:true}))
       await nativeContext.close()
      }
      // Viewer contains real token links. Never capture its detail text or URL.
      await accessibilityAction(page,page.getByRole('link',{name:'Read message',exact:true}).first())
      await check('outbox',false)
      const link=await page.getByRole('link',{name:'Open this link',exact:true}).getAttribute('href')
      assert.equal(new URL(link).pathname,'/auth/confirm')
      const preview=await fetch(link);assert.equal(preview.status,200);assert.equal(preview.headers.get('set-cookie'),null)
      assert.equal((await fetch(origin+'/app',{redirect:'manual'})).status,303)
      await accessibilityAction(page,page.getByRole('link',{name:'Open this link',exact:true}))
      await page.getByRole('heading',{name:'Confirm sign-in to Cradle',exact:true}).waitFor();await check('confirm')
      assert.equal((await context.cookies()).some(cookie=>cookie.name==='operator_session_local'),false)
      if(viewport.width===1440){
       await nativePage.goto(link);await accessibilityAction(nativePage,nativePage.getByRole('button',{name:'Confirm',exact:true}));await nativePage.waitForURL(origin+(viewport.width===1440?'/setup':'/app'))
       await nativePage.getByLabel('Workspace name',{exact:true}).waitFor()
       const setupPage=await nativeContext.request.get(origin+'/setup')
       assert.match(setupPage.headers()['cache-control'],/no-store/,'The owner form and CSRF token are never cached')
       const deep=await nativeContext.request.get(origin+'/app/records',{maxRedirects:0});assert.equal(new URL(deep.headers().location,origin).pathname,'/setup')
       const proof=await nativeContext.request.get(origin+'/auth/csrf'),{csrfToken}=await proof.json()
       const invalid=await nativeContext.request.post(origin+'/setup',{headers:{origin},form:{name:'Changed without authority',timezone:'UTC',currency:'USD'},maxRedirects:0});assert.equal(invalid.status(),403,'Setup refuses missing CSRF')
       const foreign=await nativeContext.request.post(origin+'/setup',{headers:{origin:'https://foreign.example.test'},form:{csrf:csrfToken,name:'Changed without authority',timezone:'UTC',currency:'USD'},maxRedirects:0});assert.equal(foreign.status(),403,'Setup refuses foreign-origin mutation')
       const duplicate=await nativeContext.request.post(origin+'/setup',{headers:{origin,'content-type':'application/x-www-form-urlencoded'},data:new URLSearchParams([['csrf',csrfToken],['name','First'],['name','Second'],['timezone','UTC'],['currency','USD']]).toString(),maxRedirects:0});assert.equal(duplicate.status(),400,'Setup refuses ambiguous form fields')
       const oversized=await nativeContext.request.post(origin+'/setup',{headers:{origin,'content-type':'application/x-www-form-urlencoded'},data:new URLSearchParams({csrf:csrfToken,name:'x'.repeat(9000),timezone:'UTC',currency:'USD'}).toString(),maxRedirects:0});assert.equal(oversized.status(),413,'Setup bounds the request body before mutation')
       if(accessibilityEvidence){
        const setupAudit=await auditAccessibility(nativePage,{screen:'setup-nojs',width:viewport.width,output:evidence})
        const setupSevere=[...setupAudit.axe.wcag22aa,...setupAudit.axe.targetSize].filter(violation=>['serious','critical'].includes(violation.impact))
        if(!accessibilityCaptureOnly)assert.deepEqual(setupSevere.map(violation=>violation.id),[],`setup-nojs WCAG 2.2 AA serious/critical accessibility`)
        accessibilityScreens.push({screen:'setup-nojs',width:viewport.width,wcagFindings:setupAudit.axe.wcag22aa.length,targetSizeFindings:setupAudit.axe.targetSize.length,controls:setupAudit.layout.controls.length,tabbable:setupAudit.keyboard.tabbableCount,tabOrderComplete:setupAudit.keyboard.missing.length===0,keyboardActivations:setupAudit.keyboard.activations.length,smallTargets:setupAudit.layout.targetsBelow24.length})
       }else{if(!accessibilityCaptureOnly)assert.equal(await nativePage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await nativePage.screenshot({path:path.join(evidence,'setup-1440.png'),fullPage:true})}
       await accessibilityAction(nativePage,nativePage.getByRole('button',{name:'Open my workspace',exact:true}));await nativePage.waitForURL(origin+'/app')
       await nativePage.getByRole('link',{name:'Open records',exact:true}).waitFor()
       const cookies=await nativeContext.cookies();assert.ok(cookies.some(cookie=>cookie.name==='operator_session_local'&&cookie.httpOnly),'The ordinary confirmation POST works without JavaScript')
       await context.addCookies(cookies);await nativeContext.close();await page.goto(origin+'/app')
      }else {
       await accessibilityAction(page,page.getByRole('button',{name:'Confirm',exact:true}));await page.waitForURL(origin+'/setup')
       const deep=await context.request.get(origin+'/app/records',{maxRedirects:0});assert.equal(new URL(deep.headers().location,origin).pathname,'/setup')
       // Drive the real mounted router through its public navigation method:
       // client document transport must enforce the same unfinished state.
       await page.goto(origin+'/docs');await navigateClient('/app/records');await page.waitForURL(origin+'/setup')
       await check('setup');await accessibilityAction(page,page.getByRole('button',{name:'Open my workspace',exact:true}))
      }
      await page.waitForURL(origin+'/app');await page.getByRole('link',{name:'Open records',exact:true}).waitFor()
      await page.getByRole('heading',{name:'Your business, organised your way.',exact:true}).waitFor()
      await navigateClient('/setup');await page.waitForURL(origin+'/app')
      await page.getByRole('link',{name:'Open records',exact:true}).waitFor()
      const homeText=await page.locator('body').innerText()
      assert.doesNotMatch(homeText,/This work is outside your access|loopback_required|Launch|Campaign|campaigns/)
      const homeResponse=await context.request.get(origin+'/app')
      assert.equal(homeResponse.status(),200)
      const homeHtml=await homeResponse.text()
      if(viewport.width===1440){const settings=await context.request.get(origin+'/api/settings');assert.equal(settings.status(),200);const {settings:current}=await settings.json();assert.deepEqual({name:current.workspace.name,timezone:current.workspace.timezone,currency:current.workspace.currency},{name:'My records',timezone:'Australia/Brisbane',currency:'AUD'},'The installed workspace retains the approved business settings')}
      const plainContext = await browser.newContext(accessibilityContextOptions({ viewport, javaScriptEnabled: false }))
      try {
        await plainContext.addCookies(await context.cookies())
        const plainHome = await plainContext.newPage()
        await plainHome.goto(origin+'/app')
        const importAction = plainHome.getByRole('link',{name:'Import a base',exact:true})
        await accessibilityAction(plainHome,importAction)
        await plainHome.waitForURL(url=>url.pathname.replace(/\/$/,'')==='/app/records'&&url.search==='?import=base')
        await plainHome.getByRole('heading',{name:'Import a base',exact:true}).waitFor()
        assert.equal(await plainHome.getByLabel('CSV files',{exact:true}).count(),1,'The server-rendered first step reaches the upload controls without JavaScript')
      } finally { await plainContext.close() }
      assert.doesNotMatch(homeHtml,/This work is outside your access|loopback_required/)
      await check('signed-in')
      if(accessibilityEvidence&&!accessibilityCaptureOnly&&viewport.width===768)receipt.navigationDrawer=await verifyNavigationDrawerWithKeyboard(page,{output:evidence,screen:'signin-navigation-drawer'})
      const cookies=await context.cookies();assert.ok(cookies.some(cookie=>cookie.name==='operator_session_local'&&cookie.httpOnly))
      const replay=await fetch(origin+'/auth/confirm',{method:'POST',redirect:'manual',headers:{origin,'content-type':'application/json'},body:JSON.stringify({token:new URL(link).searchParams.get('token')})});assert.equal(replay.status,400)
      await accessibilityAction(page,page.getByRole('link',{name:'Import a base',exact:true}));await page.getByRole('heading',{name:'Import a base',exact:true}).waitFor();await check('import-base')
      await page.goto(origin+'/app');await page.getByRole('link',{name:'Open records',exact:true}).waitFor()
      await accessibilityAction(page,page.getByRole('link',{name:'Open records',exact:true}));await page.getByRole('heading',{name:'Records',exact:true}).waitFor();await check('records')
      await verifyIdentityAndRecovery({browser,context,page,viewport,origin,evidence,copy,link,accessibilityScreens})
      receipt.viewports.push({...viewport,preHydrationPost:true,nativeErrorFeedback:true,unknownAddressGeneric:true,queryNormalization:true,nativeUseAnotherAddress:true,javaScriptDisabledConfirmation:viewport.width===1440,recordsFirstHome:true,importFromFirstHome:true,importAndHomeAxeViolations:0,serverRenderedFirstStep:true,renamedIdentity:true,javaScriptDisabledForm:true,expiredAndReusedConfirmDenied:true,seriousCritical:0,overflow:false,previewSessionless:true,replayDenied:true,accessibilityScreens,navigationDrawer:receipt.navigationDrawer,browserObservations:observations.assertClean()})
      await context.close()
    for(const secret of [vars.SESSION_SECRET,vars.SETUP_TOKEN])assert.equal(installation.output().includes(secret),false,'Local dev must redact secrets')
    await assert.rejects(copy.rer(['reset','--yes','--non-interactive']),error=>error.exitCode===4&&error.errorCode==='safety_refusal','Reset refuses an active app')
    await installation.close()
    phase='completed repeat setup'
    const completed=await bindings(copy.source,async({DB})=>({setup:await DB.prepare('SELECT completed_at FROM cradle_first_run').first(),workspace:await DB.prepare('SELECT * FROM workspace').first(),owner:(await DB.prepare('SELECT id FROM oa_operators').all()).results}))
    assert.ok(completed.setup.completed_at,'Native first-run completion is durable')
    await copy.rer(['setup','--non-interactive'])
    assert.deepEqual(await bindings(copy.source,async({DB})=>({setup:await DB.prepare('SELECT completed_at FROM cradle_first_run').first(),workspace:await DB.prepare('SELECT * FROM workspace').first(),owner:(await DB.prepare('SELECT id FROM oa_operators').all()).results})),completed,'Repeat setup retains completed workspace and owner')
    phase='expired link recovery'
    await verifyExpiredLink({browser,viewport,evidence})
    return receipt.viewports[0]
  } catch(error) {
    failed=true
    // Browser assertion diagnostics can include credential URLs: redact them.
    throw new Error(sanitizeEvidenceText(phase+': '+String(error.message)))
  } finally {
    await browser?.close()
    await installation?.close()
    if(origin)assert.equal(await fetch(origin+'/health',{signal:AbortSignal.timeout(2000)}).catch(()=>null),null,'Installer cleanup closes the app listener')
    await copy.log.close()
    if(failed){
      await mkdir(evidence,{recursive:true})
      const retained=await mkdtemp(path.join(evidence,`failed-${viewport.width}-`))
      await rename(copy.root,path.join(retained,'installation'))
      console.log('Stopped native browser fixture retained privately at '+retained)
    }else await rm(copy.root,{recursive:true,force:true})
  }
}

contract('AUTH-BASE-001 HOME-002 VIEW-001 BASE-ACCESS-002 BASE-ACCESS-003 RECORDS-001 RECORDS-005', 'fresh source install, local setup, captured real Base email, POST confirmation and signed-in records at both sizes',async()=>{
 const evidence=path.resolve(process.env.CRADLE_LOCAL_EVIDENCE??'tmp/local-signin-evidence')
 const receipt={viewports:[],secretsPrinted:false,realBase:true}
 for(const width of accessibilityWidths){const viewport={width,height:width===390?844:900};receipt.viewports.push(await freshViewport(viewport,evidence))}
 await writeFile(path.join(evidence,'receipt.json'),stringifySafeEvidence(receipt))
})
