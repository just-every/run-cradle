import {join} from 'node:path';
import {createRequire} from 'node:module';
import {createPortability,PortabilityError} from '@runeditrun/rer/modules/portability';
import {installationBucket} from './bucket.mjs';
import {portabilityPolicy,transient} from './policy.mjs';
import {archiveRecords,exportFile,importFile} from './files.mjs';
import {rebuildSearch} from './search.mjs';
import {derivedSearch,prepareRecordRestore} from './records.mjs';

async function run(direction,{root,path}){
 if(direction==='import')for await(const record of archiveRecords(path)){}
 const {getPlatformProxy}=createRequire(join(root,'package.json'))('wrangler');
 const proxy=await getPlatformProxy({configPath:join(root,'wrangler.jsonc'),persist:{path:join(root,'.wrangler/state/v3')},remoteBindings:false});
 let cleanup,complete=false;
 try{
  if(direction==='export'&&await proxy.env.DB.prepare('SELECT 1 FROM lifecycle_file_writes LIMIT 1').first())throw new PortabilityError('file_write_pending',409);
  if(direction==='export'&&await proxy.env.DB.prepare("SELECT 1 FROM lifecycle_erasures WHERE state='pending' LIMIT 1").first())throw new PortabilityError('erasure_pending',409);
  if(direction==='import')cleanup=await prepareRecordRestore(proxy.env.DB,root,path,portabilityPolicy);
  const config={...portabilityPolicy,derivedTables:await derivedSearch(proxy.env.DB)};
  const service=await createPortability({db:proxy.env.DB,buckets:{FILES:installationBucket(proxy.env.DB,proxy.env.FILES)},policy:config});
  const receipt=await (direction==='export'?exportFile:importFile)(service,path,transient);
  if(direction==='import')await rebuildSearch(proxy.env.DB,root);
  complete=true;
  return receipt;
 }finally{try{if(!complete)await cleanup?.();}finally{await proxy.dispose();}}
}
try{console.log(JSON.stringify({ok:true,...await run(process.argv[2],JSON.parse(process.argv[3]))}));}
catch(error){
 const refused=error instanceof PortabilityError&&(error.status===409||['wrong_product','schema_mismatch','table_inventory','configuration_inventory'].includes(error.code));
 const exitCode=error.message==='archive_json'?2:refused||error.code==='EEXIST'?4:1;
 const reason=error instanceof PortabilityError?error.code.split(':')[0]:/^[A-Z_]+$/.test(error.code??'')?error.code:error.message==='archive_json'?'archive_json':/D1_ERROR/.test(error.message??'')?'database_error':'native_error';
 const fileId=error instanceof PortabilityError&&['stored_file_missing','stored_file_checksum'].includes(reason)?error.code.split(':')[1]:undefined;
 const names=error instanceof PortabilityError&&reason==='unsafe_integer'?error.code.split(':').slice(1):[];
 const location=names.length===2&&names.every(name=>/^[a-z_][a-z0-9_]{0,63}$/.test(name))?names.join('.'):undefined;
 const frames=reason==='native_error'||reason==='database_error'?[...new Set([...String(error.stack??'').matchAll(/\/(catalogue|copies|export|import|storage|format|worker|files|generated)\.mjs:(\d+):\d+/g)].map(match=>match[1]+'.mjs:'+match[2]))].slice(0,3):[];
 console.log(JSON.stringify({ok:false,code:exitCode===2?'invalid_archive':exitCode===4?'restore_refused':'transfer_failed',reason,...(location?{location}:{}),...(fileId&&/^[A-Za-z0-9_-]{1,128}$/.test(fileId)?{location:'file '+fileId}:{}),...(frames.length?{frames}:{}),exitCode}));process.exitCode=exitCode;
}
