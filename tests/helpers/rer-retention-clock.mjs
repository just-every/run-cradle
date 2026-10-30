import assert from 'node:assert/strict'
import {withRerEmittedWorker} from './rer-emitted-worker.mjs'
import {bindings} from './rer-data-fixture.mjs'
import {retentionRows} from './rer-retention.mjs'
/** Exercise the emitted scheduled handler on old retained records, with no network. */
export async function retainedThroughClock(copy,port){
 const inventory=await retentionRows(copy.source,'before-aged-scheduled-tick'),old='2000-01-01T00:00:00.000Z'
 const aged=await bindings(copy.source,async({DB})=>{
  const result=[]
  for(const table of inventory.filter(row=>row.rows&&row.retentionStore)){
   const column=(await DB.prepare('PRAGMA table_xinfo("'+table.table+'")').all()).results.find(column=>column.name==='created_at')
   if(!column){result.push({table:table.table,coverage:'no-created-at-clock-unexercised'});continue}
   const value=/INT/.test(column.type)?Date.parse(old):old
   await DB.prepare('UPDATE "'+table.table+'" SET created_at=?').bind(value).run()
   result.push({table:table.table,rows:table.rows,value})
  }
  return result
 })
 // The archive intentionally holds an active hourly Sheets source. Exercise
 // retention outside its provider-sync window, regardless of the wall clock.
 const tick=new Date();tick.setUTCMinutes(30,0,0)
 let calls=0;await withRerEmittedWorker(copy,'http://127.0.0.1:'+port,async runtime=>{const worker=await runtime.getWorker();const result=await worker.scheduled({cron:'* * * * *',scheduledTime:tick.getTime()});assert.equal(result.outcome,'ok')})
 await bindings(copy.source,async({DB})=>{for(const row of aged)if(row.rows!==undefined)assert.equal((await DB.prepare('SELECT count(*) n FROM "'+row.table+'" WHERE created_at=?').bind(row.value).first()).n,row.rows,'Aged retained rows survive scheduled tick: '+row.table)})
 console.log('RETENTION_CLOCK '+JSON.stringify({clock:tick.toISOString(),agedTo:old,externalCalls:calls,tables:aged.map(({value,...row})=>row)}))
 await retentionRows(copy.source,'after-aged-scheduled-tick')
}
