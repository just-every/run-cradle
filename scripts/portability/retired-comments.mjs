import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {migrationInventory} from '../migration-groups.mjs';
const require=createRequire(import.meta.url),{unstable_splitSqlQuery:split}=require('wrangler');
const retirement=migrationInventory().find(m=>m.name.endsWith('_launch_comments_to_record_thread.sql'));
const statements=split(retirement.sql);
// The live update is the single source of the row and policy translation.
const copy=statements.find(sql=>/INSERT INTO evidence_comments\s*\(/.test(sql));
const policies=statements.filter(sql=>/UPDATE authority_policies/.test(sql));
const retiredStatement=sql=>/CREATE TABLE IF NOT EXISTS comments\s*\(|INSERT INTO evidence_comments\s*\(|UPDATE authority_policies|DROP TABLE comments\b/.test(sql);
export const retirementReplay=(name,sql)=>name===retirement.name?split(sql).filter(sql=>!retiredStatement(sql)):split(sql);

let shape;
export function retiredCommentsShape(){
 if(shape)return shape;
 const scratch=new DatabaseSync(':memory:');
 try{
  for(const migration of migrationInventory())for(const sql of retirementReplay(migration.name,migration.sql))scratch.exec(sql);
  const objects=scratch.prepare("SELECT name,sql,type,tbl_name FROM sqlite_master WHERE tbl_name='comments' AND sql IS NOT NULL ORDER BY name").all();
  shape={objects,table:objects.find(o=>o.type==='table'),columns:scratch.prepare('PRAGMA table_xinfo(comments)').all(),foreignKeys:scratch.prepare('PRAGMA foreign_key_list(comments)').all()};
  return shape;
 }finally{scratch.close();}
}
const normalize=sql=>sql.replace(/;\s*$/,'').replace(/\s+/g,' ').trim();
export const isRetiredComments=table=>table.name==='comments'&&normalize(table.sql)===normalize(retiredCommentsShape().table.sql);

/** A restore-only schema adapter. The retired table exists only in the scratch
 * schema and Base's private staging copies, never in the destination. Base still
 * authenticates the original archive, checks its migration placement, validates
 * every row and file, and publishes in its one atomic restore batch. */
export function retiredCommentsDatabase(db){
 const legacy=retiredCommentsShape(),metadata=new WeakMap();
 const empty=`(SELECT ${legacy.columns.map(c=>`CAST(NULL AS ${c.type}) AS "${c.name}"`).join(',')} WHERE 0)`;
 function prepare(sql){
  const restore=/^INSERT INTO "comments"(?:\s|\()/.test(sql);
  const source=restore?sql.match(/FROM "(rer_portability_stage_[a-f0-9]+_\d+)" s JOIN /)?.[1]:undefined;
  if(restore&&!source)throw new Error('Unsupported retired comment restore statement');
  const rewritten=restore?'SELECT 1':sql.replace(/\bFROM "comments"\b/g,`FROM ${empty}`).replace(/\bFROM "comments"(?=\s|\))/g,`FROM ${empty}`);
  function wrap(statement,values=[]){
   const wrapped={
    bind(...args){return wrap(statement.bind(...args),args);},
    async all(){
     const result=await statement.all();let extra=[];
     if(sql==='PRAGMA table_xinfo("comments")')return {...result,results:legacy.columns};
     if(sql==='PRAGMA foreign_key_list("comments")')return {...result,results:legacy.foreignKeys};
     if(sql==='PRAGMA table_list')extra=[{schema:'main',name:'comments',type:'table',ncol:legacy.columns.length,wr:0,strict:0}];
     if(sql==="SELECT name,sql,type,tbl_name FROM sqlite_master WHERE sql IS NOT NULL AND substr(lower(name),1,7) <> 'sqlite_' AND substr(lower(name),1,4) <> '_cf_' ORDER BY name")extra=legacy.objects;
     if(sql==="SELECT name FROM sqlite_master WHERE type IN ('table','view')")extra=[{name:'comments'}];
     if(sql==="SELECT name,sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL ORDER BY name")extra=[legacy.table];
     return {...result,results:[...result.results,...extra]};
    },
    first(...args){return statement.first(...args);},run(){return statement.run();},raw(...args){return statement.raw(...args);},
   };
   metadata.set(wrapped,{statement,sql,source,values});return wrapped;
  }
  return wrap(db.prepare(rewritten));
 }
 return {prepare,async batch(queries){
  const retired=queries.map(q=>metadata.get(q)).filter(q=>q?.source);
  const native=queries.map(q=>metadata.get(q)?.statement??q);
  if(retired.length){
   // Wait until operators, principals and existing evidence rows are restored.
   // Insert before Base drops staging, within the same transaction and fences.
   const at=queries.findIndex(q=>/^DROP TABLE IF EXISTS "rer_portability_stage_/.test(metadata.get(q)?.sql??''));
   if(at<0)throw new Error('Retired comment restore requires atomic staging cleanup');
   const translations=retired.flatMap(q=>[
    db.prepare(`INSERT INTO rer_portability_guard(value) SELECT CASE WHEN NOT EXISTS(
     SELECT 1 FROM "${q.source}" c WHERE NOT EXISTS(SELECT 1 FROM operators WHERE id=c.author_id)
      OR NOT EXISTS(SELECT 1 FROM campaigns WHERE id=c.campaign_id)) THEN 1 ELSE 0 END`),
    db.prepare(copy.replace(/FROM comments c\b/,`FROM "${q.source}" c`)),
   ]);
   native.splice(at,0,...translations,...policies.map(sql=>db.prepare(sql)));
  }
  return db.batch(native);
 }};
}
