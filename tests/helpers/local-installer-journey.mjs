import {stopOwnedInstaller} from './installer-owned-processes.mjs'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {readFile,writeFile} from 'node:fs/promises'
import {createServer} from 'node:net'
import path from 'node:path'
import {availableMachine} from './available-machine.mjs'
import {checkoutDevKey} from './dev-gate.mjs'
import {observeChild} from '../../scripts/evidence/runtime-child.mjs'
import {saveInstallerStartupDiagnostic} from './local-installer-diagnostic.mjs'
/** Run the installed CLI; zero-setup callers let rer dev create its own local owner and settings. */
// Zero-setup belongs to the public rer command (the package bin, global/rer.mjs):
// it sets up a local owner and leaves the server running in the background.
// The checkout's internal dispatcher (bin/rer.mjs) requires rer setup first.
export async function localInstallerJourney(copy,_browser,{zeroSetup=false}={}){
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const command=async args=>copy.rer(args)
 await command(['check','--profile','first-party']);await command(['install','--non-interactive'])
 if(!zeroSetup){
  const answers=path.join(copy.source,'answers.json')
  await writeFile(answers,JSON.stringify({OWNER_EMAIL:'local-owner@example.test',OWNER_NAME:'Local Owner',WORKSPACE_NAME:'My records',WORKSPACE_TIMEZONE:'Australia/Brisbane',WORKSPACE_CURRENCY:'AUD'}),{mode:0o600})
  await command(['setup','--answers','answers.json','--port',String(port),'--non-interactive'])
  const before=await readFile(path.join(copy.source,'.dev.vars'))
  await command(['setup','--non-interactive']);assert.ok((await readFile(path.join(copy.source,'.dev.vars'))).equals(before),'Repeat setup retains exact private bytes')
 }
 const origin=`http://127.0.0.1:${port}`
 await availableMachine()
 const app=spawn(process.execPath,[zeroSetup?'node_modules/@runeditrun/rer/global/rer.mjs':'node_modules/@runeditrun/rer/bin/rer.mjs','dev','--port',String(port),'--non-interactive'],{cwd:copy.source,stdio:['ignore','pipe','pipe'],env:copy.environment})
 const capture=observeChild(app)
 let closing
 const close=()=>closing??=(async()=>{await stopOwnedInstaller(copy,app);await capture.close})()
 try{
  for(let i=0;i<1200&&!capture.output().includes(`RER_READY ${origin}`);i++){
   const output=capture.output()
   const refusal=/Server startup requires machine load/.test(output)?' (machine load guard)':/15 GiB free/.test(output)?' (disk guard)':''
   if(!zeroSetup||app.exitCode)assert.equal(app.exitCode,null,'Dev must stay alive'+refusal);await new Promise(resolve=>setTimeout(resolve,100))
  }
  let output=capture.output()
  assert.ok(output.includes(`RER_READY ${origin}`),'Health-gated dev readiness')
  for(let i=0;i<50&&!/^RER_OPEN \S+$/m.test(output);i++){await new Promise(resolve=>setTimeout(resolve,100));output=capture.output()}
  assert.match(output,/^RER_SIGNED_IN \S+@\S+$/m,'Dev names the identity the browser will hold')
  assert.equal(output.includes('RER_SIGN_IN '),false,'Dev never prints an email sign-in link')
  assert.match(output,/^RER_OPEN \S+$/m,'Dev exposes its current key exchange link')
  assert.equal((await fetch(origin+'/api/session')).status,401,'The unused dev link grants no browser authority')
  return {origin,close,output:()=>capture.output(),key:await checkoutDevKey(copy.source),openUrl:/^RER_OPEN (\S+)$/m.exec(output)?.[1]}
 }catch(error){await close();const diagnostic=await saveInstallerStartupDiagnostic(copy,app,capture);throw new Error(error.message+'; drained dev startup diagnostic: '+diagnostic.redactedTail,{cause:error})}
}
