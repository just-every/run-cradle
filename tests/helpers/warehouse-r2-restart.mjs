import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFile} from 'node:fs/promises'

/** Pause the real emitted R2 writer after an accepted part and before complete,
 * terminate its Worker, then recover through the public scheduled door. The
 * inspector changes no application values or production control flow. */
export async function warehouseR2Restart(doors,{id,at,trigger,resume,actorId}){
 const h=doors.h,WebSocket=createRequire(import.meta.resolve('miniflare'))('ws'),inspector=await h.runtime.getInspectorURL();inspector.protocol='http:';inspector.pathname='/json/list'
 const targets=await(await fetch(inspector)).json(),target=targets.find(value=>value.id.endsWith(h.workerName));assert.ok(target)
 const socket=new WebSocket(target.webSocketDebuggerUrl,{headers:{origin:'http://localhost'}}),pendingCommands=new Map();let sequence=0,paused
 const reached=new Promise(resolve=>paused=resolve)
 socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const pending=pendingCommands.get(message.id);pendingCommands.delete(message.id);if(message.error)pending?.reject(new Error(message.error.message));else pending?.resolve(message.result)}if(message.method==='Debugger.paused')paused(message.params)})
 await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})})
 const send=(method,params={})=>new Promise((resolve,reject)=>{const command=++sequence;pendingCommands.set(command,{resolve,reject});socket.send(JSON.stringify({id:command,method,params}))})
 await send('Debugger.enable')
 const source=(await readFile(new URL('../../dist/server/index.js',import.meta.url),'utf8')).split('\n'),start=source.findIndex(line=>line.includes('Interrupted R2 source changed')),lineNumber=source.findIndex((line,index)=>index>start&&line.includes('await upload.complete(parts)'))
 assert.ok(start>=0&&lineNumber>start)
 const breakpoint=await send('Debugger.setBreakpointByUrl',{urlRegex:'(?:^|/)index[.]js$',lineNumber})
 assert.ok(breakpoint.locations.length,'The breakpoint resolves in the actual emitted multipart writer')
 const before=(await h.db.prepare('SELECT watermark_json FROM warehouse_exports WHERE id=?').bind(id).first()).watermark_json
 const pending=trigger().then(result=>({result}),error=>({error}))
 try{await reached;await h.restart()}finally{socket.close()}
 const interrupted=await pending;assert.ok(interrupted.error||interrupted.result?.outcome!=='ok','A terminated multipart writer cannot report completion')
 const retained=await h.db.prepare('SELECT running_id,watermark_json FROM warehouse_exports WHERE id=?').bind(id).first()
 assert.ok(retained.running_id);assert.equal(retained.watermark_json,before,'R2 interruption cannot advance its watermark')
 const rows=(await h.db.prepare('SELECT object_key,transfer_json FROM warehouse_objects WHERE export_id=? AND run_id=?').bind(id,retained.running_id).all()).results,custody=rows.find(row=>JSON.parse(row.transfer_json).r2)
 assert.ok(custody,'The real upload identity survives Worker termination')
 const uploadId=JSON.parse(custody.transfer_json).r2.uploadId
 await h.db.prepare('UPDATE warehouse_exports SET running_started_at=? WHERE id=?').bind(new Date(Date.now()-300001).toISOString(),id).run()
 await h.db.prepare("UPDATE authority_credentials SET expires_at=? WHERE audience='warehouse-internal' AND principal_id=?").bind(Date.now()-1,actorId).run()
 await resume()
 const live=await h.runtime.getR2Bucket('WAREHOUSE');assert.ok(await live.head(custody.object_key),'Scheduled recovery completes the original object identity')
 assert.equal((await h.db.prepare('SELECT transfer_json FROM warehouse_objects WHERE object_key=?').bind(custody.object_key).first()).transfer_json,'{}','Completed R2 transfer retires session custody')
 await assert.rejects(()=>live.resumeMultipartUpload(custody.object_key,uploadId).uploadPart(1,new Uint8Array([1])),/does not exist|NoSuchUpload|not found|already completed|10024/i,'The original upload is finished, not abandoned beside a replacement')
 assert.equal((await h.db.prepare('SELECT count(*) n FROM lifecycle_file_writes WHERE object_key=?').bind('warehouse:'+id).first()).n,0,'Recovery releases the interrupted file reservation')
 return at
}
