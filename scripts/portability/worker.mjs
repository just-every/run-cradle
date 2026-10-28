import {restoreMigrations} from './migrations.mjs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {createPortability,PortabilityError} from '@runeditrun/rer/modules/portability';
import {installationBucket} from './bucket.mjs';
import {portabilityPolicy,installationPortabilityPolicy,transient} from './policy.mjs';
import {exportArchive,importArchive} from '@runeditrun/rer/modules/portability/files';
import {preflightImport,transferFailure} from './preflight.mjs';
import {rebuildSearch} from './search.mjs';
import {derivedSearch,prepareRecordRestore} from './records.mjs';
import {retiredCommentsDatabase} from './retired-comments.mjs';

async function importWithCustody(service,db,path,journal){
 const actor='cradle-cli:'+randomUUID();let complete=false;
 try{
  const receipt=await importArchive({...service,imports:{...service.imports,create:(manifest,_actor,options)=>service.imports.create(manifest,actor,options)}},path,transient,journal);
  complete=true;return receipt;
 }finally{if(!complete){
   // Reconcile by this invocation's actor even if create/abort committed but
   // its acknowledgement failed. Never claim or retire another transfer.
   const rows=(await db.prepare("SELECT id,phase FROM rer_portability_jobs WHERE actor=? AND kind='import'").bind(actor).all()).results;
   if(rows.length>1)throw new PortabilityError('import_cleanup_owner');
   const row=rows[0];
   if(row&&row.phase!=='complete'){
    if(row.phase!=='aborted')try{await service.imports.abort(row.id);}
    catch(error){
     if(!await db.prepare("SELECT 1 FROM rer_portability_jobs WHERE id=? AND actor=? AND kind='import' AND phase='aborted'").bind(row.id,actor).first())throw error;
    }
    // Base removes this job's staged copies, parts and owned files on abort,
    // but retains the manifest. A refused CLI archive must retain no content,
    // including personal filenames or object metadata in that manifest.
    const result=await db.prepare(`DELETE FROM rer_portability_jobs WHERE id=? AND actor=? AND kind='import' AND phase='aborted'
     AND NOT EXISTS(SELECT 1 FROM rer_portability_state WHERE import_job=?)
     AND NOT EXISTS(SELECT 1 FROM rer_portability_owned WHERE job=?)
     AND NOT EXISTS(SELECT 1 FROM rer_portability_parts WHERE job=?)
     AND NOT EXISTS(SELECT 1 FROM rer_portability_segments WHERE job=?)
     AND NOT EXISTS(SELECT 1 FROM sqlite_master s JOIN json_each(rer_portability_jobs.metadata,'$.copies') c
      ON s.name=c.value OR s.name=c.value||'_meta' WHERE s.type='table')`).bind(row.id,actor,row.id,row.id,row.id,row.id).run();
    if(result.meta.changes!==1)throw new PortabilityError('import_cleanup_failed');
   }
 }}
}

async function run(direction,{root,path,journal}){
 if(direction==='import')await preflightImport(path,journal);
 const {getPlatformProxy}=createRequire(join(root,'package.json'))('wrangler');
 const proxy=await getPlatformProxy({configPath:join(root,'wrangler.jsonc'),persist:{path:join(root,'.wrangler/state/v3')},remoteBindings:false});
 let cleanup,complete=false;
 try{
  if(direction==='export'&&await proxy.env.DB.prepare('SELECT 1 FROM lifecycle_file_writes LIMIT 1').first())throw new PortabilityError('file_write_pending',409);
  if(direction==='export'&&await proxy.env.DB.prepare("SELECT 1 FROM lifecycle_erasures WHERE state='pending' LIMIT 1").first())throw new PortabilityError('erasure_pending',409);
  if(direction==='import')cleanup=await prepareRecordRestore(proxy.env.DB,root,path,portabilityPolicy);
  const db=cleanup?.retiredComments?retiredCommentsDatabase(proxy.env.DB):proxy.env.DB;
  const config={...installationPortabilityPolicy(proxy.env.WAREHOUSE),excludeTables:[...portabilityPolicy.excludeTables,...(cleanup?.retainedImportExclusions??[])],derivedTables:await derivedSearch(proxy.env.DB)};
  const service=await createPortability({db,buckets:{FILES:installationBucket(proxy.env.DB,proxy.env.FILES),WAREHOUSE:proxy.env.WAREHOUSE},policy:config,migrations:()=>restoreMigrations(proxy.env.DB,root,config,{retiredComments:!!cleanup?.retiredComments})});
  const receipt=direction==='export'?await exportArchive(service,path,transient):await importWithCustody(service,db,path,journal);
  if(direction==='import')await rebuildSearch(proxy.env.DB,root);
  complete=true;
  return receipt;
 }finally{try{if(!complete)await cleanup?.();}finally{await proxy.dispose();}}
}
try{console.log(JSON.stringify({ok:true,...await run(process.argv[2],JSON.parse(process.argv[3]))}));}
catch(error){const receipt=transferFailure(error);console.log(JSON.stringify(receipt));process.exitCode=receipt.exitCode;}
