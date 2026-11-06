import {restoreMigrations} from '/home/agent/rer-consolidation/work/sd-cradle-erasure-custody-1/run-cradle/scripts/portability/migrations.mjs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {createPortability,PortabilityError} from '/home/agent/rer-consolidation/work/sd-cradle-erasure-custody-1/run-cradle/node_modules/@runeditrun/rer/modules/portability/index.mjs';
import {installationBucket} from '/home/agent/rer-consolidation/work/sd-cradle-erasure-custody-1/run-cradle/scripts/portability/bucket.mjs';
import {portabilityPolicy,installationPortabilityPolicy,archivePolicyFor,transient} from '/home/agent/rer-consolidation/work/sd-cradle-erasure-custody-1/run-cradle/scripts/portability/policy.mjs';
import {exportArchive,importArchive,fileRecords} from '/home/agent/rer-consolidation/work/sd-cradle-erasure-custody-1/run-cradle/node_modules/@runeditrun/rer/modules/portability/files.mjs';
import {preflightImport,transferFailure} from '/home/agent/rer-consolidation/work/sd-cradle-erasure-custody-1/run-cradle/scripts/portability/preflight.mjs';
import {rebuildSearch} from '/home/agent/rer-consolidation/work/sd-cradle-erasure-custody-1/run-cradle/scripts/portability/search.mjs';
import {derivedSearch,prepareRecordRestore} from '/home/agent/rer-consolidation/work/sd-cradle-erasure-custody-1/run-cradle/scripts/portability/records.mjs';
import {retiredCommentsDatabase} from '/home/agent/rer-consolidation/work/sd-cradle-erasure-custody-1/run-cradle/scripts/portability/retired-comments.mjs';
import {retainedExports} from '/home/agent/rer-consolidation/work/sd-cradle-erasure-custody-1/run-cradle/src/domains/portability/export-custody.mjs';

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
    // D1 includes the cascaded import-lease deletion in its change count.
    // Acknowledge the exact owned job instead of counting dependent rows.
    const removed=await db.prepare(`DELETE FROM rer_portability_jobs WHERE id=? AND actor=? AND kind='import' AND phase='aborted'
     AND NOT EXISTS(SELECT 1 FROM rer_portability_state WHERE import_job=?)
     AND NOT EXISTS(SELECT 1 FROM rer_portability_owned WHERE job=?)
     AND NOT EXISTS(SELECT 1 FROM rer_portability_parts WHERE job=?)
     AND NOT EXISTS(SELECT 1 FROM rer_portability_segments WHERE job=?)
     AND NOT EXISTS(SELECT 1 FROM sqlite_master s JOIN json_each(rer_portability_jobs.metadata,'$.copies') c
      ON s.name=c.value OR s.name=c.value||'_meta' WHERE s.type='table') RETURNING id`).bind(row.id,actor,row.id,row.id,row.id,row.id).first();
    if(removed?.id!==row.id)throw new PortabilityError('import_cleanup_failed');
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
  let config={...installationPortabilityPolicy(proxy.env.WAREHOUSE),derivedTables:await derivedSearch(proxy.env.DB)};
  if(direction==='import')for await(const record of fileRecords(path)){config=archivePolicyFor(record,config);break;}
  const service=retainedExports(db,await createPortability({db,buckets:{FILES:installationBucket(proxy.env.DB,proxy.env.FILES),WAREHOUSE:proxy.env.WAREHOUSE},policy:config,migrations:()=>restoreMigrations(proxy.env.DB,root,config,{retiredComments:!!cleanup?.retiredComments})}));
  const receipt=direction==='export'?await exportArchive(service,path,transient):await importWithCustody(service,db,path,journal);
  if(direction==='import')await rebuildSearch(proxy.env.DB,root);
  complete=true;
  return receipt;
 }finally{try{if(!complete)await cleanup?.();}finally{await proxy.dispose();}}
}
try{console.log(JSON.stringify({ok:true,...await run(process.argv[2],JSON.parse(process.argv[3]))}));}
catch(error){console.error('DIAGNOSTIC_CLASS',error.name,error.code);console.error('DIAGNOSTIC_MESSAGE',String(error.message).slice(0,500));console.error(String(error.stack).split('\n').slice(1).join('\n'));const receipt=transferFailure(error);console.log(JSON.stringify(receipt));process.exitCode=receipt.exitCode;}
