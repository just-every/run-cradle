import {mkdir, open, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

const providerKey='test-only-sendgrid-mail-edge'
function captureDirectory(port){
 if(!/^\d+$/.test(String(port))||Number(port)<1||Number(port)>65535)throw new Error('Mail fixture requires its explicit listener port')
 return join(tmpdir(),`cradle-test-mail-${port}`)
}
const capturePath=port=>join(captureDirectory(port),'messages.ndjson')

/** Test-only provider edge: the real Worker serializes and sends every message. */
export async function createFixtureMail(port,otherNetworkEdge,mailResponse){
 const directory=captureDirectory(port)
 await mkdir(directory,{mode:0o700})
 let file
 try{file=await open(capturePath(port),'wx',0o600)}catch(error){await rm(directory,{recursive:true,force:true});throw error}
 let pending=Promise.resolve(),closing
 return {
  bindings:{MAIL_PROVIDER:'sendgrid',MAIL_PROVIDER_API_KEY:providerKey},
  async fetch(request){
   if(request.url!=='https://api.sendgrid.com/v3/mail/send'){
    if(otherNetworkEdge)return otherNetworkEdge(request)
    throw new Error('Unexpected external request blocked by test mail edge')
   }
   if(request.method!=='POST'||request.headers.get('authorization')!==`Bearer ${providerKey}`)throw new Error('Test mail edge received an invalid provider request')
   const message=await request.json()
   const write=pending.then(()=>file.writeFile(JSON.stringify(message)+'\n'))
   pending=write
   await write
   if(mailResponse){const response=await mailResponse(message);if(response)return response}
   return new Response(null,{status:202,headers:{'x-message-id':crypto.randomUUID()}})
  },
  close(){return closing??=(async()=>{
   try{await pending}finally{try{await file.close()}finally{await rm(directory,{recursive:true,force:true})}}
  })()}
 }
}

/** No app route exposes these private, test-process-owned provider captures. */
export async function fixtureMessages(origin){
 let contents
 try{contents=await readFile(capturePath(new URL(origin).port),'utf8')}
 catch{throw new Error('Test mail capture is unavailable for this fixture port')}
 try{return contents.trim()?contents.trim().split('\n').map(line=>JSON.parse(line)):[]}
 catch{throw new Error('Test mail capture is incomplete')}
}
