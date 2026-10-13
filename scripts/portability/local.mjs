import {lstat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {relative} from 'node:path';
import {RerError,refuse} from '@runeditrun/rer/errors';

async function run({root,path,store,signal,operationToken},direction){
 if(direction==='export'&&await lstat(path).catch(error=>{if(error.code==='ENOENT')return null;throw error;}))throw refuse('Export requires a new archive path.');
 await store.run('Applying all Cradle data migrations','pnpm',['run','db:migrate:local'],{cwd:root,signal,env:{...process.env,RER_LOCAL_OPERATION:operationToken,WRANGLER_SEND_METRICS:'false'}});
 const child=store.spawn(direction==='export'?'Exporting installation data':'Restoring installation data',process.execPath,
  [fileURLToPath(new URL('./worker.mjs',import.meta.url)),direction,JSON.stringify({root,path})],{cwd:root,signal,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
 let output='';child.stdout.on('data',chunk=>{output+=chunk;});
 const closed=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));
 await new Promise(resolve=>{child.once('exit',resolve);child.once('error',resolve);});await store.stop(child);
 const status=await closed;let receipt;try{receipt=JSON.parse(output.trim().split('\n').at(-1));}catch{throw new RerError('transfer_failed','Local portability returned no complete receipt.',1);}
 if(status.code!==0||!receipt.ok)throw new RerError(receipt.code??'transfer_failed',`Archive operation refused or failed (${receipt.reason??'incomplete'}${receipt.location?'; '+receipt.location:''}${receipt.frames?.length?' at '+receipt.frames.join(', '):''}).`,receipt.exitCode??1);
 delete receipt.ok;return {target:'local',[direction==='export'?'output':'input']:relative(root,path),...receipt};
}
export const portability={export:context=>run(context,'export'),import:context=>run(context,'import')};
