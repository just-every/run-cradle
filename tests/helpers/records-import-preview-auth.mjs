import './typescript-loader.mjs'
import assert from 'node:assert/strict'
import {createOperatorAuth} from '../../vendor/base/modules/operator-auth/index.mjs'
import {createImportPreviewAuthentication} from '../../src/domains/records/base-transfer/authority-preview.server.ts'
import {baseImportHttp} from '../../src/domains/records/base-transfer/http.server.ts'
import {createUlid} from '../../src/core/shared/ids.ts'
import {digest} from '../../src/domains/authority/crypto.server.ts'
export async function assertReadOnlyPreview(h,snapshot){
 const origin='https://import.example.test',secret='test-only-import-auth-secret-at-least-32-bytes',base=createOperatorAuth({db:h.db,config:{origin,SESSION_SECRET:secret,SETUP_TOKEN:secret,OWNER_EMAIL:'import-owner@example.test'},clientIp:()=> '192.0.2.10'}),login=await base.bootstrap(new Request(origin+'/auth/bootstrap',{method:'POST',headers:{origin}}),{token:secret,displayName:'Import owner',returnTo:'/app'}),cookie=login.cookie.split(';')[0],owner=await h.db.prepare('SELECT principal_id FROM cradle_base_operators WHERE base_id=?').bind(login.operator.id).first(),sessionId=createUlid(),now=Date.now(),csrf='test-only-csrf-proof'
 await h.db.prepare('INSERT INTO authority_sessions(id,principal_id,token_hash,csrf_hash,authentication_epoch,created_at,last_seen_at,expires_at) VALUES(?,?,?,?,(SELECT authentication_epoch FROM authority_principals WHERE id=?),?,?,?)').bind(sessionId,owner.principal_id,'base:'+login.session.id,await digest(csrf),owner.principal_id,now,now,now+3600000).run();await h.db.prepare('INSERT INTO cradle_base_sessions(base_id,session_id) VALUES(?,?)').bind(login.session.id,sessionId).run()
 const auth=createImportPreviewAuthentication(h.db,{base,appOrigin:origin,sessionSecret:secret,mode:'production',initializeBaseOwner:()=>{throw new Error('Pure preview must never initialize owner state')}})
 const service=new Proxy({},{get(){return()=>{throw new Error('Over-limit upload reached service')}}}),source={prepare(){throw new Error('Over-limit upload reached parser')},identities(){throw new Error('Over-limit upload reached identity allocator')}},http=baseImportHttp(service,source,()=>{throw new Error('Ordinary mutable authentication used')},auth)
 const request=()=>{const form=new FormData();form.append('files',new Blob([new Uint8Array(10485761)],{type:'text/csv'}),'Too big.csv');form.set('options',JSON.stringify({name:'Too big'}));return new Request(origin+'/api/v1/records/base-import/preview',{method:'POST',headers:{origin,cookie,'x-csrf-token':csrf},body:form})}
 const before=await snapshot(),result=await http.fetch(request());assert.equal(result.status,413,await result.clone().text());assert.equal(await snapshot(),before)
 const {prepareCsvSource,allocateImportIdentities}=await import('../../src/domains/records/base-transfer/source.ts'),{previewBaseImport}=await import('../../src/domains/records/base-transfer/plan.ts'),pureHttp=baseImportHttp({uploadPreview:(_ctx,source,options,ids)=>previewBaseImport(source,options,ids)},{prepare:prepareCsvSource,identities:allocateImportIdentities},()=>{throw new Error('Mutable auth used')},auth)
 const upload=bytes=>{const form=new FormData();form.append('files',new Blob([bytes],{type:'text/csv'}),'Values.csv');form.set('options',JSON.stringify({name:'Preview'}));return new Request(origin+'/api/v1/records/base-import/preview',{method:'POST',headers:{origin,cookie,'x-csrf-token':csrf},body:form})}
 const unchanged=await snapshot(),valid=await pureHttp.fetch(upload(new TextEncoder().encode('Name\nVisible\n')));assert.equal(valid.status,200,await valid.clone().text());assert.equal((await valid.json()).data.records.length,1);assert.equal(await snapshot(),unchanged)
 const malformed=await pureHttp.fetch(upload(new Uint8Array([78,97,109,101,10,255])));assert.equal(malformed.status,400);assert.match((await malformed.json()).error.message,/LINE 2.*UTF-8/);assert.equal(await snapshot(),unchanged)
 const cases=[
  [Array.from({length:81},(_,i)=>'Header'+i).join(',')+'\n',/fields.*80.*81/],
  ['Name\n'+'row\n'.repeat(10001),/csvImportRows.*10000.*10001/],
  ['Name\n'+'😀'.repeat(100001)+'\n',/cellCharacters.*100000.*100001/],
  ['Name\n"Unclosed',/Values.csv LINE 2.*Unterminated quote/],
  ['Name,Name\n',/Values.csv LINE 1.*Duplicate header/],
  ['Name,Other\nOnly one\n',/Values.csv LINE 2.*Ragged row/]
 ];for(const [text,reason]of cases){const response=await pureHttp.fetch(upload(new TextEncoder().encode(text)));assert.equal(response.status,400);assert.match((await response.json()).error.message,reason);assert.equal(await snapshot(),unchanged)}
 const tooMany=new FormData();for(let i=0;i<21;i++)tooMany.append('files',new Blob(['Name\nValue\n'],{type:'text/csv'}),'Table'+i+'.csv');tooMany.set('options',JSON.stringify({name:'Too many'}));const tableLimit=await pureHttp.fetch(new Request(origin+'/api/v1/records/base-import/preview',{method:'POST',headers:{origin,cookie,'x-csrf-token':csrf},body:tooMany}));assert.equal(tableLimit.status,400);assert.match((await tableLimit.json()).error.message,/tables.*20.*21/);assert.equal(await snapshot(),unchanged)
 await h.db.prepare('UPDATE oa_sessions SET revoked_at=? WHERE id=?').bind(now,login.session.id).run();const revoked=await snapshot();assert.equal((await http.fetch(request())).status,401);assert.equal(await snapshot(),revoked)

}
