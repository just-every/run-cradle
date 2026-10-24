import assert from 'node:assert/strict'
import {baseExportHttp} from '../../src/domains/records/base-transfer/export-http.server.ts'
import {createBaseExport} from '../../src/domains/records/base-transfer/export-json.server.ts'
import {exportCsvSet} from '../../src/domains/records/base-transfer/export-csv-set.ts'
import {exportBaseWorkbook} from '../../src/domains/records/workbooks/export.ts'
import {readWorkbook} from '../../src/domains/records/workbooks/read.ts'
import {unzipWorkbook} from '../../src/domains/records/workbooks/zip.ts'

/** All complete exit formats cross their public HTTP door and retain typed returns. */
export async function baseStreamExits(h,r,snapshot){
 const app=baseExportHttp(createBaseExport(h.db,r.services),async()=>h.ctx),origin='https://base-exits.example.test'
 async function request(format,accept){return app.fetch(new Request(origin+'/api/v1/records/base-export',{method:'POST',headers:{origin,'content-type':'application/json',...(accept?{accept}:{})},body:JSON.stringify({appId:snapshot.base.id,format})}))}
 for(const format of ['json','xlsx','csv-set']){
  const response=await request(format,format==='json'?'application/json':undefined);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const envelope=await response.json(),content=envelope.data.content
  if(format==='json')assert.deepEqual(JSON.parse(content),snapshot,'Streaming JSON retains complete records, references, views and forms')
  else if(format==='xlsx')assert.deepEqual(readWorkbook(Buffer.from(content,'base64'),'streamed.xlsx'),readWorkbook(Buffer.from(exportBaseWorkbook(snapshot).content,'base64'),'expected.xlsx'),'Streaming workbook keeps all typed native and incoming cells')
  else{
   const files=unzipWorkbook(Buffer.from(content,'base64'),'csv-set.xlsx'),expected=exportCsvSet(snapshot)
   for(const file of expected.files)assert.equal(new TextDecoder().decode(files.get(file.filename)),file.csv)
   assert.deepEqual(JSON.parse(new TextDecoder().decode(files.get('correspondence.json'))),expected.correspondence,'Streaming correspondence retains exact hashes, ordered identities, links and empty-cell states')
   assert.deepEqual(JSON.parse(new TextDecoder().decode(files.get('import-options.json'))),expected.options)
  }
 }
 const binary=await request('json','application/vnd.cradle.base+json');assert.equal(binary.status,200);assert.match(binary.headers.get('content-disposition'),/attachment/);assert.deepEqual(await binary.json(),snapshot)
 await baseStreamInterruption(h,r,snapshot.base.id)
}

/** Controlled public response consumption proves revocation before stream completion. */
export async function baseStreamInterruption(h,r,appId){
 const origin='https://base-exits.example.test',app=baseExportHttp(createBaseExport(h.db,r.services),async()=>h.ctx)
 const response=await app.fetch(new Request(origin+'/api/v1/records/base-export',{method:'POST',headers:{origin,'content-type':'application/json',accept:'application/vnd.cradle.base+json'},body:JSON.stringify({appId,format:'json'})}))
 const reader=response.body.getReader()
 await reader.read();await reader.read();await reader.read()
 const policies=(await h.db.prepare('SELECT id,version FROM authority_policies WHERE app_id=?').bind(appId).all()).results
 try{
  await h.db.prepare('UPDATE authority_policies SET version=version+1 WHERE app_id=?').bind(appId).run()
  await assert.rejects(async()=>{while(!(await reader.read()).done){}},/authority|changed|stale/i,'An authority change prevents a complete streamed base download')
 }finally{for(const policy of policies)await h.db.prepare('UPDATE authority_policies SET version=? WHERE id=?').bind(policy.version,policy.id).run()}

}
