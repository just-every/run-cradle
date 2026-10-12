import assert from 'node:assert/strict'
import {mkdtemp,rm,writeFile,symlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {contract} from './contract.mjs'
const require=createRequire(import.meta.url),{build}=require('../node_modules/.pnpm/esbuild@0.28.1/node_modules/esbuild')

contract('RECORDS-002 RECORDS-003','detail renders the complete authorised relation cell beyond its capped query page',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'records-detail-review-'))
 try{
  await symlink(path.resolve('node_modules'),path.join(directory,'node_modules'),'dir')
  const file=path.join(directory,'views.mjs')
  await build({stdin:{contents:"export {createElement as h} from 'react';export {renderToStaticMarkup as render} from 'react-dom/server';export {DocumentDataContext} from './src/core/app/document-data';export {RecordDetailPage} from './src/ui/records/record-detail-page';export {createRouter,createRootRoute,RouterProvider,createMemoryHistory} from '@tanstack/react-router';",resolveDir:process.cwd()},outfile:file,bundle:true,platform:'node',format:'esm',packages:'external',loader:{'.css':'empty'},jsx:'automatic',logLevel:'silent'})
  const r=await import(file),appId='00000000000000000000000901',entityId='00000000000000000000000902',targetId='00000000000000000000000903',linkId='00000000000000000000000904',titleId='00000000000000000000000905',recordId='00000000000000000000000906',nameId='00000000000000000000000907',now='2026-10-08T00:00:00.000Z',base=`/api/v1/apps/${appId}/entities/${entityId}`,target=`/api/v1/apps/${appId}/entities/${targetId}`
  const schema={appId,id:entityId,label:'Collections',fields:[{id:titleId,label:'Title',type:'text'},{id:linkId,label:'Collection links',type:'relation',relation:{ownerAppId:appId,entityId:targetId,cardinality:'many'}}]},targetSchema={appId,id:targetId,label:'Items',fields:[{id:nameId,label:'Name',type:'text'}]}
  // A scoped reader has already removed inaccessible references. The relation query is only its first 200 rows.
  const refs=Array.from({length:206},(_,index)=>({appId,entityId:targetId,recordId:String(1000+index).padStart(26,'0')})),rows=refs.map((ref,index)=>({id:ref.recordId,ref,version:1,fields:{[nameId]:{state:'value',value:`Linked item ${index}`}},allowedActions:[],createdAt:now,updatedAt:now})),record={id:recordId,ref:{appId,entityId,recordId},version:1,fields:{[titleId]:{state:'value',value:'Authorised collection'},[linkId]:{state:'value',value:refs}},allowedActions:[],createdAt:now,updatedAt:now},detail={record,relations:[{fieldId:linkId,page:{items:rows.slice(0,200),nextCursor:'more-authorised-rows'}}],evidenceIds:[]}
  const document={'/api/session':{operator:{id:'owner',name:'Owner',initials:'OW',email:'owner@example.test'},workspace:{id:'workspace',name:'Test workspace',timezone:'UTC',currency:'AUD'},unreadNotifications:0},[base]:{data:schema},[`${base}/records/${recordId}`]:{data:detail},[target]:{data:targetSchema},...Object.fromEntries(rows.map(row=>[`${target}/records/${row.id}`,{data:{record:row}}]))}
  const render=async()=>{const routeTree=r.createRootRoute({component:()=>r.h(r.DocumentDataContext.Provider,{value:document},r.h(r.RecordDetailPage,{appId,entityId,recordId}))}),router=r.createRouter({routeTree,history:r.createMemoryHistory({initialEntries:['/']})});await router.load();return r.render(r.h(r.RouterProvider,{router}))}
  const html=await render(),links=[...html.matchAll(/href="(\/app\/records\/[^\"]+)"/g)].map(match=>match[1]).filter(href=>href.startsWith(`/app/records/${appId}/${targetId}/`))
  assert.equal(detail.relations[0].page.items.length,200);assert.equal(links.length,206);assert.deepEqual(new Set(links),new Set(refs.map(ref=>`/app/records/${appId}/${targetId}/${ref.recordId}`)));assert.match(html,/Linked item 205/)
  assert.equal((html.match(/<h2>Collection links<\/h2>/g)??[]).length,1);assert.doesNotMatch(html,/<dt[^>]*>Collection links<\/dt>/)
  // Restrict the relation field: no query section or references can survive this scoped cell.
  record.fields[linkId]={state:'redacted',reason:'policy'};detail.relations=[];const restricted=await render();assert.match(restricted,/>Restricted<\/span>/);assert.doesNotMatch(restricted,/Linked item|<h2>Collection links<\/h2>/);assert.equal((restricted.match(/<dt[^>]*>Collection links<\/dt>/g)??[]).length,1)
  if(process.env.CRADLE_RECORDS_OUTPUT){await writeFile(path.join(process.env.CRADLE_RECORDS_OUTPUT,'relation-cap-render.html'),html);await writeFile(path.join(process.env.CRADLE_RECORDS_OUTPUT,'relation-cap-render.json'),JSON.stringify({queryPage:200,authorisedLinks:206,singleHeading:true,restrictedField:true},null,2))}
 }finally{await rm(directory,{recursive:true,force:true})}
})
