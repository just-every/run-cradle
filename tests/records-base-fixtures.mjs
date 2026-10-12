import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve,basename } from 'node:path'
import { contract } from './contract.mjs'
import { prepareCsvSource,allocateImportIdentities } from '../src/domains/records/base-transfer/source.ts'
import { prepareApiSource } from '../src/domains/records/base-transfer/source-api.ts'
import { previewBaseImport } from '../src/domains/records/base-transfer/plan.ts'
const fixtureRoot=resolve(process.env.CRADLE_TRANSFER_FIXTURES??'tests/fixtures/base-transfer')
const json=async path=>JSON.parse(await readFile(path,'utf8'))
async function fixturePreview(directory,path){
 const root=resolve(fixtureRoot,directory),manifest=await json(resolve(root,'manifest.json')),mapping=await json(resolve(root,'mapping.json')),truth=await json(resolve(root,'ground-truth.json')),expected=await json(resolve(root,path+'-expected.json'))
 let source,requests=0
 if(path==='csv')source=prepareCsvSource(await Promise.all(manifest.csvFiles.map(async file=>({filename:basename(file.path),bytes:new Uint8Array(await readFile(resolve(root,file.path)))}))))
 else source=await prepareApiSource({metadataUrl:'https://example.com'+manifest.api.metadata.requestPath,recordsUrl:key=>'https://example.com'+manifest.api.tables.find(t=>t.tableId===key).requestPath},async request=>{
  requests++;const url=new URL(request.url)
  if(url.pathname===manifest.api.metadata.requestPath)return new Response(await readFile(resolve(root,manifest.api.metadata.path)))
  const table=manifest.api.tables.find(t=>t.requestPath===url.pathname);assert.ok(table,'Only recorded fixture URLs are permitted');const page=table.pages.find(p=>p.offset===(url.searchParams.get('offset')??null));assert.ok(page,'Exact offset chain must match manifest')
  return new Response(await readFile(resolve(root,page.path)))
 })
 const options={name:mapping.baseLabel,tables:{}},tableKeys=new Map(mapping.tables.map(t=>[t.key,path==='csv'?t.csvFile:t.sourceTableId]))
 for(const table of mapping.tables){
  const key=tableKeys.get(table.key),prepared=source.tables.find(t=>t.key===key),columns={}
  for(const field of table.fields){
   const column=prepared.columns.find(c=>path==='csv'?c.label===field.csvColumn:c.key===field.sourceFieldId);assert.ok(column)
   const override={label:field.label,sourceKind:field.sourceType,...(mapping.ownerPreviewChoices?.sourceMultiSelectOptions?.[table.key+'.'+field.key]?{sourceChoices:mapping.ownerPreviewChoices.sourceMultiSelectOptions[table.key+'.'+field.key].labelsInSourceOrder}:{})};if(field.targetType==='skip'){override.skip=true;if(field.sourceType==='multipleRecordLinks')override.type='relation'}else override.type=field.targetType
   if(field.targetTableKey)override.relationTableKey=tableKeys.get(field.targetTableKey)
   else if(field.targetTableId)override.relationTableKey=field.targetTableId
   if(field.cardinality)override.cardinality=field.cardinality
   const choices=mapping.ownerPreviewChoices?.selectOptions?.[table.key+'.'+field.key];if(choices)override.options=choices
   if(field.dateConvention)override.dateConvention='iso'
   columns[column.key]=override
  }
  options.tables[key]={label:table.label,columns}
 }
 const identities=allocateImportIdentities(source),preview=previewBaseImport(source,options,identities),recordIds=new Map(),recordKeys=new Map()
 for(const alias of truth.sourceIdentityAliases){
  const tableKey=tableKeys.get(alias.tableKey),table=source.tables.find(t=>t.key===tableKey),row=path==='csv'?table.rows.find(r=>r.location.row===alias.csv.physicalLine):table.rows.find(r=>r.key===alias.api.recordId);assert.ok(row,alias.recordKey)
  const id=identities.tables[tableKey].records[row.key];recordIds.set(alias.recordKey,id);recordKeys.set(id,alias.recordKey)
 }
 return {source,preview,truth,mapping,manifest,expected,path,requests,tableKeys,recordIds,recordKeys}
}
function compare(fixture){
 const {preview,truth,mapping,expected,path,tableKeys,recordIds,recordKeys}=fixture
 assert.equal(preview.records.length,truth.nativeRecords.length);assert.equal(preview.report.tables.reduce((n,t)=>n+t.rejected,0),0)
 for(const table of truth.nativeSchema.tables){
  const key=tableKeys.get(table.key),schema=preview.schemaDraft.tables.find(s=>s.id===preview.identities.tables[key].entityId),sourceMapping=mapping.tables.find(t=>t.key===table.key)
  assert.equal(schema.label,table.label)
  const expectedPhysical=table.fields
  assert.deepEqual(schema.fields.map(f=>f.label),expectedPhysical.map(f=>f.label))
  assert.deepEqual(schema.incomingRelations.map(r=>r.label),(table.incomingRelations??[]).map(f=>f.label))
  for(const expectedIncoming of table.incomingRelations??[]){const incoming=schema.incomingRelations.find(r=>r.label===expectedIncoming.label),sourceTable=mapping.tables.find(t=>t.key===expectedIncoming.sourceTableKey),sourceField=sourceTable.fields.find(f=>f.key===expectedIncoming.sourceFieldKey),prepared=preview.source.tables.find(t=>t.key===tableKeys.get(sourceTable.key)),column=prepared.columns.find(c=>path==='csv'?c.label===sourceField.csvColumn:c.key===sourceField.sourceFieldId);assert.equal(incoming.sourceEntityId,preview.identities.tables[prepared.key].entityId);assert.equal(incoming.sourceFieldId,preview.identities.tables[prepared.key].fields[column.key])}
  for(const field of expectedPhysical){const actual=schema.fields.find(f=>f.label===field.label);assert.equal(actual.type,field.type);if(field.options)assert.deepEqual(actual.options.map(o=>o.label),field.options);if(field.type==='relation'){assert.equal(actual.relation.cardinality,field.cardinality);assert.equal(actual.relation.onDelete,field.onDelete);assert.equal(actual.relation.entityId,preview.identities.tables[tableKeys.get(field.targetTableKey)].entityId)}}
  const primary=sourceMapping.fields.find(f=>f.key===table.primaryFieldKey),sourceTable=preview.source.tables.find(t=>t.key===key),sourceColumn=sourceTable.columns.find(c=>path==='csv'?c.label===primary.csvColumn:c.key===primary.sourceFieldId)
  assert.equal(schema.primaryFieldId,preview.identities.tables[key].fields[sourceColumn.key])
 }
 for(const expectedRecord of truth.nativeRecords){
  const record=preview.records.find(r=>r.recordId===recordIds.get(expectedRecord.recordKey)),schema=preview.schemaDraft.tables.find(s=>s.id===record.entityId),tableTruth=truth.nativeSchema.tables.find(t=>t.key===expectedRecord.tableKey)
  const expectedScalars=Object.keys(expectedRecord.fields).filter(k=>tableTruth.fields.find(f=>f.key===k).type!=='computed')
  assert.deepEqual(Object.keys(record.fields).sort(),expectedScalars.map(k=>schema.fields.find(f=>f.label===tableTruth.fields.find(t=>t.key===k).label).id).sort())
  for(const [key,value] of Object.entries(expectedRecord.fields)){
   const fieldTruth=tableTruth.fields.find(f=>f.key===key),field=schema.fields.find(f=>f.label===fieldTruth.label);let actual=record.fields[field.id]
   if(field.type==='select')actual=field.options.find(o=>o.id===actual).label
   if(field.type==='computed'){
    const relation=preview.links.find(l=>l.recordId===record.recordId&&l.fieldId===field.expression.relationFieldId),target=preview.records.find(r=>r.recordId===relation.targetRecordIds[0]);actual=target?.fields[field.expression.valueFieldId]??null
   }
   assert.deepEqual(actual,value,expectedRecord.recordKey+'.'+key)
  }
  const expectedLinks=truth.nativeLinksByPath?.[path]??Object.fromEntries(Object.entries(expectedRecord.links??{}).map(([k,v])=>[expectedRecord.recordKey+'.'+k,Array.isArray(v)?v:v===null?[]:[v]]))
  for(const field of tableTruth.fields.filter(f=>f.type==='relation'&&f.canonicalForSourceImport!==false)){
   const actualField=schema.fields.find(f=>f.label===field.label),link=preview.links.find(l=>l.recordId===record.recordId&&l.fieldId===actualField.id),expectedKey=expectedRecord.recordKey+'.'+field.key
   assert.deepEqual(link.targetRecordIds.map(id=>recordKeys.get(id)),expectedLinks[expectedKey],expectedKey)
  }
 }
 for(const expectedTable of expected.rowsByTable){const actual=preview.report.tables.find(t=>t.tableKey===tableKeys.get(expectedTable.tableKey));assert.deepEqual([actual.rowsRead,actual.created,actual.rejected],[expectedTable.rowsRead,expectedTable.created,expectedTable.rejected])}
 for(const expectedColumn of expected.columnAccounting){
  const mappedTable=mapping.tables.find(t=>t.fields.some(f=>t.key+'.'+f.key===expectedColumn.fieldKey)),mappedField=mappedTable.fields.find(f=>mappedTable.key+'.'+f.key===expectedColumn.fieldKey),prepared=preview.source.tables.find(t=>t.key===tableKeys.get(mappedTable.key)),sourceColumn=prepared.columns.find(c=>path==='csv'?c.label===mappedField.csvColumn:c.key===mappedField.sourceFieldId),actual=preview.report.tables.find(t=>t.tableKey===prepared.key).columns.find(c=>c.columnKey===sourceColumn.key)
  assert.deepEqual([actual.nonempty,actual.converted,actual.unparseable,actual.skippedNonempty],[expectedColumn.sourceValues,expectedColumn.converted,expectedColumn.unparseable,expectedColumn.skippedNonempty],expectedColumn.fieldKey+' accounting')
  if(expectedColumn.linkRefsRead!==undefined)assert.equal(preview.report.tables.find(t=>t.tableKey===prepared.key).links.find(l=>l.columnKey===sourceColumn.key).referencesRead,expectedColumn.linkRefsRead)
  for(const count of ['textChanges','keptText','notRecreated','recomputed','normalizedCheckedCheckboxTrue','normalizedBlankCheckboxFalse','normalizedApiCheckboxTrue','normalizedOmittedCheckboxFalse'])if(expectedColumn[count]!==undefined)assert.equal(actual[count],expectedColumn[count],expectedColumn.fieldKey+'.'+count)
  if(expectedColumn.sourceOptionLabels!==undefined){assert.equal(actual.sourceOptions.length,expectedColumn.sourceOptionLabels);assert.equal(actual.unusedSourceOptions.length,expectedColumn.unusedSourceOptions);const declared=mapping.ownerPreviewChoices?.sourceMultiSelectOptions?.[expectedColumn.fieldKey];if(declared){assert.deepEqual(actual.sourceOptions,declared.labelsInSourceOrder);assert.deepEqual(actual.unusedSourceOptions,declared.unusedLabels)}}
 }
 const links=preview.report.tables.flatMap(t=>t.links),counts=Object.fromEntries(['referencesRead','resolved','unresolved','ambiguous'].map(k=>[k,links.reduce((n,l)=>n+l[k],0)]))
 assert.deepEqual(counts,{referencesRead:expected.linkAccounting.linkRefsRead,resolved:expected.linkAccounting.resolved,unresolved:expected.linkAccounting.unresolved,ambiguous:expected.linkAccounting.ambiguous})
 for(const table of preview.report.tables){assert.equal(table.rowsRead,table.created+table.rejected);for(const link of table.links)assert.equal(link.referencesRead,link.resolved+link.unresolved+link.ambiguous)}
 assert.equal(preview.report.lookups.filter(l=>l.recognized).length,expected.lookups.recognized)
 assert.equal(preview.report.diagnostics.filter(d=>d.code==='RECIPROCAL_DISAGREEMENT').length,expected.reciprocalDisagreements.count)
 if(path==='api')assert.equal(fixture.requests,expected.pageAccounting.requests)
}
for(const name of ['crm-example','project-tracker','edges'])for(const path of ['csv','api'])contract('RECORDS-005',`independent handwritten ${name} ${path} fixture: complete schema/scalars/links/accounting/custody`,async()=>{
 const fixture=await fixturePreview(name,path);compare(fixture)
 const root=resolve(fixtureRoot,name),hashes=await json(resolve(root,'source-hashes.json')),paths=path==='csv'?fixture.manifest.csvFiles.map(f=>f.path):[fixture.manifest.api.metadata.path,...fixture.manifest.api.tables.flatMap(t=>t.pages.map(p=>p.path))]
 assert.equal(fixture.source.bundle.artifacts.length,paths.length)
 for(let i=0;i<paths.length;i++){const artifact=fixture.source.bundle.artifacts[i],receipt=hashes.artifacts.find(a=>a.path===paths[i]);assert.ok(receipt);assert.equal(artifact.sha256,receipt.sha256);assert.equal(artifact.size,receipt.size);assert.deepEqual(Buffer.from(artifact.original.base64,'base64'),await readFile(resolve(root,paths[i])))}
})
