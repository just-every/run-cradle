import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {userInfo} from 'node:os'
import {mkdir} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {chromium} from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {userAutomationRuntime} from './user-automation-runtime.mjs'
import {freePort} from './free-port.mjs'

function ownedProcesses(){const rows=execFileSync('ps',['-axo','pid,ppid,comm'],{encoding:'utf8'}).trim().split('\n').slice(1).map(line=>{const m=line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);return m?{pid:Number(m[1]),parent:Number(m[2]),name:m[3]}:null}).filter(Boolean),owned=new Set([process.pid]);let more=true;while(more){more=false;for(const row of rows)if(owned.has(row.parent)&&!owned.has(row.pid)){owned.add(row.pid);more=true}}return rows.filter(row=>owned.has(row.pid)&&/workerd|chrome|node/.test(row.name))}
export async function recordTrashBrowser(){
 assert.equal(process.env.HOME,userInfo().homedir,'Browser driver uses the execution host real HOME')
 const output='docs/contract/SNAP-002';await mkdir(output,{recursive:true})
 let h,browser
 try{
  h=await userAutomationRuntime(await freePort());browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
  console.log('OWNED_PROCESSES '+JSON.stringify(ownedProcesses()))
  for(const width of [1440,390]){
   const created=await h.create(`synthetic-cradle-${30+width} · Packaging labels`)
   const context=await browser.newContext({viewport:{width,height:width===390?844:1000}}),page=await context.newPage(),errors=[]
   page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000)
   try{
    async function capture(state,target,settle=true){if(settle)await page.waitForLoadState('networkidle');await target.scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/trash-${state}-${width}.png`,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);const axe=await new AxeBuilder({page}).analyze();assert.deepEqual(axe.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[]);assert.deepEqual(errors,[])}
    await context.addCookies([{name:h.cookie.split('=')[0],value:h.cookie.slice(h.cookie.indexOf('=')+1),url:h.origin}])
    const recordPath=`/api/v1/apps/${h.appId}/entities/${h.entityId}/records/${created.record.id}`
    await page.goto(`${h.origin}/app/records/${h.appId}/${h.entityId}/${created.record.id}`)
    await page.getByRole('button',{name:'Edit record',exact:true}).waitFor()
    await capture('record',page.getByRole('button',{name:'Edit record',exact:true}))
    if(width===390){
     const menu=page.getByRole('button',{name:'Open navigation',exact:true});await page.keyboard.press('Tab');await menu.focus();await page.getByRole('tooltip',{name:'Open navigation',exact:true}).waitFor({state:'visible'});await page.keyboard.press('Tab')
     await menu.click();const close=page.getByRole('button',{name:'Close navigation',exact:true});await page.keyboard.press('Tab');await close.focus();await page.getByRole('tooltip',{name:'Close navigation',exact:true}).waitFor({state:'visible'});assert.equal(await page.getByRole('dialog',{name:'Navigation',exact:true}).evaluate(node=>node.scrollWidth>node.clientWidth),false);await close.click()
     const bell=page.getByRole('link',{name:'Notifications',exact:true}).first();await page.keyboard.press('Tab');await bell.focus();await bell.getByRole('tooltip').waitFor({state:'visible'});await capture('tooltip',bell)
    }
    await page.locator('summary').filter({hasText:/^Record actions$/}).click()
    await page.getByRole('button',{name:'Delete record',exact:true}).click()
    const move=page.getByRole('button',{name:'Move to Trash',exact:true})
    await page.getByRole('checkbox').waitFor();assert.equal(await move.isDisabled(),true)
    await capture('dialog',move)
    await page.getByRole('checkbox').check()
    const deletion=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/api/v1/commands/record.delete'))
    await move.click();assert.equal((await deletion).status(),200)
    const back=page.getByRole('link',{name:'Back to records',exact:true}).last();await page.getByRole('status').filter({has:back}).waitFor()
    await capture('deleted',page.locator('.cr-record-back'),false)
    await h.request(recordPath,{status:404})
    await page.goto(h.origin+'/app/settings')
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent==='Prepare archive'&&!button.disabled))
    await page.locator('summary').filter({hasText:/^Trash$/}).click()
    const panel=page.getByRole('region',{name:'Trash',exact:true});await panel.getByRole('combobox').selectOption(h.appId)
    await panel.getByRole('button',{name:`Restore synthetic-cradle-${30+width} · Packaging labels`,exact:true}).waitFor()
    await capture('list',panel)
    const response=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/api/v1/records/trash/restore'))
    await panel.getByRole('button',{name:`Restore synthetic-cradle-${30+width} · Packaging labels`,exact:true}).click();assert.equal((await response).status(),200)
    await panel.getByText('Trash is empty',{exact:true}).waitFor();await capture('restored',panel)
    assert.equal((await h.request(recordPath)).data.record.id,created.record.id)
   }catch(error){await page.screenshot({path:`${output}/trash-failed-${width}.png`,fullPage:true});console.log('TRASH_BROWSER_FAILURE '+JSON.stringify({errors,text:await page.getByRole('region',{name:'Trash',exact:true}).innerText().catch(()=> 'Trash panel unavailable')}));throw error}finally{await context.close()}
  }
 }finally{await browser?.close();await h?.close();console.log('OWNED_PROCESSES_AFTER '+JSON.stringify(ownedProcesses()))}
}

if(process.argv[1]===fileURLToPath(import.meta.url))await recordTrashBrowser()
