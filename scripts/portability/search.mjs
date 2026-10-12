import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {derivedSearch} from './records.mjs';
/** Reuse the maintained source projection; the FTS index is derived data. */
export async function rebuildSearch(db,root){
 const source=await readFile(join(root,'src/apps/launch/search-rebuild.server.ts'),'utf8');
 const projections=JSON.parse(source.slice(source.indexOf('=')+1,source.lastIndexOf(' as const')));
 await db.batch([db.prepare('DELETE FROM launch_search'),...projections.map(line=>db.prepare(line))]);
 const quote=name=>'"'+name.replaceAll('"','""')+'"';
 for(const name of await derivedSearch(db)){
  if(name==='launch_search')continue;
  const columns=(await db.prepare(`PRAGMA table_xinfo(${quote(name)})`).all()).results.filter(c=>!c.hidden).map(c=>c.name);
  await db.batch([db.prepare(`DELETE FROM ${quote(name)}`),db.prepare(`INSERT INTO ${quote(name)} (${columns.map(quote)}) SELECT id,${columns.slice(1).map(quote)} FROM ${quote(name.slice(0,-7))}`)]);
 }
}
