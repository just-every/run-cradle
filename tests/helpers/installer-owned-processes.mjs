import {execFileSync} from 'node:child_process'
import {setTimeout} from 'node:timers/promises'
import {processInfo} from '../../node_modules/@runeditrun/rer/modules/job-queue/processes.mjs'
import {launchPath,liveWorker,serverRecord} from '../../node_modules/@runeditrun/rer/global/launch/state.mjs'

/** End only the processes recorded for this disposable installer checkout. */
export async function stopOwnedInstaller(copy,child){
 const directory=launchPath(copy.source,copy.environment)
 const worker=await liveWorker(directory),server=await serverRecord.read(directory)
 const roots=[]
 for(const record of [worker,server,server?.spawned]){
  if(!record?.pid||!record.start)continue
  const current=await processInfo(record.pid)
  if(current&&!current.zombie&&current.start===record.start)roots.push(record.pid)
 }
 if(child.exitCode===null&&child.signalCode===null)roots.push(child.pid)
 const rows=execFileSync('ps',['-axo','pid=,ppid='],{encoding:'utf8'}).trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number))
 const owned=new Set(roots)
 for(let changed=true;changed;){changed=false;for(const [pid,parent]of rows)if(owned.has(parent)&&!owned.has(pid)){owned.add(pid);changed=true}}
 const identities=[]
 for(const pid of owned){const info=await processInfo(pid);if(info&&!info.zombie)identities.push({pid,start:info.start})}
 async function signal(name){for(const record of identities){const current=await processInfo(record.pid);if(current&&!current.zombie&&current.start===record.start)try{process.kill(record.pid,name)}catch(error){if(error.code!=='ESRCH')throw error}}}
 await signal('SIGTERM')
 for(let step=0;step<50;step++){
  const alive=await Promise.all(identities.map(async record=>{const current=await processInfo(record.pid);return current&&!current.zombie&&current.start===record.start}))
  if(!alive.some(Boolean))return
  await setTimeout(100)
 }
 await signal('SIGKILL')
}
