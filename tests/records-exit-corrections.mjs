import assert from 'node:assert/strict'
import {attachCorrespondence} from '../src/domains/records/base-transfer/correspondence.ts'
import {contract} from './contract.mjs'
import {prepareCsvSource,allocateImportIdentities} from '../src/domains/records/base-transfer/source.ts'
import {previewBaseImport} from '../src/domains/records/base-transfer/plan.ts'
import {exportCsvSet,csvSetDownload} from '../src/domains/records/base-transfer/export-csv-set.ts'
import {validatePortableBase} from '../src/domains/records/base-transfer/json-validation.ts'
import {assertPortableJsonSchema} from './helpers/json-schema-assert.mjs'
import {projectionFixture} from './helpers/base-projection-fixture.mjs'
const bytes=text=>new TextEncoder().encode(text)
contract('RECORDS-005 RECORDS-006','80 native fields plus repeated incoming projections return with the later MANY writer and exact source link order',()=>{
 const original=projectionFixture(80),set=exportCsvSet(original),raw=prepareCsvSource(set.files.map(file=>({filename:file.filename,bytes:bytes(file.csv)}))),source=attachCorrespondence(raw,{filename:'correspondence.json',bytes:bytes(JSON.stringify(set.correspondence))}),proposed=previewBaseImport(source,set.options,allocateImportIdentities(source)),preview=previewBaseImport(source,{...set.options,correspondenceAcceptedFingerprint:proposed.correspondenceReview.fingerprint},proposed.identities),target=preview.schemaDraft.tables[0],writer=preview.schemaDraft.tables[1],identity=preview.identities.tables[set.files[0].filename]
 assert.throws(()=>previewBaseImport(raw,set.options,allocateImportIdentities(raw)),/LIMIT fields value 80 CURRENT 82/);
 assert.equal(source.tables[0].columns.length,82);assert.equal(target.fields.length,80);assert.equal(target.incomingRelations.length,2);assert.equal(writer.fields.length,2)
 assert.deepEqual(target.incomingRelations.map(i=>[i.sourceEntityId,i.sourceFieldId]),[[writer.id,writer.fields[1].id],[writer.id,writer.fields[1].id]])
 assert.deepEqual(target.incomingRelations.map(i=>i.label),['Backlinks','Backlinks again']);assert.equal(preview.links.length,1);assert.equal(preview.links[0].entityId,writer.id);assert.deepEqual(preview.links[0].targetRecordIds,[identity.records['row-2'],identity.records['row-1']]);assert.ok(preview.inverseViews.every(view=>view.canonicalTableKey===set.files[1].filename));assert.equal(preview.report.diagnostics.filter(d=>d.code==='RECIPROCAL_DISAGREEMENT').length,0)
 const repeated=projectionFixture();for(const incoming of repeated.base.tables[0].incomingRelations)incoming.label='Name';const repeatedSet=exportCsvSet(repeated),repeatedSource=prepareCsvSource(repeatedSet.files.map(file=>({filename:file.filename,bytes:bytes(file.csv)}))),repeatedPreview=previewBaseImport(repeatedSource,repeatedSet.options,allocateImportIdentities(repeatedSource));assert.deepEqual(repeatedSource.tables[0].columns.map(column=>column.label),['Name','Text 1','Name (2)','Name (3)']);assert.deepEqual(repeatedPreview.schemaDraft.tables[0].incomingRelations.map(incoming=>incoming.label),['Name','Name']);assert.equal(repeatedPreview.links.length,1);
 const ordinary=prepareCsvSource([{filename:'81 native.csv',bytes:bytes(Array.from({length:81},(_,n)=>'Field '+n).join(',')+'\n'+Array.from({length:81},()=> 'value').join(','))}]);assert.throws(()=>previewBaseImport(ordinary,{name:'Too wide'},allocateImportIdentities(ordinary)),/LIMIT fields value 80 CURRENT 81/)
})
contract('RECORDS-005 RECORDS-006','portable select choices admit the complete ordered native 10000-option limit including unused options',()=>{
 const snapshot=projectionFixture(),field=snapshot.base.tables[0].fields[1];field.type='select';field.options=Array.from({length:10000},(_,n)=>({id:String(n+10000).padStart(26,'0'),label:'Option '+n}));for(const row of snapshot.base.tables[0].records)row.values[field.id]=field.options[0].id
 assertPortableJsonSchema(snapshot);assert.deepEqual(validatePortableBase(snapshot).base.tables[0].fields[1].options,field.options);assert.deepEqual(exportCsvSet(snapshot).options.tables['01-Targets.csv'].columns['column-2'].options,field.options.map(o=>o.label))
 field.options.push({id:'9'.repeat(26),label:'Too many'});assert.throws(()=>validatePortableBase(snapshot),/10000/);assert.throws(()=>assertPortableJsonSchema(snapshot))
})
contract('RECORDS-006','ZIP guide states every stable-identity, schema, view/form, null and ambiguity boundary with actual review steps',()=>{
 const zip=csvSetDownload(projectionFixture()).bytes,text=Buffer.from(zip).toString('utf8')
 for(const disclosure of ['Upload all','CSV review choices','import-options.json','Preview import','Save review and inspect schema impact','Adopt schema and start import','required/unique','null','duplicate primary','saved views/forms','identity','formula','JSON'])assert.ok(text.includes(disclosure),disclosure)
})
