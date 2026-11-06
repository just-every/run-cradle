import '../run-cradle/tests/helpers/typescript-loader.mjs';
import {platformArchive} from '../run-cradle/tests/helpers/platform-archive.mjs';
import {freshLocalCopy} from './local-signin-copy-adapted.mjs';
import {place,matchesArchive} from '../run-cradle/tests/helpers/archive-correspondence.mjs';
import {installedRuntime} from '../run-cradle/node_modules/@runeditrun/rer/cli/node-runtime-discovery.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile),directory=new URL('../diagnostic-data/',import.meta.url).pathname;await mkdir(directory,{recursive:true});
console.log('DIAGNOSTIC_START');await platformArchive(directory);console.log('DIAGNOSTIC_ARCHIVES_BUILT');
const target=await freshLocalCopy();await writeFile(new URL('./diagnostic-target.json',import.meta.url),JSON.stringify({source:target.source,root:target.root})+'\n');
await target.command(['run','db:migrate:local']);await place(directory+'/platform.rer',target.source+'/platform.rer');
const binary=await installedRuntime('22.20.0');
try{const result=await run(binary,[new URL('./diagnostic-worker.mjs',import.meta.url).pathname,'import',JSON.stringify({root:target.source,path:target.source+'/platform.rer'})],{cwd:target.source,env:target.environment,maxBuffer:16*1024*1024});console.log(result.stdout+result.stderr);await matchesArchive(target.source,target.source+'/platform.rer');}
catch(error){console.log('DIAGNOSTIC_EXIT',error.code);console.log(error.stdout+error.stderr);}
finally{await target.log.close();}
