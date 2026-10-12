import {contract} from './contract.mjs'
const test=(name,fn)=>contract('RECORDS-005',name,fn)
import assert from 'node:assert/strict'
import {exactApiNumber} from '../src/domains/records/base-transfer/numeric-lexeme.ts'
test('RECORDS-005 API tokens normalize by exact digits within native bounds and safe integer policy',()=>{
 const cases=[['0.123456789012345678','0.123456789012345678'],['0.12345678901234567890123456789012','0.12345678901234567890123456789012'],['9007199254740991.1','9007199254740991.1'],['0.99999999999999999999999999999999','0.99999999999999999999999999999999'],['-1.00000000000000001','-1.00000000000000001'],['1.2300','1.23'],['123e-2','1.23'],['1.23E+2','123'],['1e-32','0.'+'0'.repeat(31)+'1'],['0','0'],['-0','0'],['-0.000e999999999999999999999','0'],['1.0000000000000000000000000000000000000000','1'],['10e-1','1'],['1e0000000000000000000000000000000000000001','10'],['9'.repeat(128)+'.1','9'.repeat(128)+'.1']]
 for(const [token,expected]of cases)assert.equal(exactApiNumber(token),expected,token)
 for(const token of ['9007199254740992','9007199254740993','-9007199254740993','90071992547409930e-1'])assert.throws(()=>exactApiNumber(token),/Unsafe API integer/,token)
 for(const token of ['1e309','1e-33','1e999999999999999999999','1e-999999999999999999999','9'.repeat(129)+'.1','0.'+'0'.repeat(32)+'1'])assert.throws(()=>exactApiNumber(token),/128 integer \/ 32 fractional/,token)
 for(const token of ['01','NaN','Infinity','1.','+1','1e',' 1','1\n'])assert.throws(()=>exactApiNumber(token),/Expected original JSON/,token)
})

test('RECORDS-005 exact normalization agrees with independent rational arithmetic over bounded exponent forms',()=>{
 // Compare exact rational values; Number never represents a source value here.
 for(let coefficient=-30;coefficient<=30;coefficient++)for(let exponent=-8;exponent<=8;exponent++){
  const token=`${coefficient}e${exponent}`,actual=exactApiNumber(token),negative=actual.startsWith('-'),[whole,fraction='']=actual.replace('-','').split('.'),actualUnits=BigInt((negative?'-':'')+whole+fraction)
  const sourceUnits=BigInt(coefficient)*10n**BigInt(Math.max(exponent,0)),sourceScale=BigInt(Math.max(-exponent,0))
  assert.equal(actualUnits*10n**sourceScale,sourceUnits*10n**BigInt(fraction.length),token)
 }
})
