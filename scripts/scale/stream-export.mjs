import '../../tests/helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdir,writeFile,open} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {recordsImportBrowserRuntime} from '../../tests/helpers/records-import-browser-runtime.mjs'
import {workbookDoors} from '../../tests/helpers/workbook-http.mjs'
import {newField} from '../../src/ui/records/schema/templates.ts'
import {createUlid} from '../../src/core/shared/ids.ts'
import {encodeValues} from '../../src/domains/records/codec.server.ts'
import {writeWorkbook} from '../../src/domains/records/workbooks/write.ts'
const output=path.resolve(process.env.CRADLE_STREAM_OUTPUT??'.private/stream-export'),rows=50000,sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),result={sha,runId:'stream-export-'+new Date().toISOString(),rows,host:{platform:os.platform(),arch:os.arch(),node:process.version},hosted:'NOT RUN',measurements:[]}
await mkdir(output,{recursive:true});let h,socket,timer
try{
 assert.throws(()=>writeWorkbook([{name:'Before',headers:['Name'],rows:Array.from({length:10001},()=>[{type:'text',value:'synthetic-cradle-1'}])}]),/rows limit 10000/)
 result.before='Buffered workbook writer refuses 10001 rows; intake limits unchanged'
 h=await recordsImportBrowserRuntime(0);const d=await workbookDoors(h),appId=createUlid(),entityId=createUlid(),title=newField('Name'),amount=newField('Amount','number'),percent={...newField('Rate','number'),numberFormat:'percent'},approved=newField('Approved','boolean'),fields=[title,amount,percent,approved]
 const preview=await d.call('/api/v1/records/schema-preview',{appId,name:'synthetic-cradle-stream',tables:[{id:entityId,label:'synthetic-cradle-stream',primaryFieldId:title.id,fields}]});await d.command('release.adopt',{kind:'manual_schema',previewId:preview.id})
 const descriptor=(await h.descriptors()).get(appId,entityId),q=name=>'"'+name.replaceAll('"','""')+'"',stored=encodeValues(descriptor,{[amount.id]:'123.45',[percent.id]:'0.125'},false),columns=[descriptor.fields.get(title.id).column,...[amount,percent].flatMap(field=>{const s=descriptor.fields.get(field.id);return [s.column,s.sortColumn]}),descriptor.fields.get(approved.id).column],now=new Date().toISOString()
 for(let offset=0;offset<rows;offset+=1000){await h.db.prepare(`WITH RECURSIVE n(x) AS (SELECT ? UNION ALL SELECT x+1 FROM n WHERE x<?) INSERT INTO ${q(descriptor.table.tableId)}(id,version,created_at,updated_at,lifecycle,schema_version,${columns.map(q)}) SELECT printf('%026d',x+1),1,?,?,'active',1,'synthetic-cradle-'||printf('%06d',x),?,?,?,?,x%2 FROM n`).bind(offset,Math.min(rows-1,offset+999),now,now,...[amount,percent].flatMap(field=>{const s=descriptor.fields.get(field.id);return [stored[s.column],stored[s.sortColumn]]})).run()}
 assert.equal((await h.db.prepare(`SELECT count(*) n FROM ${q(descriptor.table.tableId)}`).first()).n,rows)
 const inspector=await h.runtime.getInspectorURL(),http=new URL(inspector);http.protocol='http:';http.pathname='/json/list';const targets=await(await fetch(http)).json(),target=targets.find(t=>t.id.includes('core:user:')&&!t.id.includes('assets'))
 assert.ok(target,'The actual user Worker inspector must be available for heap measurements');result.inspectorTarget=target.id
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})});let id=0;const pending=new Map();socket.addEventListener('message',event=>{const body=JSON.parse(String(event.data)),p=pending.get(body.id);if(p){pending.delete(body.id);body.error?p.reject(Error(body.error.message)):p.resolve(body.result)}})
 const call=method=>new Promise((resolve,reject)=>{const next=++id;pending.set(next,{resolve,reject});socket.send(JSON.stringify({id:next,method}))})
 await call('Runtime.enable')
 for(const format of ['csv','xlsx']){
  let samples=0,peakUsedHeapBytes=0,peakTotalHeapBytes=0,sampling=false,sampleError
  const sample=async()=>{if(sampling)return;sampling=true;try{const memory=await call('Runtime.getHeapUsage');samples++;peakUsedHeapBytes=Math.max(peakUsedHeapBytes,memory.usedSize);peakTotalHeapBytes=Math.max(peakTotalHeapBytes,memory.totalSize)}catch(error){sampleError=error}finally{sampling=false}}
  await sample();timer=setInterval(()=>void sample(),500)
  const csrf=(await(await fetch(h.origin+'/auth/csrf',{headers:{cookie:h.cookie}})).json()).csrfToken,started=performance.now(),response=await fetch(h.origin+'/api/v1/records/export-'+format,{method:'POST',headers:{cookie:h.cookie,origin:h.origin,'x-csrf-token':csrf,'content-type':'application/json',accept:format==='csv'?'text/csv':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},body:JSON.stringify({appId,entityId,query:{sort:[{fieldId:title.id,direction:'asc'}]}})})
  assert.equal(response.status,200);const file=path.join(output,'50000.'+format),sink=await open(file,'w'),reader=response.body.getReader();let bytes=0,chunks=0
  try{for(;;){const next=await reader.read();if(next.done)break;await sink.write(next.value);bytes+=next.value.length;chunks++}}finally{await sink.close();clearInterval(timer);timer=undefined}
  await sample();if(sampleError)throw sampleError;assert.ok(samples>1)
  const measurement={format,rows,bytes,chunks,elapsedMs:performance.now()-started,peakUsedHeapBytes,peakTotalHeapBytes,samples};result.measurements.push(measurement);console.log(JSON.stringify(measurement))
 }
 // Independent standard-library ZIP/XML/CSV readers: never widen Cradle's intake parser.
 const check=execFileSync('python3',['-c',`import csv,json,sys,zipfile,xml.etree.ElementTree as E
from pathlib import Path
p=Path(sys.argv[1]); rows=list(csv.reader((p/'50000.csv').open(newline=''))); assert len(rows)==50001; assert rows[1]==['synthetic-cradle-000000','123.45','0.125','No']; assert rows[-1][0]=='synthetic-cradle-049999'
with zipfile.ZipFile(p/'50000.xlsx') as z:
 assert z.testzip() is None
 root=E.fromstring(z.read('xl/worksheets/sheet1.xml')); ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}; data=root.findall('s:sheetData/s:row',ns); assert len(data)==50001
 assert data[1].findall('s:c',ns)[1].find('s:v',ns).text=='123.45'; assert data[1].findall('s:c',ns)[2].attrib['s']=='4'; assert data[-1].findall('s:c',ns)[0].find('s:is/s:t',ns).text=='synthetic-cradle-049999'
print(json.dumps({'csvRows':50000,'xlsxRows':50000,'zipChecksums':True,'typedValues':True}))`,output],{encoding:'utf8'});result.independent=JSON.parse(check);result.completed=true
}catch(error){result.completed=false;result.failure={message:error.message,stack:error.stack};console.error(error);process.exitCode=1}
finally{if(timer)clearInterval(timer);socket?.close();await h?.close();await writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2)+'\n')}
