import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {readFile} from 'node:fs/promises';
const quote=name=>'"'+name.replaceAll('"','""')+'"';
const activeBindings=new Map();
export function useRuntimeBindings(root,env){if(activeBindings.has(root))throw new Error('A fixture runtime already owns these bindings');activeBindings.set(root,env);return()=>activeBindings.delete(root)}
export function hasRuntimeBindings(root){return activeBindings.has(root)}
export async function bindings(root,run){
 if(activeBindings.has(root))return run(activeBindings.get(root));
 const {getPlatformProxy}=createRequire(join(root,'package.json'))('wrangler');
 const proxy=await getPlatformProxy({configPath:join(root,'wrangler.jsonc'),persist:{path:join(root,'.wrangler/state/v3')},remoteBindings:false});
 try{return await run(proxy.env);}finally{await proxy.dispose();}
}
export async function seedData(root){
 return bindings(root,async({DB:db,FILES:files})=>{
  const sample=JSON.parse(await readFile(join(root,'sample-data/cradle.json'),'utf8'));
  const owner=(await db.prepare('SELECT id FROM operators WHERE active=1 LIMIT 1').first()).id;
  const map=new Map(sample.operators.map(o=>[o.id,owner]));
  for(const table of ['campaigns','deliverables','milestones','risks','decisions']){
   const columns=(await db.prepare(`PRAGMA table_xinfo(${quote(table)})`).all()).results.filter(c=>!c.hidden);
   for(const item of sample[table]){
    const row={};
    for(const [name,value]of Object.entries(item)){
     const key=name.replace(/[A-Z]/g,c=>'_'+c.toLowerCase()),column=columns.find(c=>c.name===key);if(!column)continue;
     row[key]=map.get(value)??(column.type.toUpperCase().includes('INT')&&typeof value==='string'&&/^\d{4}-/.test(value)?Date.parse(value):typeof value==='boolean'?Number(value):value);
    }
    const names=Object.keys(row);
    await db.prepare(`INSERT INTO ${quote(table)} (${names.map(quote)}) VALUES (${names.map(()=>'?')})`).bind(...names.map(n=>row[n])).run();
   }
  }
  await db.prepare("INSERT INTO launch_custom_fields(id,created_at,updated_at,version,name,type,options_json) VALUES('archive-custom',1,2,1,'Archive field','text','[]')").run();
  const milestone=(await db.prepare('SELECT id FROM milestones LIMIT 1').first()).id;
  await db.prepare("INSERT INTO launch_readiness(id,created_at,updated_at,version,milestone_id,owner_id,state) VALUES('archive-readiness',1,2,1,?,?,'Outstanding')").bind(milestone,owner).run();
  await db.prepare("INSERT INTO integration_deliveries(namespace,id,fingerprint,destination_hash,envelope,state,created_at,next_at,max_attempts,retry_delays) VALUES('archive','held', 'fingerprint','destination','{}','queued',1,2,1,'[]'),('archive','uncertain','fingerprint2','destination','{}','sending',1,2,1,'[]')").run();
  const bytes=new Uint8Array([0,1,2,255,13,10]),hash=createHash('sha256').update(bytes).digest('hex');
  await files.put('archive/records.bin',bytes,{sha256:hash,httpMetadata:{contentType:'application/octet-stream'},customMetadata:{source:'records'}});
  await db.prepare("INSERT INTO evidence_files(id,app_id,entity_id,record_id,field_ids,filename,media_type,bytes,sha256,object_key,state,version,created_at,updated_at) VALUES('archive-file','00000000000000000000000700','00000000000000000000000701',?,'[]','records.bin','application/octet-stream',?,?,'archive/records.bin','available',1,'2026-10-11T00:00:00.000Z','2026-10-11T00:00:00.000Z')").bind((await db.prepare('SELECT id FROM campaigns LIMIT 1').first()).id,bytes.length,hash).run();
  await files.put('execution/private/fixture/envelope','Private sealed execution payload');
  await files.put('archive/notes.txt','Cradle café\n',{httpMetadata:{contentType:'text/plain'},customMetadata:{purpose:'owner archive'}});
 });
}
export async function visibleData(root){
 return bindings(root,async({DB:db,FILES:files})=>{
  const generated=[],search=[];
  for(const {name}of (await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND sql IS NOT NULL AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' ORDER BY name").all()).results){
   const columns=(await db.prepare(`PRAGMA table_xinfo(${quote(name)})`).all()).results;
   if(columns.some(c=>[2,3].includes(c.hidden))){
    const rows=(await db.prepare(`SELECT * FROM ${quote(name)} ORDER BY id`).all()).results;
    generated.push({name,rows,generated:columns.filter(c=>c.hidden).map(c=>c.name)});
   }
   if((await db.prepare('SELECT sql FROM sqlite_master WHERE name=?').bind(name).first()).sql.startsWith('CREATE VIRTUAL TABLE')){
    const projection=columns.filter(c=>!c.hidden).map(c=>quote(c.name)).join(',');
    search.push({name,rows:(await db.prepare(`SELECT ${projection} FROM ${quote(name)}`).all()).results.map(row=>JSON.stringify(row)).sort()});
   }
  }
  const objects=[];let cursor;
  do{const page=await files.list({cursor});for(const object of page.objects){if(object.key.startsWith('execution/'))continue;const value=await files.get(object.key);objects.push({key:object.key,bytes:Array.from(new Uint8Array(await value.arrayBuffer())),httpMetadata:value.httpMetadata,customMetadata:value.customMetadata});}cursor=page.truncated?page.cursor:undefined;}while(cursor);
  return {generated,objects,search};
 });
}
export async function ownedData(root,tables){
 return bindings(root,async({DB,FILES})=>{
  const data={};
  for(const {name} of tables)data[name]=await DB.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").bind(name).first()?(await DB.prepare(`SELECT * FROM ${quote(name)}`).all()).results.map(row=>JSON.stringify(row)).sort():null;
  const objects=[];let cursor;
  do{const page=await FILES.list({cursor});for(const object of page.objects){const value=await FILES.get(object.key);objects.push({key:object.key,bytes:Array.from(new Uint8Array(await value.arrayBuffer())),httpMetadata:value.httpMetadata,customMetadata:value.customMetadata});}cursor=page.truncated?page.cursor:undefined;}while(cursor);
  return {data,objects};
 });
}
