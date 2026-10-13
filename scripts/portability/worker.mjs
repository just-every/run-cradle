import {join} from 'node:path';
import {createRequire} from 'node:module';
import {createPortability,PortabilityError} from '@runeditrun/rer/modules/portability';
import {installationBucket} from './bucket.mjs';
import {portabilityPolicy,transient} from './policy.mjs';
import {exportArchive,importArchive} from '@runeditrun/rer/modules/portability/files';
import {preflightImport,transferFailure} from './preflight.mjs';
import {rebuildSearch} from './search.mjs';
import {derivedSearch,prepareRecordRestore} from './records.mjs';

async function run(direction,{root,path,journal}){
 if(direction==='import')await preflightImport(path,journal);
 const {getPlatformProxy}=createRequire(join(root,'package.json'))('wrangler');
 const proxy=await getPlatformProxy({configPath:join(root,'wrangler.jsonc'),persist:{path:join(root,'.wrangler/state/v3')},remoteBindings:false});
 let cleanup,complete=false;
 try{
  if(direction==='export'&&await proxy.env.DB.prepare('SELECT 1 FROM lifecycle_file_writes LIMIT 1').first())throw new PortabilityError('file_write_pending',409);
  if(direction==='export'&&await proxy.env.DB.prepare("SELECT 1 FROM lifecycle_erasures WHERE state='pending' LIMIT 1").first())throw new PortabilityError('erasure_pending',409);
  if(direction==='import')cleanup=await prepareRecordRestore(proxy.env.DB,root,path,portabilityPolicy);
  const config={...portabilityPolicy,derivedTables:await derivedSearch(proxy.env.DB)};
  const service=await createPortability({db:proxy.env.DB,buckets:{FILES:installationBucket(proxy.env.DB,proxy.env.FILES)},policy:config});
  const receipt=await (direction==='export'?exportArchive:importArchive)(service,path,transient,journal);
  if(direction==='import')await rebuildSearch(proxy.env.DB,root);
  complete=true;
  return receipt;
 }finally{try{if(!complete)await cleanup?.();}finally{await proxy.dispose();}}
}
try{console.log(JSON.stringify({ok:true,...await run(process.argv[2],JSON.parse(process.argv[3]))}));}
catch(error){const receipt=transferFailure(error);console.log(JSON.stringify(receipt));process.exitCode=receipt.exitCode;}
