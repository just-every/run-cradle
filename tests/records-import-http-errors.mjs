import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {baseImportHttp} from '../src/domains/records/base-transfer/http.server.ts'
import {prepareCsvSource,allocateImportIdentities} from '../src/domains/records/base-transfer/source.ts'
import {AdmissionError} from '../src/domains/admission/errors.ts'

const origin='https://import-errors.example.test'
function fixture(error){
 let calls=0
 const app=baseImportHttp({uploadPreview(){calls++;throw error}},{prepare:prepareCsvSource,identities:allocateImportIdentities},async()=>({}),async()=>({}))
 return {app,calls:()=>calls}
}
function request(csv='Name\nOne\n',options={name:'Errors'}){
 const form=new FormData();form.append('files',new File([csv],'Exact.csv'));form.append('options',JSON.stringify(options))
 return new Request(origin+'/api/v1/records/base-import/preview',{method:'POST',headers:{origin},body:form})
}
contract('RECORDS-005 BASE-INPUT-001','HTTP preserves capacity code and exact source diagnostics while concealing unexpected physical preflight errors',async()=>{
 const capacity=fixture(new AdmissionError('capacity_limit','Import plan size limit 300000000 bytes; current 300000001 bytes. Nothing was written.'))
 const limited=await capacity.app.fetch(request());assert.equal(limited.status,409);const body=await limited.json();assert.equal(body.error.code,'capacity_limit');assert.match(body.error.message,/current 300000001/)
 const unexpected=fixture(new Error('internal SQL and private-schema detail'))
 const failed=await unexpected.app.fetch(request());assert.equal(failed.status,500);const failure=await failed.json();assert.equal(failure.error.code,'internal');assert.equal(failure.error.message,'The operation could not be completed.');assert.doesNotMatch(JSON.stringify(failure),/private-schema|internal SQL/)
 const malformed=fixture(new Error('should never reach physical planning'))
 const invalid=await malformed.app.fetch(request('Name,Other\nOne\n'));assert.equal(invalid.status,400);const invalidBody=await invalid.json();assert.equal(invalidBody.error.code,'validation');assert.match(invalidBody.error.message,/Exact\.csv LINE 2: Ragged row/);assert.equal(malformed.calls(),0)
})
contract('RECORDS-005 BASE-INPUT-001','the existing multipart byte bound rejects oversized requests before source preparation',async()=>{
 const h=fixture(new Error('must not plan'))
 const oversized=request();oversized.headers.set('content-length',String(20*10485760+1048576+1))
 const response=await h.app.fetch(oversized);assert.equal(response.status,413);const body=await response.json();assert.equal(body.error.code,'upload_rejected');assert.match(body.error.message,/multipartBytes limit/);assert.equal(h.calls(),0)
})
