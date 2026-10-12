import {cp,mkdtemp,readdir,rm,mkdir,symlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
// Run every recursive portable test against the same production onboarding copy.
// QA and historical fixtures stay under tests, never on the application's path.
const root=resolve('.'),cache=join(root,'.cache');await mkdir(cache,{recursive:true});
const temporary=await mkdtemp(join(cache,'onboarding-suite-'));
let child;
try{
 const suite=join(temporary,'onboarding');await cp('scripts/base-onboarding',suite,{recursive:true});
 await cp('tests/onboarding',suite,{recursive:true});
 // Onboarding's dev-key helper imports its sibling CLI, so preserve the
 // exported CLI layout as well as its modules in this portable test copy.
 await cp('scripts/base-cli',temporary,{recursive:true});
 await mkdir(join(temporary,'default-seed'),{recursive:true});
 await symlink(join(root,'package.json'),join(temporary,'default-seed/package.json'));
 await symlink(join(root,'node_modules'),join(temporary,'default-seed/node_modules'),'dir');
 const tests=[];
 async function walk(path){for(const entry of await readdir(path,{withFileTypes:true})){const name=join(path,entry.name);if(entry.isDirectory())await walk(name);else if(entry.name.endsWith('.test.mjs'))tests.push(name);}}
 await walk(suite);tests.sort();
 child=spawn(process.execPath,['--test','--test-concurrency=2',...tests],{stdio:'inherit'});
 const stop=()=>child.kill('SIGTERM');process.on('SIGTERM',stop);process.on('SIGINT',stop);
 try{process.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>resolve(code??1));});}
 finally{process.off('SIGTERM',stop);process.off('SIGINT',stop);}
}finally{await rm(temporary,{recursive:true,force:true});}
