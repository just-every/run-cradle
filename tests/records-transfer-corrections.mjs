import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {prepareCsvSource,allocateImportIdentities} from '../src/domains/records/base-transfer/source.ts'
import {previewBaseImport} from '../src/domains/records/base-transfer/plan.ts'
import {rawCellText} from '../src/domains/records/base-transfer/format.ts'
import {convertCell} from '../src/domains/records/base-transfer/convert.ts'
const bytes=text=>new TextEncoder().encode(text)
const sourceOf=(name='A.csv')=>prepareCsvSource([{filename:name,bytes:bytes('Name,Value\r\nFirst,one\r\nSecond,two\r\n')}])
contract('RECORDS-005','source coordinates and all destination identity categories reject aliases before producing a preview',()=>{
 for(const mutate of [
  (s,i)=>s.tables[0].rows.push(structuredClone(s.tables[0].rows[0])),
  (s,i)=>s.tables[0].columns.push(structuredClone(s.tables[0].columns[0])),
  (s,i)=>s.tables.push(structuredClone(s.tables[0])),
  (s,i)=>i.tables['A.csv'].records['row-2']=i.tables['A.csv'].records['row-1'],
  (s,i)=>i.tables['A.csv'].fields['column-2']=i.tables['A.csv'].fields['column-1'],
  (s,i)=>i.tables['A.csv'].records['row-1']=i.appId,
  (s,i)=>i.tables['A.csv'].options['column-2'].one=i.tables['A.csv'].fields['column-1'],
  (s,i)=>i.tables['A.csv'].fields['column-2']='not-an-id'
 ]){const s=sourceOf(),i=allocateImportIdentities(s);mutate(s,i);assert.throws(()=>previewBaseImport(s,{name:'Invalid'},i),/Duplicate|identity/)}
 const s=prepareCsvSource([{filename:'A',bytes:bytes('Name\na')},{filename:'A:row-1',bytes:bytes('Name\nb')}]);s.tables[0].rows[0].key='row-1:row-1';const i=allocateImportIdentities(s);assert.throws(()=>previewBaseImport(s,{name:'Qualified collision'},i),/Duplicate source qualified record/)
 const two=prepareCsvSource([{filename:'A.csv',bytes:bytes('Name\na')},{filename:'B.csv',bytes:bytes('Name\nb')}]),ids=allocateImportIdentities(two);ids.tables['B.csv'].records['row-1']=ids.tables['A.csv'].records['row-1'];assert.throws(()=>previewBaseImport(two,{name:'Across tables'},ids),/Duplicate destination/)
})
contract('RECORDS-005','unchanged formula, rollup, datetime and collaborator text still requires semantic-loss acknowledgment',()=>{
 for(const sourceType of ['formula','rollup','dateTime','multipleLookupValues','multipleSelects','singleCollaborator','multipleCollaborators','createdBy','lastModifiedBy']){const source=sourceOf();source.format='api';source.tables[0].columns[1].sourceType=sourceType;const preview=previewBaseImport(source,{name:'Review semantics'},allocateImportIdentities(source));assert.equal(preview.report.tables[0].columns[1].converted,0);assert.equal(preview.report.tables[0].columns[1].skippedNonempty,0);assert.equal(preview.acknowledgments.loss,true);assert.equal(preview.acknowledgmentRequired,true);assert.ok(preview.report.diagnostics.some(d=>d.code==='SOURCE_TYPE_MAPPING'));assert.deepEqual(preview.records.map(row=>row.fields[preview.identities.tables['A.csv'].fields['column-2']]),['one','two'])}
})
contract('RECORDS-005','nested numeric token display preserves exact JSON digits and token versus string provenance',()=>{
 const value=['0.123456789012345678',['9007199254740993','1.2300'],'42'],tokens=[{path:[0],lexeme:value[0],pointer:'/records/0/fields/Rollup/0'},{path:[1,0],lexeme:value[1][0],pointer:'/records/0/fields/Rollup/1/0'},{path:[1,1],lexeme:value[1][1],pointer:'/records/0/fields/Rollup/1/1'}]
 assert.equal(rawCellText(value,tokens),'[0.123456789012345678,[9007199254740993,1.2300],"42"]')
 assert.deepEqual(convertCell({id:'0'.repeat(26),type:'text',label:'Rollup',required:false,unique:false},{key:'r',label:'Rollup',sourceType:'rollup'},value,{},undefined,tokens),{value:'[0.123456789012345678,[9007199254740993,1.2300],"42"]',changed:true})
 assert.throws(()=>rawCellText(['rounded'],tokens),/provenance/)
})
