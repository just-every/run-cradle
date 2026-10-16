import {mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {migrationInventory} from './migration-groups.mjs';

// Hosted verification and preview read one migration directory from the emitted
// Wrangler config. Ship every local migration group in that directory, retaining
// the published filenames and bytes used by owner deployment artifacts.
const root=process.cwd(),configPath=join(root,'dist/server/wrangler.json');
const config=JSON.parse(await readFile(configPath,'utf8'));
const database=config.d1_databases?.find(item=>item.binding==='DB');
if(!database)throw new Error('Emitted Worker is missing the DB binding');
const migrations=migrationInventory();
for(let index=1;index<migrations.length;index++)if(migrations[index].name<=migrations[index-1].name)throw new Error('Migration inventory is not append-only');
const directory=join(root,'dist/migrations');
await rm(directory,{recursive:true,force:true});
await mkdir(directory,{recursive:true});
for(const {name,sql} of migrations)await writeFile(join(directory,name),sql);
database.migrations_dir='../migrations';
await writeFile(configPath,JSON.stringify(config,null,2)+'\n');
