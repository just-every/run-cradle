import {hasRuntimeBindings} from './rer-data-fixture.mjs'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {availableMachine} from './available-machine.mjs'
import {checkoutDevKey} from './dev-gate.mjs'

const running=new WeakSet()
/** Check the public dev protocol without redeeming its automatic sign-in link. */
export async function withRerDevelopment(copy,origin,run){
 if(running.has(copy)||hasRuntimeBindings(copy.source))return run()
 await availableMachine()
 const app=spawn('perl',['-e','setpgrp(0,0); exec @ARGV','--',process.execPath,'node_modules/@runeditrun/rer/bin/rer.mjs','dev','--non-interactive','--json'],{cwd:copy.source,stdio:['ignore','pipe','pipe'],env:copy.environment})
 console.log('OWNED_DEV_PID '+app.pid);let output='';for(const stream of [app.stdout,app.stderr])stream.on('data',chunk=>output+=chunk)
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
  const open=new URL(ready().openUrl)
  assert.equal(open.origin,origin,'Dev opens this installation')
  assert.equal(open.pathname,'/__dev/key','Dev exposes the key exchange')
  assert.ok(new URLSearchParams(open.hash.slice(1)).get('rer-dev')===await checkoutDevKey(copy.source),'The open link carries this checkout’s dev key')
  running.add(copy)
  return await run()
 }finally{running.delete(copy);if(app.exitCode===null){process.kill(-app.pid,'SIGTERM');const timer=setTimeout(()=>{try{process.kill(-app.pid,'SIGKILL')}catch{}},5000);try{await ended}finally{clearTimeout(timer)}}await copy.log.writeFile(output);console.log('RECOVERY_COMMAND '+JSON.stringify({installation:copy.source,program:'node',args:['node_modules/@runeditrun/rer/bin/rer.mjs','dev','--non-interactive','--json'],exitCode:app.exitCode}))}
}
