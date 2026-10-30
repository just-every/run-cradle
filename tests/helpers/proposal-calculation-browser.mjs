import assert from 'node:assert/strict'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {chromium} from '@playwright/test'
import {userAutomationRuntime} from './user-automation-runtime.mjs'
import {proposalDoor} from './proposal-door.mjs'
import {createUlid} from '../../src/core/shared/ids.ts'
import {newField} from '../../src/ui/records/schema/templates.ts'
import {recordsBrowserWidths} from './records-browser-widths.mjs'
import {recordsJourney} from './records-browser-journey.mjs'

/** Page through the owner's retained report, then adopt the exact reviewed cells. */
export async function proposalCalculationBrowser(){
 const output=path.resolve(process.env.CRADLE_RECORDS_OUTPUT??'.private/records-builder/browser');await mkdir(output,{recursive:true})
 let h,browser
 try{
  h=await userAutomationRuntime(0)
  browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic',...(process.platform==='linux'?['--no-sandbox']:[])],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})})
  const receipts=[]
  for(const width of recordsBrowserWidths()){
   const appId=createUlid(),entityId=createUlid(),name=newField('Name'),amount=newField('Amount','number'),score=newField('Score','computed'),schema={appId,name:`Calculation review ${width}`,tables:[{id:entityId,label:'Items',primaryFieldId:name.id,fields:[name]}]}
   Object.assign(score,{readOnly:true,resultType:'number'});schema.tables[0].fields.push(amount,score);schema.formulaSources={[score.id]:'{Amount} * 2'}
   const preview=(await h.request('/api/v1/records/schema-preview',{method:'POST',body:schema})).data
   await h.request('/api/v1/commands/release.adopt',{method:'POST',body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}}})
   const entity=(await h.request(`/api/v1/apps/${appId}/entities/${entityId}`)).data,rows=[]
   const expected=[['0','0','0'],['1','2','3'],['2','4','6'],['3','6','9'],['4','8','12'],['5','10','15'],['6','12','18'],['7','14','21'],['8','16','24'],['9','18','27'],['10','20','30'],['11','22','33'],['0','0','0'],['12','24','36'],['13','26','39'],['14','28','42'],['15','30','45'],['16','32','48'],['17','34','51'],['18','36','54'],['19','38','57'],['20','40','60'],['21','42','63'],['22','44','66'],['23','46','69']]
   for(const [index,values]of expected.entries()){
    const label=`synthetic-cradle-${width}-${index}`,record=(await h.request('/api/v1/commands/record.create',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId:appId,entityId:'00000000000000000000000001',recordId:entityId},version:entity.version}],input:{appId:appId,entityId:entityId,values:{[name.id]:label,[amount.id]:values[0]}}}})).data.value
    rows.push({record,label,values})
   }
   const keyName=`Calculation reviewer ${width}`,key=(await h.request('/api/proposer-keys',{method:'POST',status:201,body:{commandId:createUlid(),name:keyName,appId:appId,expiresAt:new Date(Date.now()+86400000).toISOString()}})).data.key,agent=proposalDoor(h.origin,key.secret,'rest'),current=await agent.schema()
   const submitted=await agent.propose({schema:{appId:appId,name:schema.name,tables:current.tables,formulaSources:{[score.id]:'{Amount} * 3'}}})
   const report=(await h.request(`/api/v1/records/proposals/${submitted.id}`)).data.calculations.find(item=>item.fieldId===score.id)
   const context=await browser.newContext({viewport:{width,height:width===390?844:1000}}),page=await context.newPage(),j=recordsJourney(page,h.origin,output,width)
   try{
    // This is the native test session returned by the fixture's sign-in door.
    await context.addCookies(h.cookie.split('; ').map(value=>({name:value.split('=')[0],value:value.slice(value.indexOf('=')+1),url:h.origin})))
    await page.goto(h.origin+'/app/records');await page.getByRole('button',{name:`Review proposal from ${keyName}`,exact:true}).click()
    await page.getByRole('heading',{name:'Proposed by an agent',exact:true}).waitFor()
    const article=page.getByRole('article',{name:'Items: Score',exact:true})
    await article.getByText(/23 changed cells across/).waitFor()
    const observed=[]
    while(true){
     const cells=await article.locator('tbody tr').evaluateAll(nodes=>nodes.map(node=>({id:node.dataset.recordId,label:node.querySelector('a').textContent,before:node.querySelectorAll('td')[0].textContent,after:node.querySelectorAll('td')[1].textContent})))
     observed.push(...cells)
     if(await article.getByRole('button',{name:'Next changed cells',exact:true}).isDisabled())break
     await article.getByRole('button',{name:'Next changed cells',exact:true}).click()
    }
    const wanted=rows.filter(row=>row.values[1]!==row.values[2]).map(row=>({id:row.record.id,label:row.label,before:row.values[1],after:row.values[2]})).sort((a,b)=>a.id.localeCompare(b.id))
    assert.deepEqual(observed,wanted,'Every page names exactly the changed native record cells')
    const downloading=page.waitForEvent('download');await article.getByRole('button',{name:'Download all changed cells',exact:true}).click()
    const download=JSON.parse(await readFile(await(await downloading).path(),'utf8'));assert.equal(download.fieldId,score.id);assert.deepEqual(download.changes,report.changes)
    await article.getByRole('button',{name:'Previous changed cells',exact:true}).click()
    await j.capture('proposal-calculation-review')
    for(const cell of report.changes){const record=(await h.request(`/api/v1/apps/${appId}/entities/${entityId}/records/${cell.recordId}`)).data.record;assert.deepEqual(record.fields[score.id],cell.before)}
    await page.getByLabel('I reviewed the data changes and owner access.',{exact:true}).check()
    await j.command(page.getByRole('button',{name:'Adopt schema',exact:true}),'release.adopt');await page.getByRole('heading',{name:'Base ready',exact:true}).waitFor()
    for(const row of rows){const record=(await h.request(`/api/v1/apps/${appId}/entities/${entityId}/records/${row.record.id}`)).data.record;assert.deepEqual(record.fields[score.id],{state:'value',value:row.values[2]})}
    receipts.push({width,records:rows.length,changed:observed.length,pages:2,downloaded:download.changes.length,checkpoints:j.checkpoints})
   }finally{await context.close()}
  }
  await writeFile(path.join(output,'proposal-calculation-results.json'),JSON.stringify(receipts,null,2));console.log(JSON.stringify({proposalCalculation:receipts}))
 }finally{await browser?.close();await h?.close()}
}
