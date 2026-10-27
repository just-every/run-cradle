import {mkdir,mkdtemp,open,readFile} from 'node:fs/promises'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {tmpdir} from 'node:os'
import path from 'node:path'
const run=promisify(execFile)
export async function freshLocalCopy(){
 await mkdir('tmp',{recursive:true})
 const root=await mkdtemp(path.join(tmpdir(),'cradle-rer-')),source=path.join(root,'source')
 await run('git',['clone','--quiet','--no-hardlinks',process.cwd(),source])
 await run('git',['config','user.name','Run Edit Run fleet'],{cwd:source})
 await run('git',['config','user.email','local-signin'],{cwd:source})
 console.log('FIXTURE_HEAD '+JSON.stringify({installation:source,head:(await run('git',['rev-parse','HEAD'],{cwd:source})).stdout.trim()}))
 const log=await open(path.join(root,'journey.log'),'wx',0o600)
 // A fresh repository acquires its own operation; the verifier's token belongs
 // to the original checkout and must not authorize this separate installation.
 const environment={...process.env,CI:'true',RER_SERVER_JOURNEY:'1',WRANGLER_SEND_METRICS:'false'}
 delete environment.RER_LOCAL_OPERATION
 const execute=async(program,args,overrides={})=>{
  try{
   const result=await run(program,args,{cwd:source,env:{...environment,...overrides},maxBuffer:16*1024*1024})
   await log.writeFile(result.stdout+result.stderr)
   console.log('RECOVERY_COMMAND '+JSON.stringify({installation:source,program:program===process.execPath?'node':program,args,exitCode:0}))
  }catch(error){
   await log.writeFile(error.stdout+error.stderr)
   console.log('RECOVERY_COMMAND '+JSON.stringify({installation:source,program:program===process.execPath?'node':program,args,exitCode:Number(error.code)}))
   const events=(error.stdout??'').split('\n').flatMap(line=>{try{const event=JSON.parse(line);return event.event==='error'?[event]:[]}catch{return[]}})
   const message=events[0]?.message??'',reason=/Archive operation refused or failed \(([a-zA-Z_]+(?::[a-zA-Z_]+)?(?:; [a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)?)/.exec(message)?.[1]
   const errorLocation=/; file ([A-Za-z0-9_-]{1,128})(?:[; )]|$)/.exec(message)?.[1]
   const frames=[...message.matchAll(/(?:catalogue|copies|export|import|storage|format|worker|files|generated)\.mjs:\d+/g)].map(match=>match[0])
   throw Object.assign(new Error(`Fresh clone ${args[1]??'command'} exited ${error.code??'unknown'}${events.length?': '+events.map(event=>event.code).join(', '):''}${reason?' ('+reason+(frames.length?' at '+frames.join(', '):'')+')':''}.`),{exitCode:Number(error.code),errorCode:events[0]?.code,errorLocation})
  }
 }
 // Package mode: rer is the clone's locked devDependency, so the copy installs before its first rer verb.
 await execute('pnpm',['install','--frozen-lockfile'])
 return {root,source,log,environment,node:(args)=>execute(process.execPath,args),command:(args,env)=>execute('pnpm',args,env),rer:(args)=>execute(process.execPath,['node_modules/@runeditrun/rer/bin/rer.mjs',...args,'--json']),readVars:async()=>Object.fromEntries((await readFile(path.join(source,'.dev.vars'),'utf8')).trim().split('\n').map(line=>{const i=line.indexOf('=');let value=line.slice(i+1);if(value.startsWith('"'))value=JSON.parse(value);return[line.slice(0,i),value]}))}
}
