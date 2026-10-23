import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {chromium,expect} from '@playwright/test'
import {setup,campaign} from './helpers/launch-installed.mjs'

test('[AI-001/002/003 SET-002] existing campaign, risks, lens builder and settings controls expose real immutable results and errors',async()=>{
 let mode='valid',calls=0,browser
 const h=await setup({hostname:'localhost',automaticQueues:true,configuration:{AI_PROVIDER_API_KEY:'network-edge-only',AI_MODEL:'edge-model'},providerFetch:async request=>{
  assert.equal(request.url,'https://api.openai.com/v1/responses');calls++;const body=await request.json(),feature=JSON.parse(body.input[0].content[0].text).feature
  if(mode==='refuse')return new Response('{}',{status:403})
  return Response.json({id:'edge-'+calls,model:'edge-model',status:'completed',usage:{input_tokens:9,output_tokens:4},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({content:'Reviewed '+feature+' without changing records',proposedLens:feature==='lens-proposal'?{name:'Suggested risk review',description:'Draft for operator review',recordType:'Risk',conditions:[],sort:{field:'severity',direction:'desc'},fields:['title','severity'],display:'Cards'}:null})}]}]})
 }})
 try{
  const c=await campaign(h,'SCREEN'),snapshot=await h.db.prepare('SELECT * FROM campaigns WHERE id=?').bind(c.id).first(),lenses=(await h.db.prepare('SELECT count(*) n FROM lenses').first()).n
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--use-mock-keychain','--password-store=basic']})
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await context.addCookies([{name:h.owner.cookie.split('=')[0],value:h.owner.cookie.slice(h.owner.cookie.indexOf('=')+1),url:h.origin}])
  await page.goto(h.origin+'/app/campaigns/'+c.id)
  await page.getByRole('button',{name:'Request campaign brief',exact:true}).click();await expect(page.getByRole('status').filter({hasText:/AI is disabled/})).toBeVisible();assert.equal(calls,0)
  await page.goto(h.origin+'/app/settings#ai');await page.getByRole('button',{name:'Enable AI',exact:true}).click();await expect(page.getByRole('button',{name:'Disable AI',exact:true})).toBeVisible()
  const output=process.env.CRADLE_LAUNCH_EVIDENCE??path.join(tmpdir(),'cradle-installed-launch');await mkdir(output,{recursive:true})
  for(const [route,feature]of[['/app/campaigns/'+c.id,'campaign-brief'],['/app/lenses/risks','risk-readout'],['/app/lenses/new','lens-proposal']]){
   await page.goto(h.origin+route);if(feature==='lens-proposal')await page.getByLabel('Describe the lens').fill('Review high risks')
   await page.getByRole('button',{name:'Request '+feature.replaceAll('-',' '),exact:true}).click();await expect(page.getByText('Reviewed '+feature+' without changing records',{exact:true})).toBeVisible({timeout:12000})
   const panel=page.locator('section').filter({has:page.getByRole('button',{name:'Request '+feature.replaceAll('-',' '),exact:true})}).last();await expect(panel.getByText(/AI-generated ·/)).toBeVisible()
   if(feature==='lens-proposal'){await page.getByRole('button',{name:'Use as editable draft'}).click();await expect(page.getByLabel('Lens name',{exact:true})).toHaveValue('Suggested risk review');assert.equal((await h.db.prepare('SELECT count(*) n FROM lenses').first()).n,lenses)}
   for(const width of[1440,390]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(output,feature+'-'+width+'.png'),fullPage:true})}
  }
  assert.deepEqual(await h.db.prepare('SELECT * FROM campaigns WHERE id=?').bind(c.id).first(),snapshot)
  mode='refuse';await page.goto(h.origin+'/app/campaigns/'+c.id);await page.getByRole('button',{name:'Request campaign brief',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:/provider_refused/})).toBeVisible({timeout:12000})
  await page.goto(h.origin+'/app/settings#ai');await expect(page.getByRole('cell',{name:'launch.campaign-brief',exact:true}).first()).toBeVisible();await expect(page.getByRole('cell',{name:'Unknown',exact:true}).first()).toBeVisible()
  assert.equal(errors.length,0,errors.join('\n'));assert.equal((await h.db.prepare('SELECT count(*) n FROM launch_analyses').first()).n,3)
 }finally{await browser?.close();await h.close()}
})
