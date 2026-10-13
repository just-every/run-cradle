import assert from 'node:assert/strict'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {mkdtemp,symlink,readFile,writeFile,mkdir,rm} from 'node:fs/promises'
import {tmpdir,loadavg} from 'node:os'
import {join} from 'node:path'
import {createServer} from 'node:net'
import http from 'node:http'
import {createRequire} from 'node:module'
import {baseHttpSession} from '../../tests/helpers/base-http-session.mjs'
import {outboxSession} from '../../tests/helpers/rer-development.mjs'
import {checkoutDevKey,withDevKey} from '../../tests/helpers/dev-gate.mjs'
import {completeFirstRun} from '../../tests/helpers/complete-first-run.mjs'
import {runtimeEvents} from './runtime-events.mjs'
import {observeChild,childDiagnostic} from './runtime-child.mjs'
import {scanEvidence} from './runtime-secret-scan.mjs'
import {createHmac} from 'node:crypto'
import {artifactExports} from './runtime-artifact.mjs'
import {readSettings} from '@runeditrun/rer/adapter-settings'
const execute=promisify(execFile),root=process.cwd(),evidence=process.env.CRADLE_EVIDENCE
assert.ok(evidence,'CRADLE_EVIDENCE is required')
const temp=await mkdtemp(join(tmpdir(),'cradle-runtime-proof-')),copy=join(temp,'source')
const env={...process.env,CI:'true',RER_SERVER_JOURNEY:'1',WRANGLER_SEND_METRICS:'false'};delete env.RER_LOCAL_OPERATION
const rows=[],issuedValues=[],publicResponses=[],capturedLogs=[],archiveContents=[],diagnostics=[],children=[]
const evidenceName=name=>join(evidence,(process.env.CRADLE_EVIDENCE_PREFIX??'')+name)
const captureIssued=value=>{if(value){issuedValues.push(value);if(value.includes('='))issuedValues.push(value.slice(value.indexOf('=')+1))}}
const captureText=body=>{for(const match of body.matchAll(/(?:[?&]token=|"csrfToken"\s*:\s*")([^"<> &]+)/g))captureIssued(match[1])}
const observeFetch=async(...args)=>{const response=await fetch(...args);captureIssued(response.headers.get('set-cookie')?.split(';')[0]);const body=await response.clone().text();captureText(body);return response}
let app,setup,appCapture,setupCapture,origin,artifact,eventResult,modeOutput='',modeVerb,modeCaptured=false,setupOutput='',setupCaptured=false,devKey,noWriteMutation=false
const capacity=async()=>{const deadline=Date.now()+60000;while(loadavg()[0]>36){if(Date.now()>=deadline)throw Error('Capacity remained above load 36 for 60 seconds; no next mode started');console.log('Runtime evidence waiting for load <=36; observed '+loadavg()[0]);await new Promise(resolve=>setTimeout(resolve,10000))}}
const command=async args=>{try{const result=await execute(process.execPath,['node_modules/@runeditrun/rer/bin/rer.mjs',...args,'--json'],{cwd:copy,env,maxBuffer:32*1024*1024});capturedLogs.push({kind:'rer '+args[0],body:result.stdout+result.stderr});return result}catch(error){capturedLogs.push({kind:'rer '+args[0]+' failed',body:String(error.stdout??'')+String(error.stderr??'')});throw Error('rer evidence command failed; raw child output withheld')}}
// All diagnostics redact complete child output only after both pipes have drained.
const diagnose=async(phase,child,capture)=>{
 const values=(await readSettings(copy,{file:'.dev.vars'}).catch(()=>({values:{}}))).values
 const key=await checkoutDevKey(copy).catch(()=>undefined)
 const diagnostic=childDiagnostic(phase,child,capture,[...Object.values(values),...issuedValues,key])
 diagnostics.push(diagnostic);console.log(JSON.stringify(diagnostic))
}
const stop=async verb=>{if(app){if(app.exitCode===null)await command([verb,'--stop']);await appCapture.close;modeOutput=appCapture.output();app=undefined}}
const status=async(mode,control,path,expected,init={})=>{
 const response=await fetch(origin+path,{redirect:'manual',...init,headers:{connection:'close',...init.headers}}),body=await response.text()
 if(control==='signed out')publicResponses.push(JSON.stringify(Object.fromEntries(response.headers))+'\n'+body)
 rows.push({mode,control,path,method:init.method??'GET',expected,actual:response.status,match:response.status===expected})
 // Collect the complete matrix even when a shared Base boundary diverges.
 return body
}
let copyRoot
// Archives are planted before setup, so every mode is probed for them, without a key.
const protectedPaths=()=>['/cdn-cgi/local/explorer/api/databases','/cdn-cgi/local/explorer/api/d1','/cdn-cgi/handler/scheduled','/.rer/local/dev-key.env','/.seed/installer/','/.seed/installer/state.json','/exports/proof.rer','/proof.rer','/@fs/'+join(copyRoot,'proof.rer')]
try{
 await execute('git',['clone','--quiet','--no-hardlinks',root,copy]);await symlink(join(root,'node_modules'),join(copy,'node_modules'))
 copyRoot=copy;await mkdir(join(copy,'exports'));for(const file of ['exports/proof.rer','proof.rer'])await writeFile(join(copy,file),'PRIVATE ARCHIVE PROBE')
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));origin=`http://127.0.0.1:${port}`
 await writeFile(join(copy,'answers.json'),JSON.stringify({OWNER_EMAIL:'maya@northstar.example'}),{mode:0o600})
 // Setup's app is transient. Observe it while its real hook serves owner claim/sign-in.
 setup=spawn(process.execPath,['node_modules/@runeditrun/rer/bin/rer.mjs','setup','--answers','answers.json','--port',String(port),'--non-interactive','--json'],{cwd:copy,env,stdio:['ignore','pipe','pipe']})
 setupCapture=observeChild(setup);children.push({child:setup,capture:setupCapture})
 let observed=false
 const setupDeadline=Date.now()+180000
 while(!setupCapture.drained){
  assert.ok(Date.now()<setupDeadline,'Real rer setup exceeded bounded 180-second readiness/completion window')
  if(!observed&&await fetch(origin+'/health').then(async r=>{await r.arrayBuffer();return r.status===200}).catch(()=>false)){
   for(const path of protectedPaths())await status('setup','signed out',path,404)
   observed=true
  }
  await new Promise(resolve=>setTimeout(resolve,20))
 }
 await setupCapture.close;setupOutput=setupCapture.output();const setupError=setupCapture.events.some(event=>event.event==='error');capturedLogs.push({kind:'setup CLI and Worker',body:setupOutput});setupCaptured=true;captureText(setupOutput);if(setup.exitCode!==0)await diagnose('setup',setup,setupCapture);assert.equal(setup.exitCode,0,'Real rer setup succeeds');assert.equal(setupError,false);assert.ok(observed,'Transient setup public port observed')
 devKey=await checkoutDevKey(copy);captureIssued(devKey)
 artifact=await artifactExports(copy)
 eventResult=await runtimeEvents(copy,(await readSettings(copy,{file:'.dev.vars'})).values)
 const require=createRequire(join(copy,'package.json'))
 const dbRun=async callback=>{const {getPlatformProxy}=require('wrangler');const p=await getPlatformProxy({configPath:join(copy,'wrangler.jsonc'),persist:{path:join(copy,'.wrangler/state/v3')},remoteBindings:false});try{return await callback(p.env.DB)}finally{await p.dispose()}}
 for(const verb of ['dev','preview']){
  await capacity();modeOutput='';modeVerb=verb;modeCaptured=false;
  app=spawn(process.execPath,['node_modules/@runeditrun/rer/bin/rer.mjs',verb,...(verb==='dev'?['--login']:[]),'--non-interactive','--json'],{cwd:copy,env,stdio:['ignore','pipe','pipe']})
  appCapture=observeChild(app);children.push({child:app,capture:appCapture})
  const ready=()=>appCapture.events.some(event=>event.event==='ready'),failed=()=>appCapture.events.some(event=>event.event==='error')
  for(let i=0;i<1200&&!ready()&&!failed()&&!appCapture.drained;i++)await new Promise(resolve=>setTimeout(resolve,100))
  if(!ready()){
   if(!failed()&&!appCapture.drained)app.kill('SIGTERM')
   await appCapture.close;modeOutput=appCapture.output();captureText(modeOutput);await diagnose(verb,app,appCapture)
  }
  assert.ok(ready(),`${verb} ready`)
  for(const path of protectedPaths())await status(verb,'signed out',path,404)
  if(verb==='preview'){
   const {cookie,token}=await outboxSession(origin,devKey);captureIssued(cookie);captureIssued(token);await completeFirstRun(origin,cookie)
   const csrfToken=(await(await observeFetch(origin+'/auth/csrf',{headers:{cookie}})).json()).csrfToken;captureIssued(csrfToken)
   const gatedFetch=(url,init)=>observeFetch(url,new URL(url).pathname==='/__dev/outbox'?withDevKey(init,devKey):init)
   const expired=await baseHttpSession(origin,'maya@northstar.example',gatedFetch),revoked=await baseHttpSession(origin,'maya@northstar.example',gatedFetch);for(const session of [expired,revoked]){captureIssued(session.cookie);captureIssued(session.csrfToken)}
   await status(verb,'expiry positive control','/api/session',200,{headers:{cookie:expired.cookie}})
   await status(verb,'revocation positive control','/api/session',200,{headers:{cookie:revoked.cookie}})
   const secret=(await readSettings(copy,{file:'.dev.vars'})).values.SESSION_SECRET
   const digest=value=>createHmac('sha256',secret).update('session\0'+value.slice(value.indexOf('=')+1)).digest('hex')
   await dbRun(async db=>{
    await db.prepare('UPDATE oa_sessions SET expires_at=? WHERE token_hash=?').bind(Date.now()-1,digest(expired.cookie)).run()
    await db.prepare('UPDATE oa_sessions SET revoked_at=? WHERE token_hash=?').bind(Date.now(),digest(revoked.cookie)).run()
   })
   const paths=[['/health',200,200],['/api',401,404],['/api/session',401,200],['/api/missing',401,404],['/auth',404,404],['/auth/capabilities',200,200],['/oauth/missing',404,404],['/webhooks/missing',404,404],['/mcp',405,405],['/api/editor/config',403,503],['/',200,200],['/signin',200,200],['/app',303,200],['/app/missing',303,404],['/missing',404,404]]
   for(const [control,value] of [['signed out',''],['signed in',cookie],['expired',expired.cookie],['revoked',revoked.cookie]])for(const [path,out,inside]of paths){const body=await status(verb,control,path,control==='signed in'?inside:out,{headers:value?{cookie:value}:{}});if(path==='/missing'){assert.match(body,/class="cr-identity"/);assert.match(body,/Page not found/)};if(control!=='signed in')assert.doesNotMatch(body,/maya@northstar\.example/)}
   const before=await dbRun(async db=>(await db.prepare('SELECT * FROM campaigns ORDER BY id').all()).results)
   for(const [control,headers]of [['no CSRF',{cookie,origin}],['foreign origin',{cookie,origin:'https://foreign.invalid','x-csrf-token':csrfToken}]])await status(verb,control,'/api/campaigns',403,{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({code:'DENIED',name:'Denied mutation'})})
   const after=await dbRun(async db=>(await db.prepare('SELECT * FROM campaigns ORDER BY id').all()).results);assert.deepEqual(after,before);noWriteMutation=true
   const hostStatus=await new Promise((resolve,reject)=>{http.get(origin+'/health',{headers:{host:'foreign.invalid'}},response=>{let body='';response.on('data',chunk=>body+=chunk);response.once('end',()=>{publicResponses.push(JSON.stringify(response.headers)+'\n'+body);resolve(response.statusCode)})}).on('error',reject)})
   rows.push({mode:verb,control:'mismatched Host',path:'/health',method:'GET',expected:404,actual:hostStatus,match:hostStatus===404});assert.equal(hostStatus,404)
  }
  await stop(verb);captureText(modeOutput);capturedLogs.push({kind:verb+' CLI and Worker',body:modeOutput});modeCaptured=true
 }
 await capacity();await command(['export','--output','exports/private-scan.rer','--non-interactive'])
 const archive=await readFile(join(copy,'exports/private-scan.rer'),'utf8');archiveContents.push(archive)
 for(const line of archive.trim().split('\n'))for(const item of JSON.parse(line).items??[])if(item.kind==='object'||item.kind==='payload')archiveContents.push(Buffer.from(item.data,'base64').toString('utf8'))
 await writeFile(evidenceName('runtime-statuses.json'),JSON.stringify({sourceHead:(await execute('git',['rev-parse','HEAD'],{cwd:copy})).stdout.trim(),environment:'Node '+process.version+'; real rer setup/dev/preview; emitted local workerd',origin,artifact,eventResult,rows,noWriteMutation,diagnostics},null,2)+'\n')
 console.log(`Runtime boundary ${rows.every(row=>row.match)?'PASS':'FAIL'} ${rows.length} expected/actual rows; artifact exports and no-write mutations proved`)
 assert.ok(rows.every(row=>row.match),'Every expected/actual row must match; see runtime-statuses.json for divergences')
}finally{
 if(setupCapture&&!setupCapture.drained){if(setup.exitCode===null)setup.kill('SIGTERM');await setupCapture.close;setupOutput=setupCapture.output()}
 if(app){try{await stop(modeVerb)}catch{if(app.exitCode===null)app.kill('SIGTERM');await appCapture.close;modeOutput=appCapture.output();await diagnose(modeVerb+' cleanup',app,appCapture)}}
 await writeFile(evidenceName('runtime-partial-statuses.json'),JSON.stringify({origin,artifact,eventResult,rows,noWriteMutation,diagnostics,children:children.map(({child,capture})=>({pid:child.pid,exitCode:child.exitCode,closed:capture.drained}))},null,2)+'\n')
 if(setup&&!setupCaptured)capturedLogs.push({kind:'setup CLI and Worker incomplete',body:setupOutput})
 if(modeVerb&&!modeCaptured)capturedLogs.push({kind:modeVerb+' CLI and Worker incomplete',body:modeOutput})
 try{if(artifact)await scanEvidence(evidence,(await readSettings(copy,{file:'.dev.vars'})).values,issuedValues,publicResponses,capturedLogs,archiveContents)}finally{await rm(temp,{recursive:true,force:true})}
}
