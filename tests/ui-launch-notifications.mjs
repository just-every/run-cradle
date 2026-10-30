import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {contract} from './contract.mjs'
import {stringifySafeEvidence} from './helpers/accessibility-redaction.mjs'
import {accessibilityWidths} from './helpers/accessibility-evidence.mjs'

contract('NOTIFY-001 NOTIFY-002 NOTIFY-003 NOTIFY-005 NOTIFY-006 NOTIFY-007 NOTIFY-009 CAMP-006','notification preferences, real delivery events and inbox retention and erasure at desktop and phone',async()=>{
 const output=path.resolve(process.env.CRADLE_LAUNCH_NOTIFICATIONS_EVIDENCE ?? '../evidence/de-launch-notifications')
 await mkdir(output,{recursive:true})
 // Each width already owns fresh Workers, databases, browsers and provider
 // histories. Separate processes also isolate provider edges and the recovery
 // journey's owned-workerd interruption. Each Worker binds an OS-assigned port.
 const results=await Promise.allSettled(accessibilityWidths.map(width=>new Promise((resolve,reject)=>{
  const started=performance.now()
  const child=spawn(process.execPath,[fileURLToPath(new URL('./helpers/launch-notifications-width.mjs',import.meta.url)),String(width),output],{
   stdio:'inherit',
  })
  child.once('error',reject)
  child.once('close',(code,signal)=>{
   console.log(`NOTIFICATION_WIDTH width=${width} seconds=${((performance.now()-started)/1000).toFixed(3)}`)
   if(code===0)resolve()
   else reject(Error(`Notification width ${width} failed: exit=${code} signal=${signal}`))
  })
 })))
 // Wait for every child to close so a failed sibling never abandons a browser
 // or Worker. Fail before reading receipts left by an earlier invocation.
 for(const result of results)if(result.status==='rejected')throw result.reason
 const receipts=await Promise.all(accessibilityWidths.map(width=>readFile(path.join(output,`receipt-${width}.json`),'utf8').then(JSON.parse)))
 const receipt={...receipts[0]}
 for(const key of ['screens','viewports','errors','consoleEvents','consoleErrors','expectedConsoleErrors','unexpectedConsoleErrors','external'])receipt[key]=receipts.flatMap(item=>item[key])
 assert.deepEqual(receipt.viewports,accessibilityWidths,'Every notification assertion ran at every requested width')
 await writeFile(path.join(output,'receipt.json'),stringifySafeEvidence(receipt))
 console.log(`Launch notification walkthrough passed ${receipt.screens.length} real-runtime screens`)
})
