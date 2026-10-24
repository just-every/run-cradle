import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createUlid,LAUNCH_APP_ID,launchEntities,launchFieldIds} from './launch-authority-runtime.mjs'
import {parseCsv} from '../../src/domains/portability/csv.ts'
import {warehouseFiles} from '../../src/domains/warehouse/file-format.server.ts'

/** A genuine accepted R2 part and durable invocation custody model a transfer
 * cut. Bytes come from a fresh public export after a public record edit, including
 * every changed/computed cell. Only interrupted lease/session state is a fixture;
 * the restarted Worker resumes through its real scheduled public door. */
export async function warehouseR2Restart(doors,{id,record,originalKey,format,at,resume}){
 const h=doors.h,current=await h.db.prepare('SELECT id,version FROM campaigns WHERE id=?').bind(record.id).first()
 await doors.commit('launch.campaign.patch',{id:record.id,changes:{name:'Warehouse recovered record'}},doors.ref('campaign',current))
 const retained=await h.db.prepare('SELECT metadata_json FROM warehouse_objects WHERE object_key=?').bind(originalKey).first(),metadata=JSON.parse(retained.metadata_json)
 const response=await doors.call('/api/v1/records/export-csv',{method:'POST',body:JSON.stringify({appId:LAUNCH_APP_ID,entityId:launchEntities.campaign,query:{fields:metadata.columns.map(column=>column.fieldId),filter:{kind:'condition',fieldId:launchFieldIds.campaign.name,op:'eq',value:'Warehouse recovered record'}}})})
 assert.equal(response.status,200,JSON.stringify(response.body))
 const source=parseCsv(new TextEncoder().encode(response.body.data.csv));assert.equal(source.rows.length,1,'The fresh public export captures exactly the edited row')
 assert.deepEqual(source.headers,metadata.columns.map(column=>column.label))
 const fields=metadata.columns.map((column,index)=>({id:column.fieldId,label:column.label,type:metadata.columnTypes[index+2]==='DOUBLE'?'number':metadata.columnTypes[index+2]==='BOOLEAN'?'boolean':'text',required:false,unique:false}))
 const file=warehouseFiles(metadata.headers,[[record.id,'upsert',...source.rows[0]]],fields,format,false)[0]
 const body=typeof file.body==='string'?new TextEncoder().encode(file.body):new Uint8Array(file.body)
 assert.ok(body.byteLength>1048576,'The actual edited source remains above the old transfer budget')
 metadata.recordIds=[record.id]
 const key=`${id}/${LAUNCH_APP_ID}/${launchEntities.campaign}/${at}-incr.${format}`,bucket=await h.runtime.getR2Bucket('WAREHOUSE')
 const upload=await bucket.createMultipartUpload(key,{httpMetadata:{contentType:format==='csv'?'text/csv; charset=utf-8':'application/vnd.apache.parquet'}})
 await upload.uploadPart(1,body)
 const uploadId=upload.uploadId,runId=createUlid(),startedAt=new Date(Date.now()-300001).toISOString()
 assert.equal(await bucket.head(key),null,'An accepted multipart part is not yet a completed object')
 const revision=(await h.db.prepare("SELECT COALESCE(MAX(rowid),0) n FROM command_admissions WHERE state='committed'").first()).n
 const before=(await h.db.prepare('SELECT watermark_json FROM warehouse_exports WHERE id=?').bind(id).first()).watermark_json
 await h.db.batch([
  h.db.prepare("INSERT INTO warehouse_objects(object_key,export_id,run_id,created_at,destination_json,sealed_json,metadata_json,dispatch_state,transfer_json) VALUES(?,?,?,?,?,NULL,?,'prepared',?)").bind(key,id,runId,startedAt,JSON.stringify({kind:'r2'}),JSON.stringify(metadata),JSON.stringify({r2:{uploadId,sha256:createHash('sha256').update(body).digest('hex')}})),
  h.db.prepare('UPDATE warehouse_exports SET running_id=?,running_started_at=?,running_at=?,running_slot=?,running_revision=? WHERE id=?').bind(runId,startedAt,at,at.slice(0,13),revision,id),
  h.db.prepare('INSERT INTO lifecycle_file_writes(id,object_key,started_at) VALUES(?,?,?)').bind(createUlid(),'warehouse:'+id,startedAt),
 ])
 await h.restart()
 assert.equal((await h.db.prepare('SELECT watermark_json FROM warehouse_exports WHERE id=?').bind(id).first()).watermark_json,before,'Worker interruption cannot advance the R2 watermark')
 await resume()
 const live=await h.runtime.getR2Bucket('WAREHOUSE'),recovered=await live.get(key);assert.ok(recovered,'The scheduled door completes the original object identity')
 assert.ok(Buffer.from(await recovered.arrayBuffer()).equals(Buffer.from(body)),'Recovered bytes equal every cell in the fresh public source capture')
 assert.equal((await h.db.prepare('SELECT transfer_json FROM warehouse_objects WHERE object_key=?').bind(key).first()).transfer_json,'{}','Completed R2 transfer retires session custody')
 await assert.rejects(()=>live.resumeMultipartUpload(key,uploadId).uploadPart(1,new Uint8Array([1])),/does not exist|NoSuchUpload|not found|already completed|10024/i,'The original multipart upload is finished, not abandoned beside a replacement')
 assert.equal((await h.db.prepare('SELECT count(*) n FROM lifecycle_file_writes WHERE object_key=?').bind('warehouse:'+id).first()).n,0,'Recovery releases the interrupted file reservation')
}
