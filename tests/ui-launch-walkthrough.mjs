import { recordLaunchConsole, verifyDisabledAiReadout, assertNoUnexpectedLaunchConsoleErrors } from './helpers/launch-disabled-ai-console.mjs'
import { modalKeyboardOrder } from './helpers/accessibility-modal-keyboard.mjs'
import { contract } from './contract.mjs'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { launchAuthorityRuntime, createUlid, LAUNCH_APP_ID, launchEntities } from './helpers/launch-authority-runtime.mjs'
import { settledRow } from './helpers/launch-settled-row.mjs'
import { decisionHydration } from './helpers/launch-decision-hydration.mjs'
import { verifyWorkspaceScreens } from './helpers/launch-workspace-screens.mjs'
import { verifyAutomationMonitorScreens } from './helpers/launch-automation-monitor-screens.mjs'
import { verifyGridViewScreens } from './helpers/launch-grid-view-screens.mjs'
import { verifyPortfolioScreens } from './helpers/launch-portfolio-screens.mjs'
import { verifyNotificationEventScreens } from './helpers/notification-event-screens.mjs'
import { verifyNotificationPreferencesScreens } from './helpers/notification-preferences-screens.mjs'
import { verifyInboxScreens } from './helpers/launch-inbox-screens.mjs'
import { verifyMilestoneScreens } from './helpers/launch-milestone-screens.mjs'
import { verifyConcurrencyScreens } from './helpers/launch-concurrency-screens.mjs'
import { verifyCurrentLensScreens } from './helpers/launch-current-lens-screens.mjs'
import { verifyCommentScreens } from './helpers/launch-comment-screens.mjs'
import { verifyDecisionLensScreens } from './helpers/launch-decision-lens-screens.mjs'
import { verifySettingsMemberErasure } from './helpers/settings-members-accessibility.mjs'
import { stringifySafeEvidence } from './helpers/accessibility-redaction.mjs'
import { accessibilityAction, accessibilityCaptureOnly, accessibilityContextOptions, accessibilityEvidence, accessibilitySetChecked, accessibilityWidths, auditAccessibility, verifyNavigationDrawerWithKeyboard } from './helpers/accessibility-evidence.mjs'
contract('VIEW-004', '[NOTIFY-006] [NOTIFY-007] [OPS-006] [OPS-003] [CAMP-006] [NOTIFY-005] [VIEW-006] [LENS-005] [ACT-002] [ACT-004] [MILE-002] [MILE-006] [DEC-008] [LENS-002] [LENS-003] [DELIV-003] [CAMP-004] [CAMP-012] [VIEW-002] [CAMP-001] [CAMP-002] [CAMP-005] [RISK-003] [DEC-002] [DEC-003] [ACT-001] [ACT-003] [BASE-PUBLIC-003] [AUTO-006] [CAMP-007] Launch walkthrough E10–E17 at desktop and phone', async () => {
const output=path.resolve(process.env.CRADLE_LAUNCH_EVIDENCE ?? '../evidence/de-launch')
const h=await launchAuthorityRuntime({}, {installedLaunchDefinitions:true,installationOwner:true})
const receipt={environment:'Actual emitted Worker and native D1, synthetic test fixtures only',screens:[],inspectorChecks:[],decisionHydration:[],errors:[],consoleEvents:[],consoleErrors:[],expectedConsoleErrors:[],unexpectedConsoleErrors:[],external:[],clauses:['VIEW-002','CAMP-001','CAMP-002','CAMP-005','VIEW-004','RISK-003','DEC-002','ACT-001','ACT-003','BASE-PUBLIC-003','AUTO-006','CAMP-007']}
let browser
const command=async(action,input,expected=[])=>{
 const response=await h.request(h.ownerSession,`/api/v1/commands/launch.${action}`,{method:'POST',body:JSON.stringify({commandId:createUlid(),input,expected})})
 assert.equal(response.status,200,await response.clone().text());return (await response.json())
}
const readInspectorPresentation=async(page)=>page.locator('.portfolio-inspector').evaluate((inspector)=>{
 const surface=getComputedStyle(inspector)
 const channels=surface.backgroundColor.match(/[\d.]+/g)?.map(Number)??[]
 const backgroundAlpha=channels.length===4?channels[3]:1
 let ancestorOpacity=1
 for(let element=inspector;element;element=element.parentElement)ancestorOpacity*=Number(getComputedStyle(element).opacity)

 const sections=['header','.portfolio-inspector-status','dl','.portfolio-health','.operator-button']
  .map(selector=>[selector,inspector.querySelector(selector)])
  .filter(([,element])=>element?.getClientRects().length)
  .map(([name,element])=>({name,...element.getBoundingClientRect().toJSON()}))
 const sectionOverlaps=[]
 for(let left=0;left<sections.length;left++)for(let right=left+1;right<sections.length;right++){
  const a=sections[left],b=sections[right]
  if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)sectionOverlaps.push([a.name,b.name])
 }

 const card=document.querySelector('.portfolio-campaign-cards > li.is-selected')
 const inspectorBox=inspector.getBoundingClientRect()
 const underlayText=[]
 if(card)for(const element of card.querySelectorAll('a,p,span,button,small,strong')){
  if(!element.innerText?.trim())continue
  for(const rect of element.getClientRects()){
   const left=Math.max(rect.left,inspectorBox.left),right=Math.min(rect.right,inspectorBox.right)
   const top=Math.max(rect.top,inspectorBox.top),bottom=Math.min(rect.bottom,inspectorBox.bottom)
   if(right-left<=1||bottom-top<=1)continue
   const hit=document.elementFromPoint((left+right)/2,(top+bottom)/2)
   underlayText.push(hit===inspector||inspector.contains(hit))
  }
 }
 return {
  backgroundColor:surface.backgroundColor,
  effectiveAlpha:backgroundAlpha*ancestorOpacity,
  sectionOverlaps,
  underlayTextSamples:underlayText.length,
  underlayTextUncovered:underlayText.filter(covered=>!covered).length,
 }
})
try {
 await mkdir(output,{recursive:true})
 const criticalAutomation=await h.db.prepare("SELECT id,version FROM automations WHERE shipped_key='critical-risk'").first()
 await command('automation.disable',{id:criticalAutomation.id},[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities.automation,recordId:criticalAutomation.id},version:criticalAutomation.version}])
 assert.equal((await h.db.prepare('SELECT enabled FROM automations WHERE id=?').bind(criticalAutomation.id).first()).enabled,0,'Manual escalation walkthrough disables only the shipped critical-risk automation through its command')
 await h.db.prepare('UPDATE operators SET name=? WHERE id=?').bind('Mira Example',h.owner).run()
 await h.db.batch([h.db.prepare('UPDATE workspace_settings SET timezone=?').bind('Australia/Brisbane'),h.db.prepare('UPDATE workspace SET timezone=?').bind('Australia/Brisbane')])
 const workspaceName=(await h.db.prepare('SELECT name FROM workspace WHERE id=?').bind('workspace').first()).name
 browser=await chromium.launch({headless:true,args:["--use-mock-keychain","--password-store=basic"]})
 for(const width of accessibilityWidths) {
  // Each viewport starts with an empty campaign fixture, including after the added clause journeys.
  await h.db.prepare('DELETE FROM campaigns').run()
  const viewport={width,height:width===390?844:900}
  const context=await browser.newContext(accessibilityContextOptions({viewport})),page=await context.newPage()
  const action=target=>accessibilityAction(page,target)
  const setChecked=(target,checked=true)=>accessibilitySetChecked(page,target,checked)
  page.on('pageerror',error=>receipt.errors.push(error.message))
  recordLaunchConsole(page,receipt,viewport.width)
  page.on('request',request=>{if(new URL(request.url()).origin!==h.origin)receipt.external.push(new URL(request.url()).origin)})
  await context.addCookies([{name: h.ownerSession.cookie.split('=')[0], value: h.ownerSession.cookie.slice(h.ownerSession.cookie.indexOf('=')+1),url:h.origin}])
  const capture=async(name,options={})=>{
   await page.waitForLoadState('networkidle');await page.evaluate(()=>window.scrollTo(0,0))
   if(!accessibilityCaptureOnly)assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} page overflow`)
   let evidence,violations
   if(accessibilityEvidence){
    evidence=await auditAccessibility(page,{screen:name,width:viewport.width,output,...options})
    violations=[...evidence.axe.wcag22aa,...evidence.axe.targetSize].filter(v=>['serious','critical'].includes(v.impact))
    if(!accessibilityCaptureOnly){
     assert.deepEqual(violations.map(v=>v.id),[],`${name} WCAG 2.2 AA and target-size serious/critical accessibility`)
     assert.equal(evidence.layout.pageOverflow,false,`${name} page overflow`)
    }
   }else{
    violations=(await new AxeBuilder({page}).analyze()).violations.filter(v=>['serious','critical'].includes(v.impact))
    if(violations.length){await writeFile(path.join(output,`axe-failure-${name}-${viewport.width}.json`),stringifySafeEvidence(violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))));await page.screenshot({path:path.join(output,`failed-${name}-${viewport.width}.png`),fullPage:true})}
    assert.deepEqual(violations.map(v=>v.id),[],`${name} accessibility`)
   }
   if(viewport.width===1440){const footer=page.locator('.operator-rail .operator-rail-footer');assert.ok(await footer.evaluate(el=>{const box=el.getBoundingClientRect();return box.top>=0&&box.bottom<=innerHeight&&box.height>0}),'Full owner row visible');assert.equal(await footer.locator('strong').innerText(),'Mira Example');assert.equal(await footer.locator('small').innerText(),workspaceName,'Workspace identity visible')}
   const file=accessibilityEvidence?`a11y-${name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-${viewport.width}.png`:`${name}-${viewport.width}.png`
   if(!accessibilityEvidence)await page.screenshot({path:path.join(output,file),fullPage:true})
   receipt.screens.push({file,viewport,overflow:false,seriousCritical:0,...(evidence?{wcagViolationCount:evidence.axe.wcag22aa.length,targetSizeViolationCount:evidence.axe.targetSize.length,smallTargetCount:evidence.layout.targetsBelow24.length,controls:evidence.layout.controls.length,tabOrderComplete:evidence.keyboard?.missing?.length===0,tabbableCount:evidence.keyboard?.tabbableCount??null}: {})})
  }
  await verifyGridViewScreens({h,page,command,capture})
  await verifyPortfolioScreens({h,page,command,capture})
  await page.goto(`${h.origin}/app/campaigns`)
  await page.getByRole('heading',{name:'No campaigns yet',exact:true}).waitFor()
  await capture('campaign-grid-before')
  if(accessibilityEvidence&&!accessibilityCaptureOnly&&viewport.width===768)receipt.navigationDrawer=await verifyNavigationDrawerWithKeyboard(page,{output,screen:'launch-navigation-drawer'})
  if(viewport.width===390){const sort=page.getByLabel('Sort',{exact:true});assert.ok(await sort.evaluate(el=>el.getBoundingClientRect().right<=innerWidth));assert.equal(await page.locator('.portfolio-grid-filters').evaluate(el=>el.scrollWidth>el.clientWidth),false)}
  await action(page.getByRole('button',{name:'New campaign',exact:true}));await page.getByLabel('Campaign name',{exact:true}).fill('Cancelled draft');await action(page.getByRole('button',{name:'Cancel',exact:true}));await page.getByRole('heading',{name:'No campaigns yet',exact:true}).waitFor();assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM campaigns').first()).n,0);await action(page.getByRole('button',{name:'New campaign',exact:true}));assert.equal(await page.getByLabel('Campaign name',{exact:true}).inputValue(),'')
  await page.getByLabel('Phase',{exact:true}).selectOption('Planning');await page.getByLabel('Status',{exact:true}).selectOption('On track')
  if(viewport.width===1440)for(const name of ['Create campaign','Cancel'])assert.ok(await page.getByRole('button',{name,exact:true}).evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight),`${name} visible`)
  // React mounts this form after New campaign and the owner list loads after it, moving the rows below.
  // Wait for both, then read both date boxes in one frame without changing the compact-row assertion.
  if(viewport.width===390) {await page.getByLabel('Owner',{exact:true}).waitFor();await settledRow(page,page.getByLabel('Start date',{exact:true}),page.getByLabel('Launch date',{exact:true}));const [dates,launch]=await page.evaluate(fields=>fields.map(field=>field.getBoundingClientRect().y),[await page.getByLabel('Start date',{exact:true}).elementHandle(),await page.getByLabel('Launch date',{exact:true}).elementHandle()]);assert.equal(dates,launch,'Phone dates share a compact row')}
  await capture('campaign-form')
  if(viewport.width===1440) {
   try {
    await page.setViewportSize({width:1024,height:900})
    const bounds=await page.locator('.launch-create-form').evaluate(el=>{const box=el.getBoundingClientRect();return {left:box.left,right:box.right,width:box.width,contentOverflow:el.scrollWidth>el.clientWidth,pageOverflow:document.documentElement.scrollWidth>innerWidth}})
    assert.ok(bounds.left>=0&&bounds.right<=1024,'Campaign form fits the intermediate desktop viewport')
    assert.equal(bounds.contentOverflow,false,'Campaign form content fits at 1024px')
    assert.equal(bounds.pageOverflow,false,'Campaign form page fits at 1024px')
    const file='campaign-form-1024.png';await page.screenshot({path:path.join(output,file),fullPage:true})
    receipt.responsiveChecks=[{file,viewport:{width:1024,height:900},...bounds}]
   } finally {await page.setViewportSize(viewport)}
  }
  for(const [label,value] of [['Campaign name',`Walkthrough ${viewport.width}`],['Campaign code',`WALK-${viewport.width}`],['Start date','2026-10-01'],['Launch date','2026-10-20'],['Manually reported health (%)','65'],['Budget (USD)','1000.00'],['Spend so far (USD)','125.00']])await page.getByLabel(label,{exact:true}).fill(value)
  await page.getByLabel('Owner',{exact:true}).selectOption(h.owner)
  await action(page.getByRole('button',{name:'Create campaign',exact:true}));await page.getByRole('button',{name:'New campaign',exact:true}).waitFor()
  const visible=page.locator('.portfolio-campaign-table tbody, .portfolio-campaign-cards').filter({visible:true});await visible.getByText(`Walkthrough ${viewport.width}`,{exact:true}).waitFor();assert.ok((await visible.innerText()).includes(`WALK-${viewport.width}`),'Created campaign and code visible');assert.equal(await page.locator('.portfolio-inspector-placeholder').count(),0)
  assert.equal(await page.locator('.portfolio-pill').filter({hasText:/^None$/}).count(),0)
  await capture('campaign-populated')
  const inspectorStateBefore=await h.db.prepare('SELECT status,health,owner_id FROM campaigns WHERE code=?').bind(`WALK-${viewport.width}`).first()
  const openInspector=async()=>{
   await action(visible.getByRole('button',{name:new RegExp(`^Inspect(?: Walkthrough ${viewport.width})?$`)}))
   const inspector=page.locator('.portfolio-inspector')
   await inspector.getByRole('heading',{name:`Walkthrough ${viewport.width}`,exact:true}).waitFor()
   await inspector.getByText(`WALK-${viewport.width}`,{exact:true}).waitFor()
   if(await page.evaluate(()=>matchMedia('(max-width: 767px)').matches))await page.locator('dialog.portfolio-inspector:modal').waitFor()
   assert.equal(await inspector.getByText('On track',{exact:true}).count(),1,'Selected campaign status is visible')
   assert.equal(await inspector.getByText('Mira Example',{exact:true}).count(),1,'Selected campaign owner is visible')
  }
  await openInspector()
  const inspectorPresentation=await readInspectorPresentation(page)
  assert.equal(inspectorPresentation.effectiveAlpha,1,`Selected campaign inspector is opaque (${inspectorPresentation.backgroundColor})`)
  assert.deepEqual(inspectorPresentation.sectionOverlaps,[],'Campaign inspector sections remain readable without overlap')
  if(viewport.width===390){assert.ok(inspectorPresentation.underlayTextSamples>0,'Selected phone inspector covers campaign-card text beneath its sheet');assert.equal(inspectorPresentation.underlayTextUncovered,0,'Campaign-card text beneath the phone inspector is fully obscured by its opaque surface')}
  receipt.inspectorChecks.push({viewport,backgroundColor:inspectorPresentation.backgroundColor,effectiveAlpha:inspectorPresentation.effectiveAlpha,sectionOverlaps:inspectorPresentation.sectionOverlaps,underlayTextSamples:inspectorPresentation.underlayTextSamples,underlayTextUncovered:inspectorPresentation.underlayTextUncovered})
  const modalInspector=page.locator('dialog.portfolio-inspector')
  const phoneInspector=await modalInspector.count()>0
  if(phoneInspector)await modalInspector.evaluate(dialog=>{if(!dialog.matches(':modal'))throw new Error('Phone inspector must be a native modal')})
  await capture('campaign-selected-inspector',phoneInspector?{keyboardAudit:modalKeyboardOrder}:{})
  const inspectorTrigger=visible.getByRole('button',{name:new RegExp(`^Inspect(?: Walkthrough ${viewport.width})?$`)})
  if(phoneInspector){await page.keyboard.press('Escape');assert.equal(await page.locator('.portfolio-inspector').count(),0,'Escape closes the phone inspector');assert.equal(await inspectorTrigger.evaluate(button=>button===document.activeElement),true,'Escape returns focus to the exact Inspect button');await openInspector()}
  await action(page.getByRole('button',{name:'Close campaign inspector',exact:true}))
  assert.equal(await page.locator('.portfolio-inspector').count(),0,'Campaign inspector closes')
  if(phoneInspector)assert.equal(await inspectorTrigger.evaluate(button=>button===document.activeElement),true,'Close returns focus to the exact Inspect button')
  await openInspector()
  await action(page.getByRole('button',{name:'Close campaign inspector',exact:true}))
  assert.equal(await page.locator('.portfolio-inspector').count(),0,'Campaign inspector closes after reopening')
  if(phoneInspector){assert.equal(await inspectorTrigger.evaluate(button=>button===document.activeElement),true,'Reopened Close returns focus to the exact Inspect button');receipt.inspectorChecks.at(-1).keyboardModal={escapeClosed:true,escapeReturnedFocus:true,closeReturnedFocus:true,reopenedCloseReturnedFocus:true}}
  assert.deepEqual(await h.db.prepare('SELECT status,health,owner_id FROM campaigns WHERE code=?').bind(`WALK-${viewport.width}`).first(),inspectorStateBefore,'Opening and closing the campaign inspector preserves campaign state')
  await page.getByLabel('Phase',{exact:true}).selectOption('Build');await page.getByRole('heading',{name:'No campaigns match this view',exact:true}).waitFor();await capture('campaign-filter-hidden')
  const campaign=await h.db.prepare('SELECT * FROM campaigns WHERE code=?').bind(`WALK-${viewport.width}`).first()
  await page.goto(`${h.origin}/app/campaigns/${campaign.id}`)
  await page.getByRole('button',{name:'Add deliverable',exact:true}).waitFor();await page.getByRole('button',{name:'Add milestone',exact:true}).waitFor();if(viewport.width===390){const title=await page.locator('.operator-page-header h1').boundingBox(),actions=await page.locator('.operator-page-actions').boundingBox();assert.ok(title.y+title.height<=actions.y,'Phone title has its own line')}await capture('campaign-empty-work')
  await action(page.getByRole('button',{name:'Add deliverable',exact:true}));await page.getByLabel('Title',{exact:true}).fill('Launch kit');await page.getByLabel('Owner',{exact:true}).selectOption(h.owner);await action(page.getByRole('button',{name:'Save deliverable',exact:true}));await page.getByText('Launch kit',{exact:true}).first().waitFor()
  for(const [title,startDate,endDate] of [['Review package','2026-10-18','2026-10-21'],['Release package','2026-11-03',null],['Cross-month review','2026-10-29','2026-11-04']]) {
   const summary=page.getByText('Add or edit milestones',{exact:true});if(!(await summary.evaluate(el=>el.parentElement.open)))await action(summary)
   await action(page.getByRole('button',{name:'Add milestone',exact:true}));await page.getByLabel('Title',{exact:true}).fill(title);await page.getByLabel('Owner',{exact:true}).selectOption(h.owner);await page.getByLabel('Type',{exact:true}).selectOption('Review');await page.getByLabel('Status',{exact:true}).selectOption('Not started');await page.getByLabel('Start date',{exact:true}).fill(startDate);if(endDate)await page.getByLabel('End date',{exact:true}).fill(endDate);await capture(`milestone-form-${title.split(' ')[0].toLowerCase()}`);await action(page.getByRole('button',{name:'Save milestone',exact:true}));await page.getByText(title,{exact:true}).first().waitFor()
  }
  const crossing=await h.db.prepare('SELECT id,version FROM milestones WHERE title=? AND campaign_id=?').bind('Cross-month review',campaign.id).first(),point=await h.db.prepare('SELECT id FROM milestones WHERE title=? AND campaign_id=?').bind('Release package',campaign.id).first()
  await command('milestone.set-predecessors',{id:crossing.id,predecessorIds:[point.id]},[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities.milestone,recordId:crossing.id},version:crossing.version}])
  await action(page.getByText('Open risks',{exact:true}));await action(page.getByRole('button',{name:'Add risk',exact:true}));await page.getByLabel('Title',{exact:true}).fill('Supplier delay');await page.getByLabel('Owner',{exact:true}).selectOption(h.owner);await page.getByLabel('Severity',{exact:true}).selectOption('Critical');await page.getByLabel('Current signal',{exact:true}).fill('Parts are late');await page.getByLabel('Mitigation',{exact:true}).fill('Review supplier');await page.getByLabel('Due date',{exact:true}).fill('2026-10-20');await capture('risk-create-form');await action(page.getByRole('button',{name:'Save risk',exact:true}));await page.getByText('Supplier delay',{exact:true}).first().waitFor()
  await page.reload();await page.getByText('Critical risk',{exact:true}).waitFor();await capture('campaign-with-risk')
  assert.equal((await h.db.prepare('SELECT status,health FROM campaigns WHERE id=?').bind(campaign.id).first()).status,'On track')
  await page.goto(`${h.origin}/app/lenses/timeline`);await page.locator('#timeline-title').waitFor();assert.ok((await page.locator('body').innerText()).includes('Oct 18, 2026'));assert.ok((await page.locator('body').innerText()).includes('Nov 3, 2026'));const calendarShown=await page.getByLabel('Dates in Oct 2026',{exact:true}).isVisible();if(calendarShown)assert.ok(await page.locator('small[aria-label^="Dates in"]').filter({visible:true}).count()>=2,'Timeline has dates within both months');await capture('timeline-two-months');
  if(calendarShown){
   for(const month of ['Oct 2026','Nov 2026'])assert.deepEqual(await page.getByLabel(`Dates in ${month}`,{exact:true}).locator('span').allTextContents(),['1','8','15','22','29'],'Each month displays its date markers')
   const range=page.getByLabel('Cross-month review, Oct 29, 2026 through Nov 4, 2026',{exact:true});assert.ok((await range.innerText()).includes('Oct 29, 2026 – Nov 4, 2026'));assert.equal(await range.getByLabel('Dependency conflict',{exact:true}).count(),1)
  } else {
   const range=page.getByLabel('Milestone agenda',{exact:true}).getByRole('article').filter({has:page.getByRole('link',{name:'Cross-month review',exact:true})});assert.equal(await range.locator('time').getAttribute('datetime'),'2026-10-29');assert.equal(await range.locator('time').innerText(),'Oct 29, 2026');assert.ok((await range.innerText()).includes('ends Nov 4, 2026'));assert.equal(await range.getByText('Dependency conflict',{exact:true}).count(),1)
  }
  const milestoneLinks=()=>page.locator('a[href^="/app/milestones/"]').filter({visible:true}).evaluateAll(links=>links.map(link=>link.getAttribute('href')).sort())
  const monthItems=await milestoneLinks()
  assert.ok(monthItems.includes(`/app/milestones/${crossing.id}`));assert.ok(monthItems.includes(`/app/milestones/${point.id}`))
  assert.ok(await page.locator(`a[href="/app/campaigns/${campaign.id}"]`).filter({visible:true}).count(),'Every timeline item links to its campaign at this width')
  await action(page.getByRole('button',{name:'Quarter',exact:true}));assert.deepEqual(await milestoneLinks(),monthItems,'Scale changes preserve the milestone set')
  if(calendarShown)await page.getByLabel('Dates in Q4 2026',{exact:true}).waitFor()
  await capture('timeline-quarter');await action(page.getByRole('button',{name:'Month',exact:true}));assert.deepEqual(await milestoneLinks(),monthItems)
  await capture('timeline-cross-month-range');
  await page.goto(`${h.origin}/app/milestones/${crossing.id}`);await page.getByRole('heading',{name:'Cross-month review',exact:true}).waitFor();assert.equal(await page.locator('time[datetime="2026-10-29"]').innerText(),'Oct 29, 2026');assert.equal(await page.locator('time[datetime="2026-11-04"]').innerText(),'Nov 4, 2026');await page.getByText(/Dependency conflict:/).waitFor();await capture('milestone-cross-month-range');
  const review=await h.db.prepare('SELECT id FROM milestones WHERE title=? AND campaign_id=?').bind('Review package',campaign.id).first();await page.goto(`${h.origin}/app/milestones/${review.id}`);await page.getByRole('heading',{name:'Review package',exact:true}).waitFor();const milestoneText=await page.locator('body').innerText();assert.ok(milestoneText.includes('Oct 18, 2026'));assert.ok(milestoneText.includes('Oct 21, 2026'));assert.doesNotMatch(milestoneText,/2026-10-18|2026-10-21/);await capture('milestone-human-range')
  const risk=await h.db.prepare('SELECT id FROM risks WHERE campaign_id=?').bind(campaign.id).first()
  const priorCreated=await command('decision.create',{fields:{campaignId:campaign.id,riskId:risk.id,supersedesId:null,title:'Earlier supplier review',requesterId:h.owner,assigneeId:h.owner,priority:'High',dueAt:'2026-10-20T15:00:00.000Z',recommendation:'Ask supplier for evidence',impact:'Delivery date',}})
  const prior={id:priorCreated.data.value.id};await page.goto(`${h.origin}/app/decisions/${prior.id}`);await page.getByRole('heading',{name:'Earlier supplier review',exact:true}).waitFor();await page.getByText('Recommendation',{exact:true}).waitFor();await page.getByText('Ask supplier for evidence',{exact:true}).waitFor();await page.getByLabel('Outcome',{exact:true}).selectOption('Cancelled');assert.equal(await page.getByRole('button',{name:'Record cancelled',exact:true}).isEnabled(),false);await page.getByLabel('Outcome',{exact:true}).selectOption('Rejected');await page.getByLabel('Rationale',{exact:false}).fill('Need current evidence');await action(page.getByRole('button',{name:'Record rejected',exact:true}));await page.getByRole('link',{name:'Open recorded decision',exact:true}).waitFor();await page.reload();await page.getByText(/Recorded outcome: Rejected/).waitFor();assert.ok((await page.locator('body').innerText()).includes('Need current evidence'));await capture('decision-rejected-rationale')
  await page.goto(`${h.origin}/app/lenses/risks`);await page.getByText('1 matching risk',{exact:true}).waitFor();await page.getByRole('heading',{name:'Risk readout',exact:true}).waitFor();const readout=page.getByRole('button',{name:'Request risk readout',exact:true});assert.equal(await readout.isVisible(),true);assert.equal(await readout.isEnabled(),true);const aiSettings=page.getByRole('link',{name:'AI settings',exact:true});assert.equal(await aiSettings.isVisible(),true);assert.equal(await aiSettings.getAttribute('href'),'/app/settings#ai');await capture('risk-lens-singular')
  await verifyDisabledAiReadout({page,runtime:h,receipt,width:viewport.width,action,readout});await capture('risk-readout-disabled')
  await page.goto(`${h.origin}/app/risks/${risk.id}`);await page.getByRole('heading',{name:'Supplier delay',exact:true}).waitFor();assert.ok((await page.locator('body').innerText()).includes('Oct 20, 2026'));assert.equal((await page.locator('[aria-labelledby="risk-title"]>section').first().innerText()).split('Owned by Mira Example').length-1,1,'Risk owner is labelled once');assert.equal((await page.locator('[aria-labelledby="risk-title"]>section').first().innerText()).split('Mira Example').length-1,1);await capture('risk-detail')
  await page.getByLabel('Reason',{exact:true}).fill('Owner review needed');await action(page.getByRole('button',{name:'Escalate risk',exact:true}));await page.getByRole('status').waitFor();const decision=await h.db.prepare("SELECT id FROM decisions WHERE risk_id=? AND state='Awaiting approval'").bind(risk.id).first();assert.notEqual(decision.id,prior.id);assert.equal(await page.getByRole('link',{name:/Open decision:/}).getAttribute('href'),`/app/decisions/${decision.id}`);await capture('risk-escalated');await page.reload();await page.getByRole('link',{name:/Linked decision:/}).waitFor();assert.equal(await page.getByRole('link',{name:/Linked decision:/}).getAttribute('href'),`/app/decisions/${decision.id}`)
  await page.goto(`${h.origin}/app/decisions/${decision.id}`);await page.getByRole('heading',{name:/Resolve Critical risk:/}).waitFor();assert.equal(await page.getByLabel('Outcome',{exact:true}).inputValue(),'');assert.ok(!(await page.locator('body').innerText()).match(/\d{4}-\d{2}-\d{2}T/));await page.getByText('Escalation reason',{exact:true}).waitFor();await page.getByText('Owner review needed',{exact:true}).waitFor();await page.getByText('Parts are late',{exact:true}).waitFor();const due=(await h.db.prepare('SELECT due_at FROM decisions WHERE id=?').bind(decision.id).first()).due_at;const formatted=new Intl.DateTimeFormat('en-US',{timeZone:'Australia/Brisbane',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(due));assert.ok((await page.locator('body').innerText()).includes(formatted));await capture('decision-explicit-choice');
  const recommendationVersion=(await h.db.prepare('SELECT version FROM decisions WHERE id=?').bind(decision.id).first()).version
  await command('decision.patch',{id:decision.id,changes:{recommendation:'Approve alternate supplier'}},[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities.decision,recordId:decision.id},version:recommendationVersion}])
  await page.reload();await page.getByText('Escalation reason',{exact:true}).waitFor();await page.getByText('Owner review needed',{exact:true}).waitFor();await page.getByText('Recommendation',{exact:true}).waitFor();await page.getByText('Approve alternate supplier',{exact:true}).waitFor();await capture('decision-independent-recommendation');
  await page.goto(`${h.origin}/app/campaigns/${campaign.id}`);await page.getByText('Resolve Critical risk: Supplier delay',{exact:true}).waitFor();assert.ok((await page.locator('body').innerText()).includes(formatted));await capture('campaign-unresolved-decision');await page.goto(`${h.origin}/app/decisions/${decision.id}`);await page.getByLabel('Outcome',{exact:true}).waitFor();receipt.decisionHydration.push({viewport:viewport.width,...await decisionHydration(page)})
  await page.getByLabel('Outcome',{exact:true}).selectOption('Rejected');assert.equal(await page.getByRole('button',{name:'Record rejected',exact:true}).isEnabled(),false)
  await page.getByLabel('Outcome',{exact:true}).selectOption('Approved');await action(page.getByRole('button',{name:'Record approved',exact:true}));await page.getByRole('link',{name:'Open recorded decision',exact:true}).waitFor()
  // Confirmation precedes the authoritative detail refresh; compare CSS only once that detail is rendered.
  await page.getByText(/Recorded outcome: Approved/).waitFor();await capture('decision-confirmed')
  await page.reload();await page.getByText(/Recorded outcome: Approved/).waitFor();await capture('decision-reopened')
  const reescalateVersion=(await h.db.prepare('SELECT version FROM risks WHERE id=?').bind(risk.id).first()).version
  await command('risk.escalate',{id:risk.id,reason:'A second owner review'},[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities.risk,recordId:risk.id},version:reescalateVersion}])
  const historical=await (await h.request(h.ownerSession,`/api/decisions/${decision.id}`)).json();assert.equal(historical.decision.escalationReason,'Owner review needed','Earlier decision retains its original escalation reason')
  const secondDecision=await h.db.prepare("SELECT id,version FROM decisions WHERE risk_id=? AND state='Awaiting approval'").bind(risk.id).first()
  await command('decision.outcome',{id:secondDecision.id,outcome:'Cancelled',rationale:'Review is complete'},[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities.decision,recordId:secondDecision.id},version:secondDecision.version}])
  await command('risk.create',{fields:{campaignId:campaign.id,title:'Packaging review',ownerId:h.owner,severity:'High',signal:'Packaging needs review',mitigation:'Owner review',dueDate:'2026-10-19'}})
  const high=await h.db.prepare('SELECT id FROM risks WHERE title=? AND campaign_id=?').bind('Packaging review',campaign.id).first()
  const highDecisionCreated=await command('decision.create',{fields:{campaignId:campaign.id,riskId:high.id,supersedesId:null,title:'Earlier packaging decision',requesterId:h.owner,assigneeId:h.owner,priority:'High',dueAt:'2026-10-20T15:00:00.000Z',recommendation:'Review packaging',impact:'Package quality'}})
  const highDecision=await h.db.prepare('SELECT id,version FROM decisions WHERE id=?').bind(highDecisionCreated.data.value.id).first()
  await command('decision.outcome',{id:highDecision.id,outcome:'Approved',rationale:''},[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities.decision,recordId:highDecision.id},version:highDecision.version}])
  await page.goto(`${h.origin}/app/lenses/risks`);await page.getByText('2 matching risks',{exact:true}).waitFor();const card=page.locator('article').filter({has:page.getByRole('link',{name:'Packaging review',exact:true})});const escalate=card.getByRole('button',{name:'Escalate',exact:true});await expect(escalate).toBeEnabled();await action(escalate);await card.getByLabel('Escalation reason',{exact:true}).fill('Please review packaging');await capture('risk-lens-escalation-form');await action(card.getByRole('button',{name:'Confirm escalation',exact:true}));await page.getByRole('status').getByText('No decision was created under the current policy.',{exact:false}).waitFor();await capture('risk-lens-confirmed');const packaging=await h.db.prepare('SELECT id,version,state FROM risks WHERE title=? AND campaign_id=?').bind('Packaging review',campaign.id).first();assert.equal(packaging.state,'Escalated');assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM decisions WHERE risk_id=?').bind(packaging.id).first()).n,1,'Escalation did not create a new decision or relabel the earlier terminal decision');await command('risk.resolve',{id:packaging.id,resolutionNote:'Owner confirmed packaging'},[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities.risk,recordId:packaging.id},version:packaging.version}])
  await page.goto(`${h.origin}/app/campaigns/${campaign.id}`);await action(page.getByText('Activity',{exact:true}));const history=await page.locator('.portfolio-activity-list').innerText();assert.ok(history.includes('Mira Example'));assert.ok(history.includes('approved decision'));assert.ok(history.includes('escalated risk'));assert.doesNotMatch(history,/decision\.updated|outcome_by_id/);await capture('campaign-human-actions');const historySummaries=page.locator('.portfolio-activity-list details summary');for(let index=0;index<await historySummaries.count();index++){const summary=historySummaries.nth(index);if(!(await summary.evaluate(element=>element.parentElement.open)))await action(summary)}assert.doesNotMatch(await page.locator('.portfolio-activity-list').innerText(),/\d{4}-\d{2}-\d{2}T|2026-10-20/);await capture('campaign-human-history')
  const before=await h.db.prepare('SELECT version FROM risks WHERE id=?').bind(risk.id).first();await command('risk.resolve',{id:risk.id,resolutionNote:'Supplier confirmed delivery'},[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities.risk,recordId:risk.id},version:before.version}]);await page.reload();assert.equal(await page.getByText('Critical risk',{exact:true}).count(),0);const stored=await h.db.prepare('SELECT status,health FROM campaigns WHERE id=?').bind(campaign.id).first();assert.equal(stored.status,'On track');assert.equal(stored.health,65);await capture('campaign-risk-resolved')
  await verifyAutomationMonitorScreens({h,page,command,capture})
  for (const [name,route] of [['home','/app'],['overview','/app/overview'],['settings','/app/settings'],['new-lens','/app/lenses/new'],['empty-decision-queue','/app/decisions'],['notifications','/app/notifications']]) {await page.goto(`${h.origin}${route}`);await capture(name)}
  receipt.memberErasure ??= []
  receipt.memberErasure.push(await verifySettingsMemberErasure({ runtime: h, page, width: viewport.width, action, capture }))
  await h.db.prepare('DELETE FROM campaigns WHERE id=?').bind(campaign.id).run()
  await verifyNotificationPreferencesScreens({h,page,command,capture})
  await verifyNotificationEventScreens({h,page,command,capture})
  await verifyInboxScreens({h,page,command,capture})
  await verifyWorkspaceScreens({h,page,command,capture})
  await verifyMilestoneScreens({h,page,command,capture})
  await verifyDecisionLensScreens({h,page,command,capture})
  await verifyCommentScreens({h,page,command,capture})
  await verifyCurrentLensScreens({h,page,command,capture})
  receipt.expectedConflictConsoleErrors ??= []
  await verifyConcurrencyScreens({h,page,command,capture,receipt})
  await context.close()
 }
 assert.deepEqual(receipt.decisionHydration.map(check=>check.viewport),accessibilityWidths,'Decision hydration checked at every requested width');assert.deepEqual(receipt.inspectorChecks.map(check=>check.viewport.width),accessibilityWidths,'Inspector presentation checked at every requested width');assert.deepEqual(receipt.memberErasure.map(check=>check.width),accessibilityWidths,'Member erasure checked at every requested width');assert.deepEqual(receipt.errors,[]);assertNoUnexpectedLaunchConsoleErrors(receipt,accessibilityWidths);assert.deepEqual(receipt.external,[])
} finally {if(browser)await browser.close();await h.close();await writeFile(path.join(output,'receipt.json'),stringifySafeEvidence(receipt))}
console.log(`Launch walkthrough passed ${receipt.screens.length} real-runtime screens`)

})
