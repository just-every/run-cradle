import assert from 'node:assert/strict'
import {chmod,copyFile} from 'node:fs/promises'
import {bindings} from './rer-data-fixture.mjs'
import {fileRecords} from '@runeditrun/rer/modules/portability/files'
import {encodedRow} from '@runeditrun/rer/modules/portability/catalogue'
import {canonicalJson} from '@runeditrun/rer/modules/portability'
import {platformTable} from '@runeditrun/rer/internal/modules/portability/bookkeeping.mjs'

// rer import reads only an owner's private file, as rer export writes it.
export const place=async(from,to)=>{await copyFile(from,to);await chmod(to,0o600)}
const quote=name=>'"'+name.replaceAll('"','""')+'"'
export async function matchesArchive(root,path){
 const records=[];for await(const record of fileRecords(path))records.push(record)
 const manifest=records[0],items=records.filter(r=>r.kind==='part').flatMap(r=>r.items),tables=manifest.tables.filter(t=>!platformTable(t.name))
 const {LAUNCH_APP_ID,launchEntities}=await import('../../src/apps/launch/contracts.ts')
 const archived=name=>items.filter(i=>i.kind==='row'&&i.table===name).map(i=>i.row)
 const evidence=archived('evidence_comments'),retired=archived('comments').filter(row=>!evidence.some(e=>e.id===row.id))
 const translated=retired.map(row=>{
  const operator=archived('operators').find(o=>o.id===row.author_id),principal=archived('authority_principals').find(p=>p.human_id===operator.id&&p.kind==='human')
  const instant=value=>value===null?null:new Date(value).toISOString()
  return {id:row.id,app_id:LAUNCH_APP_ID,entity_id:launchEntities.campaign,record_id:row.campaign_id,author_id:principal?.id??operator.id,author_kind:principal?.kind??'human',author_label:operator.name,body:row.body,mentions_json:'[]',version:row.version,created_at:instant(row.created_at),updated_at:instant(row.updated_at),deleted_at:instant(row.deleted_at)}
 })
 await bindings(root,async({DB,FILES,WAREHOUSE})=>{
  for(const table of tables){
   if(table.name==='comments'){
    assert.equal(await DB.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='comments'").first(),null,'The retired table is never restored')
    const rows=(await DB.prepare('SELECT * FROM evidence_comments WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(retired.map(row=>row.id))).all()).results
    assert.deepEqual(rows.map(canonicalJson).sort(),translated.map(canonicalJson).sort(),'Every retired comment cell is translated into the record thread')
    continue
   }
   const rows=(await DB.prepare(`SELECT * FROM ${quote(table.name)}`).all()).results.filter(row=>table.name!=='evidence_comments'||!retired.some(c=>c.id===row.id))
   const actual=rows.map(row=>canonicalJson(encodedRow(table,row,manifest.excludedColumns[table.name]??[]))).sort()
   const expected=items.filter(i=>i.kind==='row'&&i.table===table.name).map(i=>canonicalJson(i.row)).sort()
   assert.deepEqual(actual,expected,'Every archived cell: '+table.name)
  }
  for(const object of manifest.objects){
   const file=await ({FILES,WAREHOUSE}[object.bucket]).get(object.key);assert.ok(file,object.key)
   const chunks=items.filter(i=>i.kind==='object'&&i.key===object.key&&i.bucket===object.bucket).sort((a,b)=>a.offset-b.offset)
   assert.deepEqual(Buffer.from(await file.arrayBuffer()),Buffer.concat(chunks.map(i=>Buffer.from(i.data,'base64'))),'Every archived file byte: '+object.key)
   assert.deepEqual(file.httpMetadata,object.httpMetadata)
   assert.deepEqual(file.customMetadata,object.customMetadata)
  }
 })
 console.log('ARCHIVE_MATCH '+JSON.stringify({archive:path.split('/').at(-1),tables:tables.length,rows:tables.reduce((n,t)=>n+t.count,0),objects:manifest.objects.length}))
 return manifest
}
