import assert from 'node:assert/strict'
import {userInfo} from 'node:os'
import {mkdir} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {chromium} from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {userAutomationRuntime} from './user-automation-runtime.mjs'
import {freePort} from './free-port.mjs'
import {createUlid} from '../../src/core/shared/ids.ts'

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
   await h.request('/api/v1/commands/record.delete',{method:'POST',body:{commandId:createUlid(),expected:[{ref:created.record.ref,version:created.record.version}],input:{ref:created.record.ref,confirmation:created.record.id}}})
   const context=await browser.newContext({viewport:{width,height:width===390?844:1000}}),page=await context.newPage(),errors=[]
   page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000)
   try{
    await context.addCookies([{name:h.cookie.split('=')[0],value:h.cookie.slice(h.cookie.indexOf('=')+1),url:h.origin}]);await page.goto(h.origin+'/app/settings')
    await page.locator('summary').filter({hasText:/^Trash$/}).click()
    const panel=page.getByRole('region',{name:'Trash',exact:true});await panel.getByLabel('Trash base',{exact:true}).selectOption(h.appId)
    await panel.getByRole('button',{name:`Restore synthetic-cradle-${30+width} · Packaging labels`,exact:true}).waitFor()
    async function capture(state){await page.waitForLoadState('networkidle');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);const axe=await new AxeBuilder({page}).analyze();assert.deepEqual(axe.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[]);assert.deepEqual(errors,[]);await panel.scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/trash-${state}-${width}.png`,fullPage:true})}
    await capture('list')
    const response=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/api/v1/records/trash/restore'))
    await panel.getByRole('button',{name:`Restore synthetic-cradle-${30+width} · Packaging labels`,exact:true}).click();assert.equal((await response).status(),200)
    await panel.getByText('Trash is empty',{exact:true}).waitFor();await capture('restored')
    assert.equal((await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/records/${created.record.id}`)).data.record.id,created.record.id)
   }finally{await context.close()}
  }
 }finally{await browser?.close();await h?.close();console.log('OWNED_PROCESSES_AFTER '+JSON.stringify(ownedProcesses()))}
}
