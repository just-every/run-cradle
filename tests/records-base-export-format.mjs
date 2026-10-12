import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {portableFixture,id} from './helpers/base-exit-fixture.mjs'
import {projectionFixture} from './helpers/base-projection-fixture.mjs'
import {assertPortableJsonSchema,assertCorrespondenceSchema} from './helpers/json-schema-assert.mjs'
import {csvDownloadEntries} from './helpers/base-csv-download.mjs'
import {validatePortableBase,serializePortableBase} from '../src/domains/records/base-transfer/json-validation.ts'
import {exportCsvSet,csvSetDownload} from '../src/domains/records/base-transfer/export-csv-set.ts'
import {parseCsv} from '../src/domains/portability/csv.ts'
const csv=text=>parseCsv(new TextEncoder().encode(text))
contract('RECORDS-006','portable JSON schema executes against native declarations and strict wrong-format/property/link negatives',()=>{
 const value=portableFixture();assertPortableJsonSchema(value);assert.deepEqual(validatePortableBase(JSON.parse(serializePortableBase(value))),value)
 for(const mutate of [v=>v.format='wrong',v=>v.version=2,v=>v.base.tables[0].fields[0].type='unknown',v=>v.base.views[0].operator='outside',v=>v.base.forms[0].authenticated=false]){const invalid=structuredClone(value);mutate(invalid);assert.throws(()=>assertPortableJsonSchema(invalid));assert.throws(()=>validatePortableBase(invalid))}
 const many=projectionFixture();many.base.tables[1].records[0].values[many.base.tables[1].fields[1].id]=null;assert.throws(()=>validatePortableBase(many),/invalid link cardinality/)
})
contract('RECORDS-006','CSV export exact hand-authored rows retain all fields, inner quotes, distinct source targets and total empty-cell states',()=>{
 const set=exportCsvSet(portableFixture());assertCorrespondenceSchema(set.correspondence)
 assert.deepEqual(csv(set.files[0].csv),{headers:['Company','Status','Business email','Contacts'],rows:[['Twin','Current','business@example.test','"First"'],['Twin','','','"Second"'],['North, "Quoted"\n北','Current','','"Third"']]})
 assert.deepEqual(csv(set.files[1].csv),{headers:['Name','Company','Company status','Amount','Due','Checked'],rows:[['First','"Twin"','Current','12345678901234567890.125','2026-10-08','checked'],['Second','"Twin"','','0','',''],['Third','"North, ""Quoted""\n北"','Current','','','']]})
 assert.deepEqual(set.options.tables[set.files[0].filename].columns['column-2'].options,['Current','Unused'])
 assert.deepEqual(set.correspondence.references.filter(ref=>ref.columnId===id(22)).map(ref=>[ref.recordId,ref.targetRecordId,ref.occurrence]),[[id(30),id(10),0],[id(31),id(11),0],[id(32),id(12),0]])
 assert.deepEqual(set.correspondence.cells.map(cell=>[cell.recordId,cell.columnId,cell.state]),[[id(11),id(4),'null'],[id(11),id(7),'null'],[id(12),id(7),'empty'],[id(31),id(25),'null'],[id(31),id(26),'false'],[id(32),id(24),'null'],[id(32),id(25),'null'],[id(32),id(26),'null']])
 const invalid=structuredClone(set.correspondence);invalid.cells[0].state='unknown';assert.throws(()=>assertCorrespondenceSchema(invalid))
})
contract('RECORDS-006','ZIP retains unique safe table files and public metadata; wide incoming projections keep the ordered MANY writer',()=>{
 const input=projectionFixture(80),set=exportCsvSet(input),writer=csv(set.files[1].csv);assert.equal(csv(set.files[0].csv).headers.length,82);assert.equal(writer.rows[0][1],'"Second","First"');assert.deepEqual(set.correspondence.references.filter(ref=>ref.tableId===input.base.tables[1].id).map(ref=>ref.targetRecordId),[String(501).padStart(26,'0'),String(500).padStart(26,'0')]);assertCorrespondenceSchema(set.correspondence)
 input.base.tables[0].label='../same';input.base.tables[1].label='../same';const entries=csvDownloadEntries(csvSetDownload(input).bytes);assert.equal(entries.length,5);assert.equal(entries.filter(entry=>entry.name.endsWith('.csv')).length,2);assert.equal(new Set(entries.map(entry=>entry.name)).size,5);assert.ok(entries.every(entry=>!/[\\/]/.test(entry.name)));assert.deepEqual(entries.filter(entry=>!entry.name.endsWith('.csv')).map(entry=>entry.name).sort(),['README.txt','correspondence.json','import-options.json'])
 for(const table of input.base.tables)table.records=[];const empty=exportCsvSet(input);assert.equal(csv(empty.files[0].csv).headers.length,82);assert.deepEqual(empty.correspondence.references,[]);assert.deepEqual(empty.correspondence.cells,[]);assertCorrespondenceSchema(empty.correspondence)
})
