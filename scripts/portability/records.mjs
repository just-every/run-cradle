import {createRequire} from 'node:module';
import {join} from 'node:path';
import {PortabilityError} from '../base-cli/modules/portability/index.mjs';
import {catalogue,policy} from '../base-cli/modules/portability/catalogue.mjs';
import {archiveRecords} from './files.mjs';
const quote=name=>'"'+name.replaceAll('"','""')+'"';
const normalize=sql=>sql.replace(/;\s*$/,'').replace(/\s+/g,' ').trim();
const refuse=code=>{throw new PortabilityError(code,409);};

export async function derivedSearch(db){
 const virtual=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND sql LIKE 'CREATE VIRTUAL TABLE%' ORDER BY name").all()).results;
 const derived=['launch_search'];
 for(const {name} of virtual){
  if(name==='launch_search')continue;
  if(!/^r_[a-z0-9_]+_search$/.test(name))continue;
  const source=name.slice(0,-7);
  if(!(await db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").bind(source).first()))continue;
  const columns=(await db.prepare(`PRAGMA table_xinfo(${quote(name)})`).all()).results.filter(c=>!c.hidden).map(c=>c.name);
  const base=new Set((await db.prepare(`PRAGMA table_xinfo(${quote(source)})`).all()).results.map(c=>c.name));
  if(columns[0]!=='record_id'||!columns.slice(1).every(c=>base.has(c)))continue;
  derived.push(name);
 }
 return derived;
}

/** Integrity is checked by Base before any destination schema is changed. */
export async function prepareRecordRestore(db,root,path,config){
 let manifest;const current=[],groups=[];
 for await(const record of archiveRecords(path)){
  if(record.kind==='manifest')manifest=record;
  if(record.kind!=='part')continue;
  for(const item of record.items){
   if(item.kind!=='row')continue;
   if(item.table==='record_schemas')current.push(JSON.parse(item.row.schema_json));
   if(item.table==='manual_record_releases'){
    const detail=JSON.parse(item.row.detail_json);
    for(const schemas of [detail.prior,detail.schemas])if(Array.isArray(schemas))groups.push(schemas);
   }
  }
 }
 groups.push(current);
 if(manifest.product!==config.product)refuse('wrong_product');
 const cat=await catalogue(db,policy({...config,derivedTables:await derivedSearch(db)}));
 for(const table of cat.tables){
  if(config.replaceableTables.includes(table.name))continue;
  if(await db.prepare(`SELECT 1 FROM ${quote(table.name)} LIMIT 1`).first())refuse('restore_nonempty');
 }
 if(await db.prepare('SELECT 1 FROM oa_operators LIMIT 1').first())refuse('restore_nonempty');
 const {build}=createRequire(join(root,'package.json'))('esbuild');
 const compiled=await build({entryPoints:[join(root,'src/domains/records/portable-schema.server.ts')],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
 const {portableRecordSchema}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].contents).toString('base64'));
 const plans=portableRecordSchema(groups),byName=new Map(plans.map(plan=>[plan.name,plan]));
 const missing=manifest.tables.filter(t=>!cat.tables.some(old=>old.name===t.name));
 for(const table of missing){
  const plan=byName.get(table.name);
  if(!plan||!/^CREATE TABLE /.test(plan.sql)||normalize(plan.sql)!==normalize(table.sql))refuse('unsupported_record_schema');
 }
 const required=new Set(missing.map(t=>t.name)),creates=[];
 for(const plan of plans){
  // Compiler objects belong to one archived physical table, never arbitrary archive SQL.
  if(![...required].some(name=>plan.name===name||plan.name.startsWith(name+'_')))continue;
  const existing=await db.prepare('SELECT sql FROM sqlite_master WHERE name=?').bind(plan.name).first();
  if(existing){if(normalize(existing.sql)!==normalize(plan.sql))refuse('schema_mismatch');continue;}
  creates.push(plan);
 }
 if(creates.length)await db.batch(creates.map(plan=>db.prepare(plan.sql)));
 return async()=>{
  // Failed native restore leaves the pre-existing installation intact.
  if(!creates.length)return;
  for(const name of required)if(await db.prepare(`SELECT 1 FROM ${quote(name)} LIMIT 1`).first())return;
  const drops=creates.filter(plan=>/^CREATE (?:VIRTUAL )?TABLE /.test(plan.sql)).reverse();
  for(const plan of drops)await db.prepare(`DROP TABLE IF EXISTS ${quote(plan.name)}`).run();
 };
}
