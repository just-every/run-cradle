import {jsonLimitCase} from './helpers/base-json-limits.mjs'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {contract} from './contract.mjs'
import {openImportD1} from './helpers/records-import-d1-runtime.mjs'
import {harness} from './helpers/records-manual-harness.mjs'
import {portableFixture,id} from './helpers/base-exit-fixture.mjs'
import {invalidMetadataCases,invalidMetadataOverrides,whitespaceMetadataFixture} from './helpers/base-json-metadata-fixture.mjs'
import {draftSchema} from '../src/domains/records/manual/contracts.ts'
import {prepareJsonSource,allocateJsonIdentities} from '../src/domains/records/base-transfer/source-json.ts'
import {previewJsonImport} from '../src/domains/records/base-transfer/plan-json.ts'
import {exitPreviewService} from './helpers/base-exit-preview-service.mjs'
contract('RECORDS-005 RECORDS-006','padded native JSON metadata refuses actual D1 upload preflight before writes',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'base-json-metadata-'));let runtime
 try{
  runtime=await openImportD1(directory,true);const h=await harness({...runtime,close:()=>{}});let writeAttempts=0
  // D1's own request bookkeeping changes total_changes() even for a SELECT.
  // Observe all application SQL while still executing real D1 reads.
  const readonly={prepare(sql){if(!/^\s*SELECT\b/i.test(sql)){writeAttempts++;throw new Error('Upload attempted a database write')};return h.db.prepare(sql)},batch(){writeAttempts++;throw new Error('Upload attempted a database batch')}},service=(await exitPreviewService(readonly,previewJsonImport)).service
  async function databaseSnapshot(){const tables=(await h.db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all()).results;return JSON.stringify(await Promise.all(tables.map(async table=>({table,rows:(await h.db.prepare('SELECT * FROM "'+table.name.replaceAll('"','""')+'"').all()).results}))))}
  const before=await databaseSnapshot()
  const upload=(snapshot,options={name:snapshot.base.name})=>{const source=prepareJsonSource({filename:'padded.json',bytes:new TextEncoder().encode(JSON.stringify(snapshot))});return service.uploadPreview(h.ctx,source,options,allocateJsonIdentities(snapshot,'copy'))}
  for(const [name,mutate]of invalidMetadataCases){const snapshot=portableFixture();mutate(snapshot);await assert.rejects(async()=>upload(snapshot),undefined,name);assert.equal(writeAttempts,0,name)}
  for(const [name,options]of invalidMetadataOverrides){await assert.rejects(async()=>upload(portableFixture(),options),undefined,name);assert.equal(writeAttempts,0,name)}
  for(const [kind,current,limit,allowed]of [['tables',21,'tables',20],['fields',81,'fields',80],['records',10001,'records',10000],['cell',100001,'cellCharacters',100000]]){await assert.rejects(async()=>upload(jsonLimitCase(kind,current)),new RegExp(`LIMIT ${limit} value ${allowed} CURRENT ${current}`));assert.equal(writeAttempts,0,kind)}
  const overBytes=jsonLimitCase('tableBytes',0),actualBytes=Buffer.byteLength(JSON.stringify(overBytes.base.tables[0]));await assert.rejects(async()=>upload(overBytes),new RegExp(`LIMIT tableBytes value 10485760 CURRENT ${actualBytes}`));assert.equal(writeAttempts,0)
  const input=whitespaceMetadataFixture(),preview=await upload(input,{name:''});assert.deepEqual(draftSchema.parse(preview.schemaDraft),preview.schemaDraft);assert.equal(preview.records.find(row=>row.rowKey===id(10)).fields[preview.identities.tables[id(2)].fields[id(3)]],' \tTwin\r\n ');assert.equal(preview.schemaDraft.tables[0].fields[0].options[0].label,' Current ');assert.equal(preview.schemaDraft.tables[0].incomingRelations[0].label,' Contacts ');assert.equal(preview.portableForms[0].title,' Create company ');assert.equal(writeAttempts,0);assert.equal(await databaseSnapshot(),before)

 }finally{await runtime?.close();await rm(directory,{recursive:true,force:true})}
})
