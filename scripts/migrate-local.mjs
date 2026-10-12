import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { migrationGroups, migrationConfiguration } from './migration-groups.mjs'

const args=process.argv.slice(2)
const persistIndex=args.indexOf('--persist-to')
const persistTo=persistIndex<0?'.wrangler/state':args.splice(persistIndex,2)[1]
if(!persistTo)throw new Error('--persist-to requires a directory')
const directory=await mkdtemp(join(tmpdir(),'cradle-migrations-'))
try {
 for(const group of migrationGroups){
  const config=join(directory,group+'.json');await writeFile(config,JSON.stringify(migrationConfiguration(group)))
  const result=spawnSync('pnpm',['exec','wrangler','d1','migrations','apply','cradle','--local','--persist-to',persistTo,'--config',config,...args],{stdio:'inherit'})
  if(result.error)throw result.error
  if(result.status!==0){process.exitCode=result.status??1;break}
 }
}finally{await rm(directory,{recursive:true,force:true})}
