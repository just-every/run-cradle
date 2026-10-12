import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {prepareFixture} from './helpers/records-import-fixture.mjs'
import {previewBaseImport} from '../src/domains/records/base-transfer/plan.ts'

// These expectations are authored from the fixture's documented four source
// rows. CSV has display strings, not formula/rollup declarations. No engine is
// recreated and no output from the importer supplies an expected value.
const expected={
 csv:{progressFormula:{type:'number',values:['0.75','0.5','1','0'],converted:4,textChanges:4,keptText:0,notRecreated:0},projectTaskCount:{type:'number',values:['3','3','3','1'],converted:0,textChanges:0,keptText:0,notRecreated:0}},
 // A3: recorded formula/rollup scalar numeric content defaults to Number.
 // Representation conversion and source behavior accounting still apply.
 api:{progressFormula:{type:'number',values:['0.75','0.5','1','0'],converted:4,textChanges:0,keptText:0,notRecreated:4},projectTaskCount:{type:'number',values:['3','3','3','1'],converted:4,textChanges:0,keptText:0,notRecreated:4}},
}
for(const format of ['csv','api'])contract('RECORDS-005',`project ${format} default formula and rollup content remains exact without recreating behavior`,async()=>{
 const f=await prepareFixture('project-tracker',format),options=structuredClone(f.preview.options),table=f.mapping.tables.find(t=>t.key==='tasks'),key=f.tableKey(table)
 for(const name of ['progressFormula','projectTaskCount']){
  const field=table.fields.find(field=>field.key===name),column=f.columnKey(table,field)
  options.tables[key].columns[column]={label:field.label}
 }
 const p=previewBaseImport(f.source,options,f.preview.identities)
 assert.equal(p.records.length,9);assert.equal(p.report.tables.reduce((n,t)=>n+t.rejected,0),0)
 for(const [name,oracle] of Object.entries(expected[format])){
  const field=table.fields.find(field=>field.key===name),column=f.columnKey(table,field),id=p.identities.tables[key].fields[column],schema=p.schemaDraft.tables.find(t=>t.id===p.identities.tables[key].entityId).fields.find(f=>f.id===id),report=p.report.tables.find(t=>t.tableKey===key).columns.find(c=>c.columnKey===column)
  assert.equal(schema.type,oracle.type);assert.equal(schema.expression,undefined)
  assert.deepEqual(p.records.filter(r=>r.tableKey===key).map(r=>r.fields[id]),oracle.values)
  for(const count of ['converted','textChanges','keptText','notRecreated'])assert.equal(report[count],oracle[count],`${format}.${name}.${count}`)
  assert.equal(report.nonempty,4);assert.equal(report.unparseable,0);assert.equal(report.skippedNonempty,0);assert.equal(report.recomputed,0)
 }
 assert.equal(p.report.tables.flatMap(t=>t.links).reduce((n,l)=>n+l.referencesRead,0),19)
})
contract('RECORDS-005','CSV currency and percent infer exact numbers while formula-looking executable text remains inert',async()=>{
 const {prepareCsvSource,allocateImportIdentities}=await import('../src/domains/records/base-transfer/source.ts')
 const source=prepareCsvSource([{filename:'Values.csv',bytes:Buffer.from('Name,Amount,Rate,Notes\r\nFirst,"$1,200.00",50%,=SUM(1)\r\nSecond,(20),0%,+call\r\n')}]),p=previewBaseImport(source,{name:'Exact values'},allocateImportIdentities(source)),fields=p.schemaDraft.tables[0].fields
 assert.deepEqual(fields.map(f=>f.type),['text','number','number','text'])
 assert.deepEqual(p.records.map(row=>fields.map(field=>row.fields[field.id])),[['First','1200','0.5','=SUM(1)'],['Second','-20','0','+call']])
 assert.deepEqual(p.report.tables[0].columns.map(c=>c.textChanges),[0,2,2,0])
})

contract('RECORDS-005','declared derived outputs infer only exact numeric scalars or text and retain explicit text overrides and original bytes',async()=>{
 const {prepareApiSource}=await import('../src/domains/records/base-transfer/source-api.ts'),{allocateImportIdentities}=await import('../src/domains/records/base-transfer/source.ts')
 const metadata=JSON.stringify({tables:[{id:'t',name:'Derived',fields:[{id:'name',name:'Name',type:'singleLineText'},{id:'formula',name:'Formula',type:'formula'},{id:'rollup',name:'Rollup',type:'rollup'},{id:'date',name:'Date output',type:'formula'},{id:'array',name:'Array output',type:'rollup'}]}]})
 const rows='{"records":[{"id":"one","fields":{"name":"One","formula":1.2300e-2,"rollup":"$1,200.00","date":"2026-10-09","array":[9007199254740993,0.123456789012345679]}},{"id":"two","fields":{"name":"Two","formula":2.5,"rollup":"(20)","date":"2026-10-10","array":[1,2]}}]}'
 const source=await prepareApiSource({metadataUrl:'https://recorded.example/schema',recordsUrl:()=> 'https://recorded.example/rows'},async request=>new Response(request.url.endsWith('/schema')?metadata:rows)),ids=allocateImportIdentities(source),p=previewBaseImport(source,{name:'Derived values'},ids)
 assert.deepEqual(p.schemaDraft.tables[0].fields.map(f=>f.type),['text','number','number','text','text'])
 assert.deepEqual(p.records.map(r=>r.fields[ids.tables.t.fields.formula]),['0.0123','2.5'])
 assert.deepEqual(p.records.map(r=>r.fields[ids.tables.t.fields.rollup]),['1200','-20'])
 assert.equal(p.records[0].fields[ids.tables.t.fields.array],'[9007199254740993,0.123456789012345679]')
 assert.equal(p.report.tables[0].rejected,0)
 for(const column of p.report.tables[0].columns.slice(1)){assert.equal(column.notRecreated,2);assert.equal(column.recomputed,0);assert.ok(column.reasons.some(reason=>reason.includes('behavior not recreated')))}
 for(const field of p.schemaDraft.tables[0].fields)assert.equal(field.expression,undefined)
 const explicit=previewBaseImport(source,{name:'Derived text',tables:{t:{columns:{formula:{type:'text'},rollup:{type:'text'}}}}},ids)
 assert.deepEqual(explicit.records.map(r=>r.fields[ids.tables.t.fields.formula]),['1.2300e-2','2.5'])
 assert.deepEqual(explicit.records.map(r=>r.fields[ids.tables.t.fields.rollup]),['$1,200.00','(20)'])
 assert.ok(source.bundle.artifacts.some(a=>Buffer.from(a.original.base64,'base64').toString()===rows))
})

contract('RECORDS-005','declared multi-select display choices distinguish comma formatting, quoted labels and exact leading spaces',async()=>{
 const {sourceChoiceUsage}=await import('../src/domains/records/base-transfer/source-choice-usage.ts')
 assert.deepEqual(sourceChoiceUsage('Backend, Needs review, Documentation',['Backend','Needs review','Documentation','Legacy']),['Backend','Needs review','Documentation'])
 assert.deepEqual(sourceChoiceUsage('"Research, design", Docs',['Research, design','Docs']),['Research, design','Docs'])
 assert.deepEqual(sourceChoiceUsage('Docs, "Research, design"',['Research, design','Docs']),['Docs','Research, design'])
 assert.deepEqual(sourceChoiceUsage(' A',[' A','A']),[' A'])
})

contract('RECORDS-005','rejected rows do not inflate retained-text or checkbox-normalization counts and every conversion keeps its value',async()=>{
 const {prepareCsvSource,allocateImportIdentities}=await import('../src/domains/records/base-transfer/source.ts')
 const source=prepareCsvSource([{filename:'Rows.csv',bytes:Buffer.from('Name,Count,Active\nOne,1,checked\nTwo,2,maybe\nThree,3,\nFour,bad,\n')}])
 const p=previewBaseImport(source,{name:'Rejected cells',tables:{'Rows.csv':{columns:{'column-2':{type:'number'},'column-3':{type:'boolean'}}}}},allocateImportIdentities(source)),table=p.report.tables[0]
 assert.equal(table.rowsRead,4);assert.equal(table.created,2);assert.equal(table.rejected,2)
 assert.equal(table.columns[0].keptText,2)
 assert.equal(table.columns[1].unparseable,1)
 assert.equal(table.columns[2].unparseable,1);assert.equal(table.columns[2].converted,3);assert.equal(table.columns[2].textChanges,3)
 assert.equal(table.columns[2].normalizedCheckedCheckboxTrue,1);assert.equal(table.columns[2].normalizedBlankCheckboxFalse,2)
 assert.deepEqual(p.report.diagnostics.filter(d=>d.code==='CELL_CONVERTED'&&d.columnKey==='column-3').map(d=>d.converted),[true,false,false])
})
contract('RECORDS-005','recorded API checkbox omission is counted separately from explicit false and invalid text',async()=>{
 const {prepareApiSource}=await import('../src/domains/records/base-transfer/source-api.ts'),{allocateImportIdentities}=await import('../src/domains/records/base-transfer/source.ts')
 const metadata={tables:[{id:'table',name:'Checkboxes',fields:[{id:'name',name:'Name',type:'singleLineText'},{id:'active',name:'Active',type:'checkbox'}]}]},rows={records:[{id:'one',fields:{name:'One',active:true}},{id:'two',fields:{name:'Two',active:false}},{id:'three',fields:{name:'Three'}},{id:'four',fields:{name:'Four',active:'bad'}}]}
 const source=await prepareApiSource({metadataUrl:'https://recorded.example/schema',recordsUrl:()=> 'https://recorded.example/rows'},async request=>Response.json(request.url.endsWith('/schema')?metadata:rows)),p=previewBaseImport(source,{name:'Checkboxes'},allocateImportIdentities(source)),table=p.report.tables[0]
 assert.equal(table.rowsRead,4);assert.equal(table.created,3);assert.equal(table.rejected,1)
 assert.equal(table.columns[0].keptText,3)
 assert.equal(table.columns[1].normalizedApiCheckboxTrue,1);assert.equal(table.columns[1].normalizedOmittedCheckboxFalse,1)
 assert.equal(table.columns[1].unparseable,1);assert.equal(table.columns[1].converted,1)
})

contract('RECORDS-005','explicit scalar mappings keep coincidentally equal linked CSV values without a false lookup mismatch',async()=>{
 const {prepareCsvSource,allocateImportIdentities}=await import('../src/domains/records/base-transfer/source.ts')
 const source=prepareCsvSource([{filename:'Teams.csv',bytes:Buffer.from('Name,Active\nNorth,checked\nSouth,\n')},{filename:'People.csv',bytes:Buffer.from('Name,Team,Active\nA,North,checked\nB,South,\n')}])
 const p=previewBaseImport(source,{name:'Explicit scalars',tables:{'Teams.csv':{columns:{'column-2':{type:'boolean'}}},'People.csv':{columns:{'column-2':{type:'relation',relationTableKey:'Teams.csv',cardinality:'one'},'column-3':{type:'boolean'}}}}},allocateImportIdentities(source))
 assert.equal(p.report.diagnostics.some(d=>d.code==='LOOKUP_MISMATCH'),false)
 assert.equal(p.report.lookups.some(l=>l.firstMismatch),false)
 const table=p.schemaDraft.tables.find(t=>t.id===p.identities.tables['People.csv'].entityId)
 assert.equal(table.fields.find(f=>f.id===p.identities.tables['People.csv'].fields['column-3']).type,'boolean')
})
