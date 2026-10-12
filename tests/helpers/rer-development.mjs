import {hasRuntimeBindings} from './rer-data-fixture.mjs'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {availableMachine} from './available-machine.mjs'
import {withDevKey} from './dev-gate.mjs'

const running=new WeakSet()
/** An ordinary-session journey: `dev --login` keeps dev identity off, so sessions come from real email links in the key-gated outbox. */
export async function withRerDevelopment(copy,origin,run){
 if(running.has(copy)||hasRuntimeBindings(copy.source))return run()
 await availableMachine()
 const app=spawn(process.execPath,['scripts/rer.mjs','dev','--login','--non-interactive','--json'],{cwd:copy.source,stdio:['ignore','pipe','pipe'],env:copy.environment})
 let output='';for(const stream of [app.stdout,app.stderr])stream.on('data',chunk=>output+=chunk)
 const ended=new Promise(resolve=>app.once('close',resolve))
 const events=()=>output.split('\n').flatMap(line=>{try{return [JSON.parse(line)]}catch{return []}})
 const ready=()=>events().find(event=>event.event==='ready'&&event.url===origin)
 try{
  for(let i=0;i<1200&&!ready();i++){
   const refusal=/Server startup requires machine load/.test(output)?' (machine load guard)':/15 GiB free/.test(output)?' (disk guard)':''
   const event=events().find(event=>event.event==='error'),code=event?.code
   const cause=/HTTP (\d{3}) \(([a-z_]+)\)/.exec(event?.message??'')
   assert.equal(app.exitCode,null,'Dev stays alive'+refusal+(code?' ('+code+')':'')+(cause?' HTTP '+cause[1]+' '+cause[2]:''));await new Promise(resolve=>setTimeout(resolve,100))
  }
  assert.ok(ready(),'The actual app passes health readiness')
  assert.equal(ready().signInUrl,origin+'/__dev/outbox','The actual app exposes ordinary outbox sign-in')
  running.add(copy)
  return await run()
 }finally{running.delete(copy);await copy.rer(['dev','--stop']);await ended;await copy.log.writeFile(output);console.log('RECOVERY_COMMAND '+JSON.stringify({installation:copy.source,program:'node',args:['scripts/rer.mjs','dev','--login','--non-interactive','--json'],exitCode:app.exitCode}))}
}

export async function outboxSession(origin,key){
 const gated=withDevKey({},key)
 const outbox=await(await fetch(origin+'/__dev/outbox',gated)).text()
 const message=/href="([^"<>]*\?message=[^"<>]*)"/.exec(outbox)?.[1];assert.ok(message,'Real owner message exists')
 const detail=await(await fetch(new URL(message.replaceAll('&amp;','&'),origin),gated)).text()
 const link=/href="([^"<>]*\/auth\/confirm\?[^"<>]+)"/.exec(detail)?.[1];assert.ok(link,'Real Base link exists')
 const token=new URL(link.replaceAll('&amp;','&'),origin).searchParams.get('token')
 const response=await fetch(origin+'/auth/confirm',{method:'POST',redirect:'manual',headers:{origin,'content-type':'application/json'},body:JSON.stringify({token})})
 assert.equal(response.status,303,'Ordinary one-use confirmation admits the owner')
 const cookie=response.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie,'Ordinary Base session is issued')
 return {cookie,token}
}
