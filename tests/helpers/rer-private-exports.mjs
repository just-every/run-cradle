import assert from 'node:assert/strict'
import {csvDownloadEntries} from './base-csv-download.mjs'
import {hasIdentityCopy} from './rer-source-erasure.mjs'
/** Scan actual owner downloads, including decoded JSON contents. */
export async function privateExports({origin,cookie,csrfToken,records},stage){
 const headers={cookie,origin,'content-type':'application/json','x-csrf-token':csrfToken}
 const scan=text=>assert.ok(!hasIdentityCopy(text),'Owner export contains no erased identity')
 const json=await fetch(origin+'/api/v1/records/base-export',{method:'POST',headers,body:JSON.stringify({appId:records.appId,format:'json'})});assert.equal(json.status,200)
 const content=(await json.json()).data.content,document=JSON.parse(content);scan(content);scan(JSON.stringify(document))
 const zipResponse=await fetch(origin+'/api/v1/records/base-export',{method:'POST',headers,body:JSON.stringify({appId:records.appId,format:'csv-set'})});assert.equal(zipResponse.status,200,'Owner CSV-set download')
 const zipData=(await zipResponse.json()).data;assert.equal(zipData.encoding,'base64');const zip=Buffer.from(zipData.content,'base64'),entries=csvDownloadEntries(zip)
 for(const entry of entries){scan(entry.name);const text=entry.bytes.toString('utf8');scan(text);if(entry.name.endsWith('.json'))scan(JSON.stringify(JSON.parse(text)))}
 const manualCsv=[]
 for(const table of document.base.tables){
  const response=await fetch(origin+'/api/v1/records/export-csv',{method:'POST',headers,body:JSON.stringify({appId:records.appId,entityId:table.id,query:{}})});assert.equal(response.status,200,'Owner manual-table CSV download')
  const data=(await response.json()).data;scan(data.csv);manualCsv.push({entityId:table.id,rows:data.count,bytes:Buffer.byteLength(data.csv)})
 }
 const counts=[]
 for(const entityId of ['00000000000000000000000701','00000000000000000000000702','00000000000000000000000703','00000000000000000000000704','00000000000000000000000705']){
  const response=await fetch(origin+'/api/v1/records/export-csv',{method:'POST',headers,body:JSON.stringify({appId:'00000000000000000000000700',entityId,query:{}})});assert.equal(response.status,200,'Owner launch CSV download')
  const data=(await response.json()).data;scan(data.csv);counts.push({entityId,rows:data.count,bytes:Buffer.byteLength(data.csv)})
 }
 console.log('PUBLIC_EXPORT_PRIVACY '+JSON.stringify({stage,jsonBytes:Buffer.byteLength(content),csv:counts,manualCsv,csvSet:{bytes:zip.length,entries:entries.map(entry=>({name:entry.name,bytes:entry.bytes.length}))},originalNameMatches:0,originalEmailMatches:0}))
}
