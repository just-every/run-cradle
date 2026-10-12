import {jsonLimitCase} from './helpers/base-json-limits.mjs'
import {parsePortableBase,validatePortableBase,serializePortableBase} from '../src/domains/records/base-transfer/json-validation.ts'
import {encodedJsonBytes,JSON_BASE_LIMIT} from '../src/domains/records/base-transfer/json-limits.ts'
import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {portableFixture,id} from './helpers/base-exit-fixture.mjs'
import {paddedMetadataCases,invalidMetadataCases,invalidMetadataOverrides,whitespaceMetadataFixture} from './helpers/base-json-metadata-fixture.mjs'
import {assertPortableJsonSchema} from './helpers/json-schema-assert.mjs'
import {prepareJsonSource,allocateJsonIdentities} from '../src/domains/records/base-transfer/source-json.ts'
import {previewJsonImport} from '../src/domains/records/base-transfer/plan-json.ts'
import {draftSchema} from '../src/domains/records/manual/contracts.ts'
const prepare=snapshot=>prepareJsonSource({filename:'metadata.json',bytes:new TextEncoder().encode(JSON.stringify(snapshot))})
contract('RECORDS-005 RECORDS-006','JSON metadata rejects padded and colliding native names before a preview exists',()=>{
 for(const [name,mutate]of invalidMetadataCases){const input=portableFixture();mutate(input);assert.throws(()=>prepare(input),undefined,name)}
 for(const [name,mutate]of paddedMetadataCases){const input=portableFixture();mutate(input);assert.throws(()=>assertPortableJsonSchema(input),undefined,'committed schema: '+name)}
 const input=portableFixture(),source=prepare(input),ids=allocateJsonIdentities(input,'copy')
 for(const [name,options]of invalidMetadataOverrides)assert.throws(()=>previewJsonImport(source,options,ids),undefined,name)
})
contract('RECORDS-005 RECORDS-006','native JSON keeps canonical internal whitespace, business text, option/incoming labels and form text byte-for-byte',()=>{
 const input=whitespaceMetadataFixture();assertPortableJsonSchema(input);const source=prepare(input),ids=allocateJsonIdentities(input,'preserve'),preview=previewJsonImport(source,{name:''},ids)
 assert.deepEqual(source.portableBase,input);assert.deepEqual(draftSchema.parse(preview.schemaDraft),preview.schemaDraft)
 assert.equal(preview.records.find(row=>row.recordId===id(10)).fields[id(3)],' \tTwin\r\n ');assert.equal(preview.records.find(row=>row.recordId===id(10)).fields[id(7)],'  customer@example.test  ')
 assert.equal(preview.schemaDraft.tables[0].fields[0].options[0].label,' Current ');assert.equal(preview.schemaDraft.tables[0].incomingRelations[0].label,' Contacts ');assert.deepEqual(preview.portableForms,input.base.forms);assert.deepEqual(preview.portableViews,input.base.views)
 const renamed=previewJsonImport(source,{name:'Renamed  base',tables:{[id(2)]:{label:'Renamed  table',columns:{[id(3)]:{label:'Renamed  field'}}}}},ids);assert.deepEqual(draftSchema.parse(renamed.schemaDraft),renamed.schemaDraft)
})

contract('RECORDS-005 RECORDS-006','JSON capacity errors name the exact limit and actual table/field/row/cell/byte counts',()=>{
 for(const [kind,count,limit,maximum]of [['tables',21,'tables',20],['fields',81,'fields',80],['records',10001,'records',10000],['cell',100001,'cellCharacters',100000]])assert.throws(()=>validatePortableBase(jsonLimitCase(kind,count)),new RegExp(`LIMIT ${limit} value ${maximum} CURRENT ${count}`))
 const astral=jsonLimitCase('cell',0);astral.base.tables[0].records[0].values[astral.base.tables[0].fields[0].id]='😀'.repeat(100001);assert.throws(()=>validatePortableBase(astral),/LIMIT cellCharacters value 100000 CURRENT 100001/)
 const large=jsonLimitCase('tableBytes',0),expected=Buffer.byteLength(JSON.stringify(large.base.tables[0]));assert.ok(expected>10485760);assert.throws(()=>validatePortableBase(large),new RegExp(String.raw`LIMIT tableBytes value 10485760 CURRENT ${expected} \(10 MiB\)`))
 assert.throws(()=>parsePortableBase(new Uint8Array(JSON_BASE_LIMIT+1)),/LIMIT fileBytes value 209715200 CURRENT 209715201/)
})
contract('RECORDS-006','streamed JSON byte counts equal actual compact and downloadable encoding without altering native content',()=>{
 const values=[null,true,3,'quoted " text\r\n北😀',[],{},[{},[],['two',null]],{x:'value',y:{nested:['😀','\ud800']},z:[]},whitespaceMetadataFixture()]
 for(const value of values)for(const pretty of [false,true])assert.equal(encodedJsonBytes(value,pretty),Buffer.byteLength(JSON.stringify(value,null,pretty?2:undefined)))
 const input=whitespaceMetadataFixture();assert.equal(serializePortableBase(input),JSON.stringify(input,null,2)+'\n')
})
