import assert from 'node:assert/strict'
export function assertFixtureReportDetails(f,report,format,references){
 const {mapping,expected,truth,tableKey,columnKey,preview,source}=f
 assert.deepEqual(report.tables.map(t=>t.tableKey),expected.rowsByTable.map(w=>tableKey(mapping.tables.find(t=>t.key===w.tableKey))))
 for(const table of mapping.tables){
  const actual=report.tables.find(t=>t.tableKey===tableKey(table));assert.equal(actual.label,table.label);assert.equal(actual.primaryColumnKey,columnKey(table,table.fields.find(c=>c.key===table.primaryFieldKey)))
  assert.deepEqual(actual.columns.map(c=>c.columnKey),expected.columnAccounting.filter(c=>c.fieldKey.startsWith(table.key+'.')).map(c=>columnKey(table,table.fields.find(field=>field.key===c.fieldKey.split('.')[1]))))
  for(const column of actual.columns)assert.equal(column.label,table.fields.find(c=>columnKey(table,c)===column.columnKey).label)
  assert.deepEqual(actual.links.map(l=>l.columnKey),table.fields.filter(c=>c.sourceType==='multipleRecordLinks').map(c=>columnKey(table,c)))
  for(const link of actual.links){const field=table.fields.find(c=>columnKey(table,c)===link.columnKey),refs=references.filter(r=>r.tableKey===table.key&&r.fieldKey===field.key);assert.equal(link.referencesRead,refs.length);for(const state of ['resolved','unresolved','ambiguous'])assert.equal(link[state],refs.filter(r=>r.resolution===state).length,table.key+'.'+field.key+'.'+state)}
 }
 const wantedInverse=truth.nativeSchema.tables.flatMap(table=>(table.incomingRelations??[]).map(incoming=>{const target=mapping.tables.find(t=>t.key===table.key),owner=mapping.tables.find(t=>t.key===incoming.sourceTableKey),column=columnKey(target,target.fields.find(c=>c.key===incoming.key));return {tableKey:tableKey(target),columnKey:column,canonicalTableKey:tableKey(owner),canonicalColumnKey:columnKey(owner,owner.fields.find(c=>c.key===incoming.sourceFieldKey)),inverseId:preview.identities.tables[tableKey(target)].fields[column],label:incoming.label}}))
 assert.deepEqual(report.reciprocalRelations.map(({description,...relation})=>relation),wantedInverse)
 const disagreements=report.diagnostics.filter(d=>d.code==='RECIPROCAL_DISAGREEMENT')
 for(const [index,wanted]of (truth.sourceReciprocalDisagreement?.items??[]).entries()){
  const table=mapping.tables.find(t=>t.key===wanted.companyRecordKey.split('.')[0]),target=mapping.tables.find(t=>t.key===wanted.listedContactRecordKey.split('.')[0]),rows=source.tables.find(t=>t.key===tableKey(table)).rows,ids=preview.identities.tables[tableKey(table)],row=rows.find(r=>ids.records[r.key]===f.nativeByAlias.get(wanted.companyRecordKey)),targetId=f.nativeByAlias.get(wanted.listedContactRecordKey),targetKey=Object.entries(preview.identities.tables[tableKey(target)].records).find(([,id])=>id===targetId)[0],diagnostic=disagreements[index]
  assert.equal(diagnostic.tableKey,tableKey(table));assert.equal(diagnostic.columnKey,columnKey(table,table.fields.find(c=>c.key===wanted.companySourceField)));assert.equal(diagnostic.rowKey,row.key);assert.deepEqual(diagnostic.location,row.location);assert.deepEqual(diagnostic.raw,row.values[diagnostic.columnKey]);assert.ok(diagnostic.message.includes(JSON.stringify([row.key,targetKey])))
 }
 const recognized=report.lookups.filter(l=>l.recognized),wantedLookups=mapping.tables.flatMap(table=>table.fields.filter(c=>c.targetType==='computed'&&c.recomputeFrom).map(field=>({table,field})))
 assert.equal(recognized.length,wantedLookups.length)
 for(const {table,field}of wantedLookups){const relation=table.fields.find(c=>c.key===field.recomputeFrom.relationFieldKey),target=mapping.tables.find(t=>t.key===relation.targetTableKey),value=target.fields.find(c=>c.key===field.recomputeFrom.valueFieldKey),lookup=recognized.find(l=>l.tableKey===tableKey(table)&&l.columnKey===columnKey(table,field));assert.ok(lookup);assert.equal(lookup.relationColumnKey,columnKey(table,relation));assert.equal(lookup.valueColumnKey,columnKey(target,value));assert.equal(lookup.targetTableKey,tableKey(target));const candidate=lookup.candidates.find(c=>c.relationColumnKey===lookup.relationColumnKey&&c.valueColumnKey===lookup.valueColumnKey);assert.equal(candidate.matchesAllRows,true);assert.equal(candidate.matchedRows,expected.lookups.recognizedRows);assert.equal(candidate.rowsRead,expected.lookups.recognizedRows)}
 if(format==='api'){
  const pages=expected.pageAccounting,requests=[f.manifest.api.metadata.requestPath,...f.manifest.api.tables.flatMap(t=>t.pages.map(p=>t.requestPath+(p.offset?'?offset='+encodeURIComponent(p.offset):'')))]
  assert.deepEqual(f.requestedPaths,requests,'Exact recorded request and offset chain');assert.equal(pages.offsetChainVerified,true);assert.equal(f.requestedPaths.length,pages.requests)
  assert.equal(source.bundle.artifacts.filter(a=>a.name.startsWith('metadata/')).length,pages.metadataPagesRead);assert.equal(source.bundle.artifacts.filter(a=>!a.name.startsWith('metadata/')).length,pages.recordPagesRead);assert.equal(source.tables.reduce((n,t)=>n+t.rows.length,0),pages.recordsRead)
 }
}
