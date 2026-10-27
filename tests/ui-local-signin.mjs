import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import { mkdir, lstat, writeFile, rm, cp, mkdtemp } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { contract } from './contract.mjs'
import { freshLocalCopy } from './helpers/local-signin-copy.mjs'
import { verifyIdentityAndRecovery } from './helpers/local-signin-recovery.mjs'
import { verifyExpiredSession } from './helpers/local-signin-expired.mjs'
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
    installation=await localInstallerJourney(copy,browser,{zeroSetup:true});origin=installation.origin
    phase='browser journey'
    const vars=await copy.readVars()
    assert.equal(vars.APP_ORIGIN,origin);assert.equal(vars.AUTH_LOCAL,'true');assert.equal(vars.MAIL_PROVIDER,'development')
    assert.ok(vars.SESSION_SECRET.length>=64);assert.ok(vars.SETUP_TOKEN.length>=64);assert.notEqual(vars.SESSION_SECRET,vars.SETUP_TOKEN)
    assert.equal((await lstat(path.join(copy.source,'.dev.vars'))).mode&0o777,0o600)
    assert.ok(vars.OWNER_EMAIL,'Zero-setup dev chooses an owner for this checkout')
    await mkdir(evidence,{recursive:true})
      const context=await browser.newContext(accessibilityContextOptions({viewport}))
      context.setDefaultTimeout(30000)
      let page=await context.newPage()
      installKeyboardInteractions(page)
      let observations=browserObservations(page,origin)
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
      await page.goto(origin+'/');await page.getByRole('link',{name:'Sign in',exact:true}).waitFor()
      assert.equal(await page.getByRole('link',{name:'Finish setup',exact:true}).count(),0,'The claimed owner has no stale setup action')
      const lobbyText=await page.locator('body').innerText()
      assert.doesNotMatch(lobbyText,/setup token|SETUP_TOKEN/i,'The claimed Lobby has no setup-token instructions')
      assert.equal(lobbyText.includes(vars.SETUP_TOKEN),false,'The Lobby never exposes the private setup token')
      await check('home-public')
      assert.equal(await page.getByRole('heading',{level:1}).count(),1,'The Lobby has one h1')
      // Base dev identity owns local sign-in: a browser without this checkout's key is sent to the key page, which offers no email sign-in.
      const signinResponse=await fetch(origin+'/signin',{redirect:'manual'});assert.equal(signinResponse.status,303)
      assert.equal(new URL(signinResponse.headers.get('location'),origin).pathname,'/__dev/key','Sign-in without the checkout key opens the key page')
      const keyPage=await fetch(origin+'/__dev/key');assert.equal(keyPage.status,200)
      const html=await keyPage.text();assert.doesNotMatch(html,/id="signin-email"|Send sign-in link|\/__dev\/outbox/)
      await accessibilityAction(page,page.getByRole('link',{name:'Sign in',exact:true}));await page.waitForURL(origin+'/__dev/key')
      await page.getByRole('heading',{name:'Opening the local app',exact:true}).waitFor();await check('signin')
      assert.match(await page.locator('body').innerText(),/RER_OPEN/,'The key page sends the person to the link rer printed')
      // The key exchange POST navigates its own document. Observe the public
      // shell before it and the authenticated document after it independently.
      observations.assertClean(undefined,'public local sign-in')
      await page.close();page=await context.newPage();installKeyboardInteractions(page)
      // rer setup's workspace answers are the owner's confirmed details: the key exchange opens the app, never a second setup.
      await page.goto(installation.openUrl);await page.waitForURL(origin+'/app')
      await page.waitForLoadState('networkidle');observations=browserObservations(page,origin)
      assert.equal(new URL(page.url()).hash,'','The checkout key leaves the address bar after exchange')
      const gate=await gateCookie(origin,installation.key),cookies=await context.cookies(origin),sessions=cookies.filter(cookie=>cookie.name!==gate.name)
      assert.equal(sessions.length,1,'The dev exchange issues one session in addition to its gate')
      assert.equal(sessions[0].httpOnly,true,'The actual owner session is HttpOnly')
      assert.equal((await page.evaluate(()=>document.cookie)).includes(sessions[0].name+'='),false,'Page JavaScript cannot read the owner session')
      assert.equal((await context.request.get(origin+'/auth/session')).status(),200,'The real dev owner session authenticates')
      assert.equal((await fetch(origin+'/auth/session')).status,401,'No ambient session escapes the browser')
      const deep=await context.request.get(origin+'/app/records',{maxRedirects:0});assert.equal(deep.status(),200,'Configured workspace details leave no setup gate')
      await page.waitForURL(origin+'/app');await page.getByRole('region',{name:'Your bases',exact:true}).waitFor()
      await page.getByRole('region',{name:'Recent activity',exact:true}).waitFor()
      await navigateClient('/setup');await page.waitForURL(origin+'/app')
      await page.getByRole('region',{name:'Your bases',exact:true}).waitFor()
      await page.waitForLoadState('networkidle')
      const homeText=await page.locator('body').innerText()
      assert.doesNotMatch(homeText,/This work is outside your access|loopback_required/)
      const discovery=await context.request.get(origin+'/api/v1/apps');assert.equal(discovery.status(),200)
      const bases=(await discovery.json()).data.items,baseRegion=page.getByRole('region',{name:'Your bases',exact:true})
      const portfolioReply=await context.request.get(origin+'/api/portfolio'),portfolio=await portfolioReply.json(),{LAUNCH_APP_ID}=await import('../src/apps/launch/contracts.ts')
      for(const base of bases){
        const link=baseRegion.getByRole('link',{name:base.name,exact:true});await link.waitFor();assert.equal(await link.getAttribute('href'),base.entryUrl)
        const summary=await link.evaluate(element=>(element.getAttribute('aria-describedby')??'').split(/\s+/).map(id=>document.getElementById(id)?.textContent??'').join(' '))
        assert.ok(summary.trim(),'Each authorized base has its quiet summary')
        const values=base.id===LAUNCH_APP_ID&&portfolioReply.status()===200?[portfolio.metrics.liveCampaigns,portfolio.metrics.needsAttention]:[base.tableCount,base.recordCount]
        const shownCounts=Array.from(summary.matchAll(/\b\d[\d,]*\b/g),match=>Number(match[0].replaceAll(',',''))).slice(0,2)
        assert.deepEqual(shownCounts,values,'Home summarizes the current authorized read')
      }
      assert.equal(await baseRegion.getByRole('listitem').count(),bases.length,'Home lists every authorized base once')
      assert.equal(await page.getByRole('region',{name:'Portfolio metrics',exact:true}).count(),0,'Home leaves the template dashboard with its base')
      const homeResponse=await context.request.get(origin+'/app')
      assert.equal(homeResponse.status(),200)
      const homeHtml=await homeResponse.text()
      const settings=await context.request.get(origin+'/api/settings');assert.equal(settings.status(),200);const {settings:current}=await settings.json();assert.deepEqual({name:current.workspace.name,timezone:current.workspace.timezone,currency:current.workspace.currency},{name:vars.WORKSPACE_NAME,timezone:vars.WORKSPACE_TIMEZONE,currency:vars.WORKSPACE_CURRENCY},'The installed workspace holds the configured business settings')
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
      assert.equal((await context.request.get(origin+'/auth/session')).status(),200)
      await accessibilityAction(page,page.getByRole('link',{name:'Import a base',exact:true}));await page.getByRole('heading',{name:'Import a base',exact:true}).waitFor();await check('import-base')
      await page.goto(origin+'/app');await page.getByRole('region',{name:'Your bases',exact:true}).waitFor()
      // Home is server-rendered before the drawer's client handler is attached.
      // Finish the same bootstrap required by the other client controls below.
      await page.waitForLoadState('networkidle');await page.waitForFunction(()=>typeof window.__TSR_ROUTER__?.navigate==='function')
      if(viewport.width<=900)await accessibilityAction(page,page.getByRole('button',{name:'Open navigation',exact:true}));await accessibilityAction(page,page.getByRole('navigation',{name:'Operator navigation',exact:true}).getByRole('link',{name:'Records',exact:true}).filter({visible:true}));await page.getByRole('heading',{name:'Records',exact:true}).waitFor();await check('records')
      await verifyIdentityAndRecovery({browser,context,viewport,origin,evidence,accessibilityScreens})
      await verifyExpiredSession({context,page,viewport,origin,evidence,copy})
      // Sign out from the owner menu at the foot of the navigation (the drawer on a phone): the session ends,
      // /app no longer opens signed in and the Lobby offers sign-in again.
      await page.goto(origin+'/app');await page.getByRole('region',{name:'Your bases',exact:true}).waitFor()
      // The owner menu is a client control: let the document finish hydrating before driving it.
      await page.waitForLoadState('networkidle');await page.waitForFunction(()=>typeof window.__TSR_ROUTER__?.navigate==='function')
      // A second tab of the same browser still shows the app when the first signs out.
      const otherTab=await context.newPage();installKeyboardInteractions(otherTab);const otherObservations=browserObservations(otherTab,origin)
      await otherTab.goto(origin+'/app');await otherTab.getByRole('region',{name:'Your bases',exact:true}).waitFor()
      await otherTab.waitForLoadState('networkidle');await otherTab.waitForFunction(()=>typeof window.__TSR_ROUTER__?.navigate==='function')
      await page.bringToFront()
      if(viewport.width<=900)await page.getByRole('button',{name:'Open navigation',exact:true}).click()
      const navigation=viewport.width<=900?page.getByRole('dialog',{name:'Navigation',exact:true}):page.locator('.operator-rail')
      await navigation.locator('button[aria-haspopup="menu"]').focus();await page.keyboard.press('Enter')
      const signOut=page.getByRole('menuitem',{name:'Sign out',exact:true});await signOut.waitFor()
      assert.equal(await signOut.evaluate(item=>item===document.activeElement),true,'Opening the owner menu puts focus on Sign out')
      // A sign-out whose request drops keeps the menu open with an alert, focus on Sign out and the session live;
      // Enter on Sign out tries again once the route answers.
      let abortedSignOut
      await page.route('**/auth/sign-out',route=>{abortedSignOut=route.request();return route.abort('connectionreset')})
      await page.keyboard.press('Enter');await navigation.getByRole('alert').waitFor()
      assert.equal(await signOut.evaluate(item=>item===document.activeElement),true,'A failed sign out keeps the owner menu open with focus on Sign out')
      assert.equal((await context.request.get(origin+'/auth/session')).status(),200,'A failed sign out leaves the session signed in')
      await page.unroute('**/auth/sign-out');await page.keyboard.press('Enter')
      await page.waitForURL(origin+'/');await page.getByRole('link',{name:'Sign in',exact:true}).waitFor()
      assert.equal((await context.request.get(origin+'/auth/session')).status(),401,'Sign out ends the actual owner session')
      const signedOut=await context.request.get(origin+'/app',{maxRedirects:0})
      assert.equal(signedOut.status(),303);assert.equal(new URL(signedOut.headers().location,origin).pathname,'/signin','After sign out /app no longer opens signed in')
      // Sign out in the other tab, over the session that already ended: one request answers 401 and the tab lands on
      // the Lobby as a sign-out that worked does, never on the retry alert.
      await otherTab.bringToFront();otherObservations.assertClean(undefined,'second tab after the first signed out')
      if(viewport.width<=900)await otherTab.getByRole('button',{name:'Open navigation',exact:true}).click()
      const otherNavigation=viewport.width<=900?otherTab.getByRole('dialog',{name:'Navigation',exact:true}):otherTab.locator('.operator-rail')
      await otherNavigation.locator('button[aria-haspopup="menu"]').focus();await otherTab.keyboard.press('Enter')
      await otherTab.getByRole('menuitem',{name:'Sign out',exact:true}).waitFor()
      const endedSignOut=[];otherTab.on('response',response=>{if(['/auth/csrf','/auth/sign-out'].includes(new URL(response.url()).pathname))endedSignOut.push(response.status())})
      await otherTab.keyboard.press('Enter');await otherTab.waitForURL(origin+'/');await otherTab.getByRole('link',{name:'Sign in',exact:true}).waitFor()
      assert.deepEqual(endedSignOut,[401],'Sign out over an ended session sends one request, answered 401, and no retry')
      receipt.viewports.push({...viewport,zeroSetup:true,devOwnerExchange:true,configuredFirstRun:true,recordsFirstHome:true,importFromFirstHome:true,importAndHomeAxeViolations:0,serverRenderedFirstStep:true,renamedIdentity:true,expiredSessionDenied:true,ownerRecovery:true,failedSignOutRetried:true,signedOut:true,endedSessionSignedOut:true,seriousCritical:0,overflow:false,accessibilityScreens,navigationDrawer:receipt.navigationDrawer,browserObservations:observations.assertClean(abortedSignOut)})
      await context.close()
    for(const secret of [vars.SESSION_SECRET,vars.SETUP_TOKEN])assert.equal(installation.output().includes(secret),false,'Local dev must redact secrets')
    await assert.rejects(copy.rer(['reset','--yes','--non-interactive']),error=>error.exitCode===4&&error.errorCode==='safety_refusal','Reset refuses an active app')
    await installation.close()
    phase='completed repeat setup'
    const completed=await bindings(copy.source,async({DB})=>({setup:await DB.prepare('SELECT completed_at FROM cradle_first_run').first(),workspace:await DB.prepare('SELECT * FROM workspace').first(),owner:(await DB.prepare('SELECT id FROM oa_operators').all()).results}))
    assert.ok(completed.setup.completed_at,'Native first-run completion is durable')
    await copy.rer(['setup','--non-interactive'])
    assert.deepEqual(await bindings(copy.source,async({DB})=>({setup:await DB.prepare('SELECT completed_at FROM cradle_first_run').first(),workspace:await DB.prepare('SELECT * FROM workspace').first(),owner:(await DB.prepare('SELECT id FROM oa_operators').all()).results})),completed,'Repeat setup retains completed workspace and owner')
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
      await cp(copy.root,path.join(retained,'installation'),{recursive:true})
      await rm(copy.root,{recursive:true,force:true})
      console.log('Stopped native browser fixture retained privately at '+retained)
    }else await rm(copy.root,{recursive:true,force:true})
  }
}

contract('AUTH-BASE-001 SET-003 HOME-002 VIEW-001 BASE-ACCESS-002 BASE-ACCESS-003 RECORDS-001 RECORDS-005', 'fresh source zero-setup dev identity, configured first run, expired-session recovery, sign-out and signed-in records at both sizes',async()=>{
 const evidence=path.resolve(process.env.CRADLE_LOCAL_EVIDENCE??'tmp/local-signin-evidence')
 const receipt={viewports:[],secretsPrinted:false,realBase:true}
 for(const width of accessibilityWidths){const viewport={width,height:width===390?844:900};receipt.viewports.push(await freshViewport(viewport,evidence))}
 await writeFile(path.join(evidence,'receipt.json'),stringifySafeEvidence(receipt))
})
