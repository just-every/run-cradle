import assert from 'node:assert/strict'
import {attachCorrespondence} from '../src/domains/records/base-transfer/correspondence.ts'
import {contract} from './contract.mjs'
import {harness} from './helpers/records-manual-harness.mjs'
import {projectionFixture} from './helpers/base-projection-fixture.mjs'
import {createBaseImportService} from '../src/domains/records/base-transfer/service.server.ts'
import {applyPreview,nativeSqlSnapshot} from './helpers/base-exit-runtime.mjs'
import {prepareJsonSource} from '../src/domains/records/base-transfer/source-json.ts'
import {createJsonIdentityPreflight} from '../src/domains/records/base-transfer/json-identities.server.ts'
import {portableIdentityExpectation} from './helpers/portable-identity-expectation.mjs'
import {previewJsonImport} from '../src/domains/records/base-transfer/plan-json.ts'
import {prepareCsvSource,allocateImportIdentities} from '../src/domains/records/base-transfer/source.ts'
import {previewBaseImport} from '../src/domains/records/base-transfer/plan.ts'
import {createBaseExport} from '../src/domains/records/base-transfer/export-json.server.ts'
import {canonicalBaseSnapshot} from '../src/domains/records/base-transfer/json-format.ts'
import {exportCsvSet} from '../src/domains/records/base-transfer/export-csv-set.ts'
const bytes=value=>new TextEncoder().encode(JSON.stringify(value))
contract('RECORDS-005 RECORDS-006','actual native 80-field return retains both incoming projections, one ordered MANY writer and complete undo',async()=>{
 const h=await harness();try{const input=projectionFixture(80),source=prepareJsonSource({filename:'projections.json',bytes:bytes(input)}),r=await h.runtime(),ids=await createJsonIdentityPreflight(h.db,r.registry).allocate(source),mapping=portableIdentityExpectation(input,ids),expected=mapping.snapshot,native=await applyPreview(h,previewJsonImport(source,{name:input.base.name},ids)),snapshot=await createBaseExport(h.db,native.r.services)(h.ctx,ids.appId);assert.equal(snapshot.format,input.format);assert.equal(snapshot.version,input.version);assert.equal(canonicalBaseSnapshot(snapshot),canonicalBaseSnapshot(expected))
 const set=exportCsvSet(snapshot),csv=attachCorrespondence(prepareCsvSource(set.files.map(file=>({filename:file.filename,bytes:new TextEncoder().encode(file.csv)}))),{filename:'correspondence.json',bytes:bytes(set.correspondence)}),proposed=previewBaseImport(csv,set.options,allocateImportIdentities(csv)),preview=previewBaseImport(csv,{...set.options,correspondenceAcceptedFingerprint:proposed.correspondenceReview.fingerprint},proposed.identities),returned=await applyPreview(h,preview),tables=preview.schemaDraft.tables,sql=await nativeSqlSnapshot(h,returned.r,preview.identities.appId)
 assert.equal(sql.tables[0].schema.fields.length,80);assert.equal(sql.tables[0].schema.incomingRelations.length,2);assert.ok(sql.tables[0].schema.incomingRelations.every(i=>i.sourceEntityId===tables[1].id&&i.sourceFieldId===tables[1].fields[1].id));assert.equal(sql.tables.flatMap(t=>t.schema.fields).filter(f=>f.type==='relation').length,1)
 // Export sorts copied record IDs; CSV row ordinals must be bound through the
 // complete JSON map rather than assumed to preserve the original ID order.
 const targetIds=preview.identities.tables[set.files[0].filename].records,originalOrder=input.base.tables[1].records[0].values[input.base.tables[1].fields[1].id],orderedTargets=originalOrder.map(id=>{const ordinal=snapshot.base.tables[0].records.findIndex(record=>record.id===mapping.map.get(id));assert.ok(ordinal>=0);return targetIds['row-'+(ordinal+1)]});assert.deepEqual(sql.tables[1].records[0].values[tables[1].fields[1].id],orderedTargets);assert.equal((await returned.service.status(h.ctx,returned.job.id)).progress.appliedLinkCells,1)
 let undo=await returned.service.undo(h.ctx,returned.job.id);for(let n=0;undo.state!=='undone'&&n<20;n++)undo=await returned.service.undo(h.ctx,undo.id);assert.equal(undo.state,'undone');const status=await returned.service.status(h.ctx,undo.id);assert.equal(status.reversal.reversed,4);assert.equal(status.reversal.retained,0);assert.equal(status.reconciliation.ok,true)
 const empty=await nativeSqlSnapshot(h,returned.r,preview.identities.appId);assert.ok(empty.tables.every(t=>t.records.length===0));assert.equal(empty.tables[0].schema.incomingRelations.length,2);assert.equal(canonicalBaseSnapshot(await createBaseExport(h.db,native.r.services)(h.ctx,ids.appId)),canonicalBaseSnapshot(expected))
 }finally{h.close()}
})
contract('RECORDS-005 RECORDS-006','actual native JSON exit/return preserves 1001 ordered select choices including all unused choices',async()=>{
 const h=await harness();try{const snapshot=projectionFixture(),field=snapshot.base.tables[0].fields[1];field.type='select';field.options=Array.from({length:1001},(_,n)=>({id:String(n+10000).padStart(26,'0'),label:'Choice '+n}));for(const row of snapshot.base.tables[0].records)row.values[field.id]=field.options[0].id
 const source=prepareJsonSource({filename:'choices.json',bytes:bytes(snapshot)}),r=await h.runtime(),ids=await createJsonIdentityPreflight(h.db,r.registry).allocate(source),expected=portableIdentityExpectation(snapshot,ids).snapshot,applied=await applyPreview(h,previewJsonImport(source,{name:snapshot.base.name},ids)),exported=await createBaseExport(h.db,applied.r.services)(h.ctx,ids.appId);assert.equal(exported.format,snapshot.format);assert.equal(exported.version,snapshot.version);assert.equal(canonicalBaseSnapshot(exported),canonicalBaseSnapshot(expected));assert.deepEqual(exported.base.tables[0].fields[1].options,expected.base.tables[0].fields[1].options)
 const returnedSource=prepareJsonSource({filename:'choices-return.json',bytes:bytes(exported)}),copyIds=await createJsonIdentityPreflight(h.db,applied.r.registry).allocate(returnedSource),copyExpected=portableIdentityExpectation(exported,copyIds).snapshot,returned=await applyPreview(h,previewJsonImport(returnedSource,{name:snapshot.base.name},copyIds)),copy=await createBaseExport(h.db,returned.r.services)(h.ctx,copyIds.appId);assert.equal(canonicalBaseSnapshot(copy),canonicalBaseSnapshot(copyExpected));assert.deepEqual(copy.base.tables[0].fields[1].options.map(o=>o.label),field.options.map(o=>o.label));assert.equal(copy.base.tables[0].fields[1].options.length,1001);assert.ok(copy.base.tables[0].records.every(row=>row.values[copy.base.tables[0].fields[1].id]===copy.base.tables[0].fields[1].options[0].id))
 }finally{h.close()}
})

contract('RECORDS-005 RECORDS-006','wide CSV proposal refuses a saved review before explicit correspondence acceptance with zero writes',async()=>{
 const h=await harness();try{const set=exportCsvSet(projectionFixture(80)),source=attachCorrespondence(prepareCsvSource(set.files.map(file=>({filename:file.filename,bytes:new TextEncoder().encode(file.csv)}))),{filename:'correspondence.json',bytes:bytes(set.correspondence)}),preview=previewBaseImport(source,set.options,allocateImportIdentities(source)),r=await h.runtime(),service=createBaseImportService(h.db,r.policy,r.registry,r.manual,previewBaseImport),count=()=>h.sql.prepare('SELECT total_changes() n').get().n,before=count();assert.equal(preview.correspondenceReview.accepted,false);await assert.rejects(service.review(h.ctx,preview,{fingerprint:preview.fingerprint,acceptLoss:true}),/Accept the exact CSV correspondence/);assert.equal(count(),before)}finally{h.close()}
})
