import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {contract} from './contract.mjs'
import {userAutomationRuntime} from './helpers/user-automation-runtime.mjs'
import {prepareFixture} from './helpers/records-import-fixture.mjs'
import {csvFiles,adoptUpload,adopt,reviewRecordedSource,jobAction,finish,rekeyedPortable} from './helpers/import-effects.mjs'
import {parseBaseCsv} from '../src/domains/records/base-transfer/parse.ts'

const jobs='/api/v1/records/base-import/jobs/'
const fixtureRoot=new URL('./fixtures/base-transfer/',import.meta.url)
/** Compare the receipt with the handwritten fixture expectation, never with the importer's own report. */
function assertAgainstTruth(receipt,fixture,format){
 for(const table of fixture.mapping.tables){
  const actual=receipt.tables.find(t=>t.tableKey===fixture.tableKey(table)),expected=fixture.expected.rowsByTable.find(t=>t.tableKey===table.key)
  assert.deepEqual({rowsRead:actual.rowsRead,created:actual.created,rejected:actual.rejected},{rowsRead:expected.rowsRead,created:expected.created,rejected:expected.rejected},table.key)
  assert.equal(actual.rejections.length,expected.rejected)
  if(format==='csv')assert.deepEqual(actual.sourceFiles,[table.csvFile])
  for(const field of table.fields){
   const accounting=fixture.expected.columnAccounting.find(c=>c.fieldKey===`${table.key}.${field.key}`)
   if(accounting?.linkRefsRead!==undefined){const link=actual.links.find(l=>l.column===field.csvColumn||l.column===field.label);if(link)assert.equal(link.referencesRead,accounting.linkRefsRead,field.key)}
   if(['formula','rollup','multipleAttachments','multipleSelects','button'].includes(field.sourceType)){
    const declared=actual.declaredColumns.find(c=>c.column===field.label||c.column===field.csvColumn);assert.ok(declared,`${table.key}.${field.key} is listed as a declared column`)
    assert.deepEqual({skipped:declared.skipped,converted:declared.converted},{skipped:accounting.skippedNonempty,converted:accounting.converted},field.key)
   }
  }
 }
 const links=receipt.tables.flatMap(t=>t.links).reduce((sum,l)=>({linkRefsRead:sum.linkRefsRead+l.referencesRead,resolved:sum.resolved+l.resolved,unresolved:sum.unresolved+l.unresolved,ambiguous:sum.ambiguous+l.ambiguous}),{linkRefsRead:0,resolved:0,unresolved:0,ambiguous:0})
 for(const key of Object.keys(links))assert.equal(links[key],fixture.expected.linkAccounting[key],key)
 assert.ok(receipt.notCarried.length>0&&receipt.notCarried.every(line=>line.choices.length===3))
 assert.ok(receipt.exits.length===4&&receipt.roundTripNote)
}
async function manifest(h,jobId,tableKey,columnKey){
 const response=await fetch(h.origin+`${jobs}${jobId}/attachment-manifest.csv?table=${encodeURIComponent(tableKey)}&column=${encodeURIComponent(columnKey)}`,{headers:{cookie:h.cookie}})
 assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/^attachment;/)
 const parsed=parseBaseCsv(new Uint8Array(await response.arrayBuffer()),'manifest.csv',20)
 return parsed.rows.map(row=>Object.fromEntries(row.cells.map((cell,i)=>[parsed.headers[i],cell])))
}

contract('RECORDS-005','move-in receipt and skipped-attachment manifest come from the retained job for CSV, recorded API and JSON imports, partial and undone',async()=>{
 const h=await userAutomationRuntime(0)
 try {
  const receipt=async id=>(await h.request(`${jobs}${id}/receipt.json`)).data
  // CSV set: partial, applied, undone.
  const csv=await prepareFixture('project-tracker','csv'),first=await adoptUpload(h,await csvFiles('project-tracker'),csv.preview.options)
  await jobAction(h,first.job.id,'resume')
  const partial=await receipt(first.job.id),pending=partial.tables.reduce((n,t)=>n+(t.notYetApplied?.records??0),0),pendingLinks=partial.tables.reduce((n,t)=>n+(t.notYetApplied?.linkCells??0),0)
  assert.equal(partial.job.state,'partial')
  assert.ok(pending+pendingLinks>0,'A partial job names what is not yet applied')
  assert.equal(pending,partial.progress.plannedRecords-partial.progress.appliedRecords)
  assert.equal(pendingLinks,partial.progress.plannedLinkCells-partial.progress.appliedLinkCells)
  await finish(h,first.job.id,'resume','completed')
  const applied=await receipt(first.job.id)
  assert.equal(applied.job.state,'applied');assert.equal(applied.reconciliation.ok,true);assert.equal(applied.source.kind,'csv-set')
  assert.deepEqual(applied.source.files.map(f=>f.name).sort(),csv.manifest.csvFiles.map(f=>f.path.slice(4)).sort())
  assertAgainstTruth(applied,csv,'csv')
  const download=await fetch(h.origin+`${jobs}${first.job.id}/receipt.json?download=1`,{headers:{cookie:h.cookie}})
  assert.match(download.headers.get('content-disposition'),/^attachment;/)
  const {generatedAt:_a,job:{stateAsOf:_b,...downloadedJob},...downloaded}=await download.json(),{generatedAt:_c,job:{stateAsOf:_d,...shownJob},...shown}=applied
  assert.deepEqual({...downloaded,job:downloadedJob},{...shown,job:shownJob},'The download carries the same facts as the page')
  const tasks=csv.mapping.tables.find(t=>t.key==='tasks'),attachmentKey=csv.columnKey(tasks,tasks.fields.find(f=>f.key==='attachments'))
  const csvLines=await manifest(h,first.job.id,csv.tableKey(tasks),attachmentKey)
  assert.equal(csvLines.length,csv.expected.columnAccounting.find(c=>c.fieldKey==='tasks.attachments').skippedNonempty)
  assert.ok(csvLines.every(line=>line.parsed==='no'),'Bare file names without a URL are not parsed')
  await finish(h,first.job.id,'undo','undone')
  assert.equal((await receipt(first.job.id)).job.state,'undone')

  // Recorded API pages.
  const api=await prepareFixture('project-tracker','api'),apiJob=await adopt(h,await reviewRecordedSource(h,api.preview))
  await finish(h,apiJob.id,'resume','completed')
  const apiReceipt=await receipt(apiJob.id);assertAgainstTruth(apiReceipt,api,'api')
  const apiTasks=api.mapping.tables.find(t=>t.key==='tasks'),apiLines=await manifest(h,apiJob.id,api.tableKey(apiTasks),api.columnKey(apiTasks,apiTasks.fields.find(f=>f.key==='attachments')))
  const apiTruth=(await Promise.all(['tasks-page-1.json','tasks-page-2.json'].map(async page=>JSON.parse(await readFile(new URL('project-tracker/api/'+page,fixtureRoot),'utf8')).records))).flat().filter(r=>r.fields.Attachments)
  assert.deepEqual(apiLines.map(line=>JSON.parse(line['file names'])),apiTruth.map(r=>r.fields.Attachments.map(a=>a.filename)))
  assert.deepEqual(apiLines.map(line=>JSON.parse(line['source urls'])),apiTruth.map(r=>r.fields.Attachments.map(a=>a.url)))

  // Native JSON: counts match the independently authored portable base.
  const {portable}=rekeyedPortable()
  const json=await adoptUpload(h,[{name:'business.cradle.json',bytes:Buffer.from(JSON.stringify(portable))}],{name:portable.base.name})
  await finish(h,json.job.id,'resume','completed')
  const jsonReceipt=await receipt(json.job.id)
  assert.equal(jsonReceipt.source.kind,'cradle-base-v1');assert.deepEqual(jsonReceipt.source.files.map(f=>f.name),['business.cradle.json'])
  assert.deepEqual(jsonReceipt.tables.map(t=>[t.label,t.rowsRead,t.created,t.rejected]),portable.base.tables.map(t=>[t.label,t.records.length,t.records.length,0]))

  // Authored attachment cells: one file, several, a comma in a name, empty and a bare name.
  const truth=JSON.parse(await readFile(new URL('attachments/expected.json',fixtureRoot),'utf8'))
  const bytes=await readFile(new URL('attachments/csv/'+truth.csvFile,fixtureRoot))
  const files=`column-${parseBaseCsv(new Uint8Array(bytes),truth.csvFile).headers.indexOf(truth.attachmentColumn)+1}`
  const assets=await adoptUpload(h,[{name:truth.csvFile,bytes}],{name:'Assets',tables:{[truth.csvFile]:{columns:{[files]:{sourceKind:'multipleAttachments',skip:true}}}}})
  await finish(h,assets.job.id,'resume','completed')
  const assetReceipt=await receipt(assets.job.id),declared=assetReceipt.tables[0].declaredColumns.find(c=>c.columnKey===files)
  assert.equal(declared.skipped,truth.skippedNonempty);assert.equal(declared.attachmentManifest,true)
  const lines=await manifest(h,assets.job.id,truth.csvFile,files)
  assert.equal(lines.length,declared.skipped,'One manifest line per skipped nonempty cell')
  assert.deepEqual(lines.map(line=>({rowOrdinal:Number(line['row ordinal']),primary:line['primary value'],parsed:line.parsed==='yes',...(line.parsed==='yes'?{names:JSON.parse(line['file names']),urls:JSON.parse(line['source urls'])}:{})})),truth.manifest)
  assert.ok(lines.every(line=>/expire/.test(line.note)),'Every line says source links can expire')

  // A malformed item before a valid URL must not become part of its file name.
  const mixed=[
   'a.pdf (http://a.example/6/a.pdf), b.pdf (https://a.example/6/b.pdf)',
   'a.pdf (missing URL), b.pdf (https://a.example/6/b.pdf)',
   'a.pdf (mailto:owner@example.test); b.pdf (https://a.example/6/b.pdf)',
   'Smith, Jones (signed).pdf (https://a.example/contract.pdf), b.pdf (https://a.example/6/b.pdf)',
  ],mixedFile='Mixed attachments.csv'
  const mixedBytes=Buffer.from(['Name,Files',...mixed.map((raw,i)=>`${i+1},"${raw.replaceAll('"','""')}"`)].join('\r\n')+'\r\n')
  const mixedJob=await adoptUpload(h,[{name:mixedFile,bytes:mixedBytes}],{name:'Mixed attachments',tables:{[mixedFile]:{columns:{'column-2':{sourceKind:'multipleAttachments',skip:true}}}}})
  await finish(h,mixedJob.job.id,'resume','completed')
  const mixedLines=await manifest(h,mixedJob.job.id,mixedFile,'column-2')
  assert.deepEqual(mixedLines.map(line=>line['raw cell text']),mixed)
  assert.deepEqual(mixedLines.map(line=>[line.parsed,line['file names'],line['source urls']]),[
   ['no','',''],['no','',''],['no','',''],
   ['yes',JSON.stringify(['Smith, Jones (signed).pdf','b.pdf']),JSON.stringify(['https://a.example/contract.pdf','https://a.example/6/b.pdf'])],
  ])
 }finally{await h.close()}
})
