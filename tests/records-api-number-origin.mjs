import './helpers/typescript-loader.mjs'
import {contract} from './contract.mjs'
const test=(name,fn)=>contract('RECORDS-005',name,fn)
import assert from 'node:assert/strict'
import {convertCell} from '../src/domains/records/base-transfer/convert.ts'
import {columnChoices} from '../src/domains/records/base-transfer/convert-choices.ts'
const column={key:'amount',label:'Amount',sourceType:'number'},field={id:'00000000000000000000000001',label:'Amount',type:'number',required:false,unique:false}
const origin=lexeme=>({lexeme,pointer:'/records/0/fields/Amount'})
test('RECORDS-005 numeric provenance distinguishes unchanged digits from a JSON string and exact text overrides',()=>{
 assert.deepEqual(convertCell(field,column,'42',{},origin('42')),{value:'42',changed:true})
 assert.deepEqual(convertCell(field,column,'42',{}),{value:'42',changed:false})
 assert.deepEqual(convertCell(field,column,'-0',{},origin('-0')),{value:'0',changed:true})
 assert.deepEqual(convertCell({...field,type:'text'},column,'1.23456789012345678e-2',{},origin('1.23456789012345678e-2')),{value:'1.23456789012345678e-2',changed:true})
 assert.deepEqual(convertCell(field,column,'9007199254740992.1',{},origin('9007199254740992.1')),{value:'9007199254740992.1',changed:true})
 assert.throws(()=>convertCell(field,column,'9007199254740993',{},origin('9007199254740993')),/Unsafe API integer/)
 assert.throws(()=>convertCell(field,column,'rounded',{},origin('0.123456789012345678')),/provenance does not match/)
 const table={key:'table',label:'Table',columns:[column],rows:[{key:'r',values:{amount:'1e-32'},numericOrigins:{amount:origin('1e-32')},location:{artifact:'page-1',page:1}}]}
 assert.ok(columnChoices(table,column,{}).validTypes.includes('number'))
 table.rows[0].values.amount='9007199254740993';table.rows[0].numericOrigins.amount=origin('9007199254740993')
 assert.equal(columnChoices(table,column,{}).validTypes.includes('number'),false)
 assert.ok(columnChoices(table,column,{}).validTypes.includes('text'))
})
