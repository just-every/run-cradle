import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import path from 'node:path'
import {chromium} from '@playwright/test'
import {createUlid} from '../../src/core/shared/ids.ts'
import {AUTHORITY_ENTITY_IDS} from '../../src/domains/authority/contracts.ts'

/** The invited native member authors on the adopted manual base; lifecycle
 * commands and subsequent reads use the emitted Worker's ordinary HTTP doors. */
export async function evidenceCommentErasureJourney(h,person){
 const {recipient,operator,name,email,confirmationToken}=person
 const record=(await h.create('synthetic-cradle-5702')).record,subject=record.ref
 const route='/api/v1/comments?'+new URLSearchParams(subject)
 const command=(input)=>({commandId:createUlid(),expected:[{ref:subject,version:record.version}],input})
 const body='Reviewed shipment with '+name+' at '+email+'. Retain the pallet count.'
 const add=command({subject,body,mentions:[h.operator]})
 const authored=(await recipient('/api/v1/commands/comment.add',{method:'POST',body:add})).data.value
 const edit=command({subject,id:authored.id,version:authored.version,body:body+' Two pallets confirmed.',mentions:[h.operator]})
 const edited=(await recipient('/api/v1/commands/comment.edit',{method:'POST',body:edit})).data.value
 const second=(await recipient('/api/v1/commands/comment.add',{method:'POST',body:command({subject,body:'Keep the loading instructions.',mentions:[]})})).data.value
 const control=(await h.request('/api/v1/commands/comment.add',{method:'POST',body:command({subject,body:'Another author confirmed the delivery window.',mentions:[operator]})})).data.value
 const thread=async()=>(await h.request(route)).data.items
 const before=await thread(),beforeControl=before.find(item=>item.id===control.id)
 assert.equal(before.find(item=>item.id===authored.id).authorLabel,name)
 assert.equal(beforeControl.mentionLabels[0].name,name)
 assert.equal(before.find(item=>item.id===authored.id).edited,true)
 const current=async()=>(await h.request('/api/v1/members?appId='+h.appId)).data.items.find(item=>item.id===operator)
 const lifecycle=async(action)=>{
  const member=await current();assert.ok(member)
  return h.request('/api/v1/commands/member.'+action,{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId:h.appId,entityId:AUTHORITY_ENTITY_IDS.member,recordId:operator},version:member.version}],input:{memberId:operator,reason:'synthetic-cradle-5703'}}})
 }
 const snapshot=async()=>JSON.stringify((await h.db.prepare('SELECT * FROM evidence_comments WHERE app_id=? ORDER BY id').bind(h.appId).all()).results)
 const denied=async()=>{
  const saved=await snapshot()
  for(const payload of [add,edit,command({subject,id:authored.id,version:edited.version,body:'synthetic-cradle-5704',mentions:[]}),command({subject,body:'synthetic-cradle-5705',mentions:[]})]){
   const action='id' in payload.input?'edit':'add'
   await recipient('/api/v1/commands/comment.'+action,{method:'POST',body:payload,status:401})
  }
  await recipient(route,{status:401})
  for(const payload of [add,edit])await recipient('/api/v1/commands/'+payload.commandId,{status:401})
  const replay=await fetch(h.origin+'/auth/confirm',{method:'POST',redirect:'manual',headers:{origin:h.origin,'content-type':'application/json'},body:JSON.stringify({token:confirmationToken})})
  assert.ok([400,401,403,404,409,410].includes(replay.status));assert.equal(replay.headers.get('set-cookie'),null);await replay.arrayBuffer()
  assert.equal(await snapshot(),saved,'Captured sessions, commands and invitation cannot alter the retained thread')
 }
 await lifecycle('remove')
 assert.equal((await current()).state,'removed')
 assert.equal((await thread()).find(item=>item.id===authored.id).authorLabel,name,'Removal preserves attribution until explicit erasure')
 await denied()
 const erased=(await lifecycle('erase')).data.value
 assert.equal(erased.confirmed,true);assert.equal(erased.erasureState,'complete')
 const member=await current(),after=await thread(),label=member.name
 assert.equal(member.state,'erased');assert.equal(member.email,null);assert.match(label,/^Anonymous /)
 for(const id of [authored.id,second.id]){
  const item=after.find(item=>item.id===id)
  assert.equal(item.authorLabel,label);assert.equal(item.author.id,operator);assert.equal(item.canEdit,false)
 }
 assert.equal(after.find(item=>item.id===authored.id).body,'Reviewed shipment with '+label+' at '+label+'. Retain the pallet count. Two pallets confirmed.')
 assert.equal(after.find(item=>item.id===second.id).body,'Keep the loading instructions.')
 assert.deepEqual(after.find(item=>item.id===authored.id).mentions,[h.operator],'Unrelated structured mentions survive')
 assert.deepEqual(after.find(item=>item.id===control.id),{...beforeControl,mentions:[],mentionLabels:[]},'Another author keeps their content and attribution; only the erased mention is removed')
 for(const literal of [name,email]){
  assert.ok(!JSON.stringify(after).includes(literal),'Thread no longer exposes the original identity')
  assert.equal((await h.request(route+'&q='+encodeURIComponent(literal))).data.items.length,0,'Comment search no longer returns erased identity copies')
 }
 assert.equal((await h.request(route+'&q='+encodeURIComponent('Two pallets confirmed'))).data.items[0].authorLabel,label)
 const receipts=(await h.db.prepare('SELECT result_json FROM command_admissions WHERE command_id IN (?,?) ORDER BY command_id').bind(add.commandId,edit.commandId).all()).results
 assert.equal(receipts.length,2,'Both original author command receipts are retained')
 for(const receipt of receipts){
  assert.ok(!receipt.result_json.includes(name));assert.ok(!receipt.result_json.includes(email))
  assert.ok(JSON.parse(receipt.result_json).value.body.includes('Retain the pallet count.'))
 }
 const candidates=(await h.request('/api/v1/comments/mentions?'+new URLSearchParams(subject))).data.items
 assert.ok(!candidates.some(item=>item.id===operator),'An erased member cannot be mentioned again')
 await denied()
 await h.restart()
 assert.deepEqual(await thread(),after,'Anonymous attribution and mention removal survive a Worker restart')
 await anonymousThreadScreen(h,{subject,label,name,email})
}

async function anonymousThreadScreen(h,{subject,label,name,email}){
 const output=path.resolve(process.env.CRADLE_COMMENT_ERASURE_OUTPUT??'.private/comment-erasure');await mkdir(output,{recursive:true})
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-mock-keychain','--password-store=basic'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})})
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}})
  try{
   await context.addCookies(h.cookie.split('; ').map(part=>({name:part.slice(0,part.indexOf('=')),value:part.slice(part.indexOf('=')+1),url:h.origin})))
   const page=await context.newPage();page.setDefaultTimeout(15000)
   await page.goto(h.origin+`/app/records/${subject.appId}/${subject.entityId}/${subject.recordId}`)
   const thread=page.getByRole('region',{name:'Record comments',exact:true})
   await thread.getByText('Keep the loading instructions.',{exact:true}).waitFor()
   assert.equal(await thread.locator('strong').filter({hasText:label}).count(),2)
   assert.ok((await thread.innerText()).includes('Another author confirmed the delivery window.'))
   for(const literal of [name,email])assert.ok(!(await thread.innerText()).includes(literal))
   await thread.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'anonymous-manual-thread-1440.png'),fullPage:true})
   await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'anonymous-manual-thread-390.png'),fullPage:true})
  }finally{await context.close()}
 }finally{await browser.close()}
}
