import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {chromium,expect} from '@playwright/test'
import {setup,campaign} from './helpers/launch-installed.mjs'
import {usageReceipts,usageClock,providerPause,assertUsageCalls,usageTotals} from './helpers/launch-usage-proof.mjs'

test('[AI-001 AI-002 AI-003 AI-005 SET-002] existing campaign, risks, lens builder and settings controls expose real immutable results and errors',async()=>{
 let mode='valid',calls=0,browser
 const receipts=[],proofs=[],clock=usageClock()
 const h=await setup({hostname:'localhost',automaticQueues:false,configuration:{AI_PROVIDER_API_KEY:'synthetic-cradle-1',AI_MODEL:'synthetic-cradle-2'},providerFetch:async request=>{
  assert.equal(request.url,'https://api.openai.com/v1/responses');calls++;const body=await request.json(),feature=JSON.parse(body.input[0].content[0].text).feature
  const receipt=mode==='refuse'?{model:'synthetic-cradle-2',inputTokens:null,outputTokens:null}:usageReceipts[feature]
  receipts.push({...receipt,edge:await providerPause()})
  if(mode==='refuse')return new Response('{}',{status:403})
  return Response.json({id:'edge-'+calls,model:receipt.model,status:'completed',usage:{input_tokens:receipt.inputTokens,output_tokens:receipt.outputTokens},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({content:'Reviewed '+feature+' without changing records',proposedLens:feature==='lens-proposal'?{name:'Suggested risk review',description:'Draft for operator review',recordType:'Risk',conditions:[],sort:{field:'severity',direction:'desc'},fields:['title','severity'],display:'Cards'}:null})}]}]})
 }})
 try{
  const c=await campaign(h,'SCREEN'),snapshot=await h.db.prepare('SELECT * FROM campaigns WHERE id=?').bind(c.id).first(),lenses=(await h.db.prepare('SELECT count(*) n FROM lenses').first()).n
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']})
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await context.addCookies([{name:h.owner.cookie.split('=')[0],value:h.owner.cookie.slice(h.owner.cookie.indexOf('=')+1),url:h.origin}])
  await page.goto(h.origin+'/app')
  const bases=page.getByRole('region',{name:'Your bases',exact:true}),apps=(await h.read('/api/v1/apps')).data.items,portfolio=await h.read('/api/portfolio')
  for(const app of apps){const link=bases.getByRole('link',{name:app.name,exact:true});await expect(link).toHaveAttribute('href',app.entryUrl)}
  const launch=apps.find(app=>app.name==='Launch readiness'),launchRow=bases.getByRole('listitem').filter({has:page.getByRole('link',{name:launch.name,exact:true})})
  await expect(launchRow).toContainText(String(portfolio.metrics.liveCampaigns)+' live campaign')
  const readiness=(await h.read('/api/v1/construction/readiness')).data
  assert.equal(readiness.ready,false);assert.equal(await page.getByRole('link',{name:'App studio',exact:true}).count(),0)
  await expect(page.getByRole('region',{name:'Recent activity',exact:true})).toBeVisible()
  await page.goto(h.origin+'/app/campaigns/'+c.id)
  await page.getByRole('button',{name:'Request campaign brief',exact:true}).click();await expect(page.getByRole('status').filter({hasText:/AI is disabled/})).toBeVisible();assert.equal(calls,0)
  const settings=(await h.read('/api/v1/settings')).data;await h.command('settings.update',{version:settings.version,changes:{timezone:clock.timezone}})
  await page.goto(h.origin+'/app/settings#ai');await page.getByRole('button',{name:'Enable AI',exact:true}).click();await expect(page.getByRole('button',{name:'Disable AI',exact:true})).toBeVisible()
  const output=process.env.CRADLE_LAUNCH_EVIDENCE??path.join(tmpdir(),'cradle-installed-launch');await mkdir(output,{recursive:true})
  async function requestAnalysis(feature){
   const responsePromise=page.waitForResponse(response=>response.url()===h.origin+'/api/v1/commands/launch.analysis.request'&&response.request().method()==='POST')
   await page.getByRole('button',{name:'Request '+feature.replaceAll('-',' '),exact:true}).click()
   const response=await responsePromise,submitted=response.request().postDataJSON(),accepted=await response.json()
   assert.equal(response.status(),200);assert.equal(accepted.data.value.requestId,submitted.commandId)
   assert.equal(submitted.input.feature,feature)
   const started=Date.now();await h.tick(clock.at)
   const done=(await h.read('/api/v1/launch/analysis-requests/'+submitted.commandId)).data,finished=Date.now()
   assert.equal(done.state,mode==='refuse'?'Failed':'Complete')
   if(mode!=='refuse')assert.equal(done.analysis.modelCallId,submitted.commandId)
   proofs.push({id:submitted.commandId,day:clock.day,feature:'launch.'+feature,subject:submitted.input.campaignId??submitted.input.lensId??null,state:mode==='refuse'?'refused':'succeeded',started,finished,...receipts.at(-1)})
  }
  for(const [route,feature]of[['/app/campaigns/'+c.id,'campaign-brief'],['/app/lenses/risks','risk-readout'],['/app/lenses/new','lens-proposal']]){
   await page.goto(h.origin+route);if(feature==='lens-proposal')await page.getByLabel('Describe the lens').fill('Review high risks')
   await requestAnalysis(feature);await expect(page.getByText('Reviewed '+feature+' without changing records',{exact:true})).toBeVisible({timeout:12000})
   const panel=page.locator('section').filter({has:page.getByRole('button',{name:'Request '+feature.replaceAll('-',' '),exact:true})}).last();await expect(panel.getByText(/AI-generated ·/)).toBeVisible()
   if(feature==='lens-proposal'){await page.getByRole('button',{name:'Use as editable draft'}).click();await expect(page.getByLabel('Lens name',{exact:true})).toHaveValue('Suggested risk review');assert.equal((await h.db.prepare('SELECT count(*) n FROM lenses').first()).n,lenses)}
   for(const width of[1440,390]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(output,feature+'-'+width+'.png'),fullPage:true})}
  }
  assert.deepEqual(await h.db.prepare('SELECT * FROM campaigns WHERE id=?').bind(c.id).first(),snapshot)
  mode='refuse';await page.goto(h.origin+'/app/campaigns/'+c.id);await requestAnalysis('campaign-brief');await expect(page.getByRole('alert').filter({hasText:/provider_refused/})).toBeVisible({timeout:12000})
  await page.goto(h.origin+'/app/settings#ai');await expect(page.getByRole('cell',{name:'launch.campaign-brief',exact:true}).first()).toBeVisible();await expect(page.getByRole('cell',{name:'Unknown',exact:true}).first()).toBeVisible()
  const detailed=(await h.read('/api/v1/launch/usage')).data
  assertUsageCalls(detailed.calls,proofs,h.owner.owner)
  const totals=usageTotals(proofs)
  assert.deepEqual(detailed.usage,totals);assert.deepEqual((await h.read('/api/v1/settings')).data.usage,totals)
  await page.setViewportSize({width:1440,height:900})
  const table=page.getByRole('region',{name:'AI usage by day and feature'})
  await expect(table.locator('tbody tr')).toHaveCount(totals.length)
  for(const total of totals){
   const row=table.getByRole('row').filter({has:page.getByRole('cell',{name:total.purpose,exact:true})})
   await expect(row.getByRole('cell')).toHaveText([total.day,total.purpose,String(total.requests),String(total.inputTokens??'Unknown'),String(total.outputTokens??'Unknown'),'Unknown'])
  }
  const details=page.locator('details').filter({has:page.getByText('Individual launch AI calls',{exact:true})})
  await details.locator('summary').click();await expect(details.getByRole('listitem')).toHaveCount(proofs.length)
  for(const proof of proofs){
   const item=details.getByRole('listitem').filter({hasText:proof.feature+' · '+proof.state})
   await expect(item).toHaveCount(1)
   await expect(item).toContainText(proof.model)
   await expect(item).toContainText('Subject '+(proof.subject??'Lens draft')+' · Operator '+h.owner.owner)
   const observed=detailed.calls.find(call=>call.id===proof.id)
   await expect(item).toContainText(`Input ${proof.inputTokens??'Unknown'} · output ${proof.outputTokens??'Unknown'} tokens · ${observed.durationMs} ms · cost Unknown`)
  }
  for(const width of[1440,390]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(output,'usage-'+width+'.png'),fullPage:true})}
  console.log('PROBE AI-005 2: native Settings -> independently totalled day and feature rows and four individual calls; desktop assertions and desktop and phone screens')
  assert.equal(errors.length,0,errors.join('\n'));assert.equal((await h.db.prepare('SELECT count(*) n FROM launch_analyses').first()).n,3)
 }finally{await browser?.close();await h.close()}
})
