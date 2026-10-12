import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {mkdtemp,symlink,writeFile,readFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir,loadavg} from 'node:os'
import {createServer} from 'node:net'
import {checkoutDevKey} from '../../tests/helpers/dev-gate.mjs'
import {readSettings} from '../base-onboarding/adapter-settings.mjs'
import {scanEvidence} from './runtime-secret-scan.mjs'
// Actual install/export proof, independent of source-dev startup admission.
const execute=promisify(execFile),root=process.cwd(),evidence=process.env.CRADLE_EVIDENCE
assert.ok(evidence);assert.ok(loadavg()[0]<=36)
const temporary=await mkdtemp(join(tmpdir(),'cradle-archive-secret-')),copy=join(temporary,'source')
const logs=[],archiveContents=[],env={...process.env,CI:'true',RER_SERVER_JOURNEY:'1',WRANGLER_SEND_METRICS:'false'}
delete env.RER_LOCAL_OPERATION
const run=async args=>{try{const result=await execute(process.execPath,['scripts/rer.mjs',...args,'--json'],{cwd:copy,env,maxBuffer:32*1024*1024});logs.push({kind:'rer '+args[0],body:result.stdout+result.stderr});return result}catch(error){logs.push({kind:'rer '+args[0]+' failed',body:String(error.stdout??'')+String(error.stderr??'')});throw Error('Actual archive proof command failed; raw child output withheld')}}
let values,key,completed=false
try{
 await execute('git',['clone','--quiet','--no-hardlinks',root,copy]);await symlink(join(root,'node_modules'),join(copy,'node_modules'))
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve))
 await writeFile(join(copy,'answers.json'),JSON.stringify({OWNER_EMAIL:'maya@northstar.example'}),{mode:0o600})
 await run(['setup','--answers','answers.json','--port',String(port),'--non-interactive'])
 values=(await readSettings(copy,{file:'.dev.vars'})).values;key=await checkoutDevKey(copy)
 assert.ok(loadavg()[0]<=36)
 await run(['export','--output','private-scan.rer','--non-interactive'])
 const archive=await readFile(join(copy,'private-scan.rer'),'utf8');archiveContents.push(archive)
 for(const line of archive.trim().split('\n'))for(const item of JSON.parse(line).items??[])if(item.kind==='object'||item.kind==='payload')archiveContents.push(Buffer.from(item.data,'base64').toString('utf8'))
 await scanEvidence(evidence,values,[key],[],logs,archiveContents)
 completed=true
 console.log('Actual setup/export archive secret proof PASS; values retained only in memory')
}finally{
 await rm(temporary,{recursive:true,force:true})
 await writeFile(join(evidence,(process.env.CRADLE_EVIDENCE_PREFIX??'')+'runtime-archive-receipt.json'),JSON.stringify({head:(await execute('git',['rev-parse','HEAD'],{cwd:root})).stdout.trim(),completed,archiveSegments:archiveContents.length,temporaryRemoved:true,privateValuesPrinted:false,scope:'Actual fresh setup settings and checkout dev key; raw JSON archive and decoded object/payload bytes. Issued session/CSRF values remain in the separate full runtime receipt.'},null,2)+'\n')
}
