import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
export async function workbookDoors(h){
 const csrf=(await(await fetch(h.origin+'/auth/csrf',{headers:{cookie:h.cookie}})).json()).csrfToken
 const raw=(path,body)=>fetch(h.origin+path,{method:body===undefined?'GET':'POST',redirect:'manual',headers:{cookie:h.cookie,origin:h.origin,'x-csrf-token':csrf,...(body instanceof FormData?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})})
 const call=async(path,body,status=200)=>{const r=await raw(path,body),b=await r.json();assert.equal(r.status,status,path+': '+JSON.stringify(b));return b.data??b}
 const command=(action,input,expected=[])=>call('/api/v1/commands/'+action,{commandId:createUlid(),expected,input})
 const form=(bytes,name,preview)=>{const f=new FormData();f.append('files',new Blob([bytes]),name);f.set('options',JSON.stringify(preview?.options??{name:'Workbook journey'}));if(preview){f.set('identities',JSON.stringify(preview.identities));f.set('fingerprint',preview.fingerprint);f.set('acceptLoss','true')}return f}
 async function adopt(bytes,name,preview){preview??=await call('/api/v1/records/base-import/preview',form(bytes,name));const review=await call('/api/v1/records/base-import/review',form(bytes,name,preview)),job=await call('/api/v1/records/base-import/adopt',{reviewId:review.reviewId,fingerprint:review.fingerprint,physicalFingerprint:review.physicalFingerprint,acceptLoss:true});let status;for(let i=0;i<100;i++){status=await call('/api/v1/records/base-import/jobs/'+job.id+'/resume',{});if(status.state==='completed')break;assert.ok(!['failed','rolled_back'].includes(status.state),JSON.stringify(status))}assert.equal(status.state,'completed');status=await call('/api/v1/records/base-import/jobs/'+job.id);return {preview,job,status}}
 return {raw,call,command,form,adopt}
}
