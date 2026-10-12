import assert from 'node:assert/strict'
import {mock} from 'node:test'
import {contract} from './contract.mjs'
import {canonicalJson,sha256} from '../vendor/base/modules/import-kit/src/provenance/identity.ts'
import {canonicalJsonBytes} from '../vendor/base/modules/import-kit/src/plan/size.ts'
import {canonicalChunks,canonicalHash} from '../src/domains/records/base-transfer/canonical-stream.ts'
import {prepareCsvSource,allocateImportIdentities} from '../src/domains/records/base-transfer/source.ts'
import {previewBaseImport} from '../src/domains/records/base-transfer/plan.ts'

contract('RECORDS-005','streamed canonical encoding preserves Kit bytes and hashes across string boundaries, shared references and own keys',()=>{
 const shared={value:'a'.repeat(4095)+'🌳'+String.fromCharCode(0xd800)+'\u0000\r\n"\\'+'é'.repeat(4096)},own=Object.assign(Object.create(null),{'2':'two','10':'ten',constructor:'data'})
 Object.defineProperty(own,'__proto__',{value:shared,enumerable:true})
 const content={z:shared,a:[shared,own,null,true,false,1.25,-0,1e30,'',[],{}]}
 const expected=canonicalJson(content),chunks=[...canonicalChunks(content)]
 assert.equal(chunks.join(''),expected)
 assert.equal(chunks.reduce((n,c)=>n+Buffer.byteLength(c),0),canonicalJsonBytes(content))
 assert.ok(chunks.every(c=>c.length<=24576))
 assert.equal(canonicalHash(content),sha256(expected))
 const stringify=JSON.stringify
 try{
  mock.method(JSON,'stringify',(value,...args)=>{if(typeof value==='string')assert.ok(value.length<=4096,'canonical leaves must be escaped in bounded slices');return Reflect.apply(stringify,JSON,[value,...args])})
  assert.equal(canonicalHash(content),sha256(expected))
 }finally{mock.restoreAll()}
 for(const invalid of [undefined,NaN,Infinity,new Date(),[undefined]])assert.throws(()=>canonicalHash(invalid),/INVALID_JSON/)
 const cyclic={};cyclic.self=cyclic;assert.throws(()=>canonicalHash(cyclic),/cyclic/)
 let nested={};for(let i=0;i<256;i++)nested={nested};assert.throws(()=>canonicalHash(nested),/excessively nested/)
})

contract('RECORDS-005','ordinary preview logical fingerprint remains byte-identical to the previous complete canonical encoding and survives JSON replay',()=>{
 const source=prepareCsvSource([{filename:'Rows.csv',bytes:Buffer.from('Name,Amount,Notes\r\nOne,"$1,234.00",🌳\r\nTwo,50%,"Quoted ""value"""\r\n')}]),ids=allocateImportIdentities(source),preview=previewBaseImport(source,{name:'Byte-equivalent'},ids)
 const {fingerprint,acknowledgmentRequired,...content}=preview
 assert.equal(fingerprint,sha256(canonicalJson(content)))
 const replay=JSON.parse(JSON.stringify(preview))
 assert.equal(previewBaseImport(replay.source,replay.options,replay.identities).fingerprint,fingerprint)
 assert.equal(Buffer.from(preview.source.bundle.artifacts[0].original.base64,'base64').toString(),'Name,Amount,Notes\r\nOne,"$1,234.00",🌳\r\nTwo,50%,"Quoted ""value"""\r\n')
 assert.equal(acknowledgmentRequired,true)
})
