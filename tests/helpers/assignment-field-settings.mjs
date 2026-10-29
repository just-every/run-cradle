import {exportCsvSet} from '../../src/domains/records/base-transfer/export-csv-set.ts'
import {attachCorrespondence} from '../../src/domains/records/base-transfer/correspondence.ts'
import {prepareCsvSource,allocateImportIdentities} from '../../src/domains/records/base-transfer/source.ts'
import {previewBaseImport} from '../../src/domains/records/base-transfer/plan.ts'
import {assertPortableJsonSchema,assertCorrespondenceSchema} from './json-schema-assert.mjs'
import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {add} from './records-manual-harness.mjs'
import {applyPreview} from './base-exit-runtime.mjs'
import {createBaseExport} from '../../src/domains/records/base-transfer/export-json.server.ts'
import {prepareJsonSource} from '../../src/domains/records/base-transfer/source-json.ts'
import {createJsonIdentityPreflight} from '../../src/domains/records/base-transfer/json-identities.server.ts'
import {previewJsonImport} from '../../src/domains/records/base-transfer/plan-json.ts'

/** Owner schema adoption and real JSON returns retain assignment consent. */
export async function assignmentFieldSettings(h){
 const title={id:createUlid(),label:'Name',type:'text',required:true,unique:false},assignee={id:createUlid(),label:'Assignee',type:'person',required:false,unique:false},silent={...assignee,id:createUlid(),label:'Silent assignee',notifyOnAdd:false},draft={appId:createUlid(),name:'Assignment settings',tables:[{id:createUlid(),label:'Work',primaryFieldId:title.id,incomingRelations:[],fields:[title,assignee,silent]}]}
 const {r}=await h.create(draft),schema=r.registry.get(draft.appId,draft.tables[0].id).schema
 assert.equal(schema.fields.find(f=>f.id===assignee.id).notifyOnAdd,true,'An omitted setting on a new native user field enables notices')
 assert.equal(schema.fields.find(f=>f.id===silent.id).notifyOnAdd,false,'The owner can choose a silent field')
 await add(h,r,schema,{[title.id]:'A populated record',[assignee.id]:h.owner,[silent.id]:h.owner})
 const sourceSnapshot=await createBaseExport(h.db,r.services)(h.ctx,draft.appId)
 assertPortableJsonSchema(sourceSnapshot)
 assert.equal(sourceSnapshot.base.tables[0].fields.find(f=>f.id===assignee.id).notifyOnAdd,true)
 assert.equal(sourceSnapshot.base.tables[0].fields.find(f=>f.id===silent.id).notifyOnAdd,false)
 async function restore(snapshot){
  const runtime=await h.runtime(),source=prepareJsonSource({filename:'assignment-settings.json',bytes:new TextEncoder().encode(JSON.stringify(snapshot))}),identities=await createJsonIdentityPreflight(h.db,runtime.registry).allocate(source),preview=previewJsonImport(source,{name:snapshot.base.name},identities),applied=await applyPreview(h,preview)
  return createBaseExport(h.db,applied.r.services)(h.ctx,identities.appId)
 }
 const returned=await restore(sourceSnapshot)
 assertPortableJsonSchema(returned)
 const settings=returned.base.tables[0].fields.filter(f=>f.type==='person')
 assert.deepEqual(settings.map(f=>[f.label,f.notifyOnAdd]),[['Assignee',true],['Silent assignee',false]],'JSON return preserves the explicit on and off choices')
 for(const field of settings)assert.equal(returned.base.tables[0].records[0].values[field.id],h.owner,'The populated user value survives without creating another account')
 const csv=exportCsvSet(sourceSnapshot)
 assertCorrespondenceSchema(csv.correspondence)
 const csvSource=prepareCsvSource(csv.files.map(file=>({filename:file.filename,bytes:new TextEncoder().encode(file.csv)}))),plain=previewBaseImport(csvSource,csv.options,allocateImportIdentities(csvSource))
 assert.deepEqual(plain.schemaDraft.tables[0].fields.filter(f=>f.type==='person').map(f=>f.notifyOnAdd),[false,false],'A plain CSV import does not infer notification consent')
 const correspondence=attachCorrespondence(csvSource,{filename:'correspondence.json',bytes:new TextEncoder().encode(JSON.stringify(csv.correspondence))}),proposal=previewBaseImport(correspondence,csv.options,allocateImportIdentities(correspondence)),accepted=previewBaseImport(correspondence,{...csv.options,correspondenceAcceptedFingerprint:proposal.correspondenceReview.fingerprint},proposal.identities),csvApplied=await applyPreview(h,accepted),csvReturned=await createBaseExport(h.db,csvApplied.r.services)(h.ctx,accepted.identities.appId)
 assert.deepEqual(csvReturned.base.tables[0].fields.filter(f=>f.type==='person').map(f=>[f.label,f.notifyOnAdd]),[['Assignee',true],['Silent assignee',false]],'Explicitly accepted CSV metadata restores the source settings')
 const legacy=structuredClone(sourceSnapshot)
 for(const field of legacy.base.tables[0].fields)if(field.type==='person')delete field.notifyOnAdd
 const imported=await restore(legacy)
 assertPortableJsonSchema(imported)
 const importedPeople=imported.base.tables[0].fields.filter(f=>f.type==='person')
 assert.equal(importedPeople.length,2)
 for(const field of importedPeople){assert.equal(field.notifyOnAdd,false,'An imported user field without an assignment setting is silent');assert.equal(imported.base.tables[0].records[0].values[field.id],h.owner)}
 const current=await h.runtime(),edit=await current.manual.read(h.ctx,draft.appId)
 edit.tables[0].fields.find(f=>f.id===assignee.id).notifyOnAdd=false
 const change=await current.manual.preview(h.ctx,edit)
 assert.ok(change.impacts[0].changes.some(item=>/assignment notifications off/.test(item)),'Schema review shows the notification setting change')
 await current.manual.adopt(h.ctx,createUlid(),change.id)
 const updated=await h.runtime()
 assert.equal(updated.registry.get(draft.appId,draft.tables[0].id).schema.fields.find(f=>f.id===assignee.id).notifyOnAdd,false)
}
