// Trusted supervisor mounted read-only. Candidate output stays in a size-bounded
// tmpfs and is serialized as data; it never gains a writable host filesystem.
import { spawn } from 'node:child_process';
import { readdir, lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
const argv=JSON.parse(process.argv[2]);
const child=spawn(argv[0],argv.slice(1),{stdio:['ignore','pipe','pipe'],detached:true});
let logBytes=0,failed=false;
for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{logBytes+=chunk.length;if(logBytes>65536){failed=true;try{process.kill(-child.pid,'SIGKILL');}catch{}}else process.stderr.write(chunk);});
child.on('error',()=>{failed=true;});
const code=await new Promise(resolve=>child.on('close',resolve));
try{process.kill(-child.pid,'SIGKILL');}catch{}
if(failed||code!==0)process.exit(1);
const files=[];let bytes=0;
async function walk(relative=''){
 for(const name of (await readdir(join('/output',relative))).sort()){
  const path=relative?`${relative}/${name}`:name;
  if(!/^[a-zA-Z0-9_./@+ -]+$/.test(path)||path.split('/').some(p=>!p||p==='.'||p==='..'))throw new Error('unsafe_output_path');
  const stat=await lstat(join('/output',path));
  if(stat.isSymbolicLink()||(!stat.isDirectory()&&!stat.isFile())||(stat.isFile()&&stat.nlink>1))throw new Error('unsafe_output_file');
  if(stat.isDirectory()){await walk(path);continue;}
  bytes+=stat.size;if(bytes>12*1024*1024||files.length>=2000)throw new Error('output_limit');
  files.push({path,content:(await readFile(join('/output',path))).toString('base64')});
 }
}
await walk();process.stdout.write(JSON.stringify({version:1,files}));
