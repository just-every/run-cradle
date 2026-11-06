import {readArchive,PortabilityError} from '@runeditrun/rer/modules/portability';

export const quoteCopy=name=>'"'+name.replaceAll('"','""')+'"';
export function copyOwner(name){
 const match=/^rer_portability_(?:snap|stage)_([a-f0-9]{32})_\d+(?:_meta)?$/.exec(name);
 return match?.[1];
}
export const retirementTrigger=owner=>'rer_portability_retire_'+owner;
export const jobOwner=id=>/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)?id.replaceAll('-',''):undefined;
export function ownedCopies(row){
 const owner=jobOwner(row.id),copies=JSON.parse(row.metadata).copies;
 if(!owner||!copies||typeof copies!=='object'||Array.isArray(copies))return [];
 const names=Object.values(copies);
 if(names.some(name=>typeof name!=='string'||copyOwner(name)!==owner||name.endsWith('_meta')))throw new PortabilityError('snapshot_custody',409);
 return [...new Set(names.flatMap(name=>[name,name+'_meta']))];
}

/** Once the full stored archive verifies, snapshots are redundant. Every durable
 * state, including an interrupted compaction, serves exactly the same archive.
 * The job/parts/segments are untouched; abort remains compatible (DROP IF EXISTS).
 */
export async function compactExport(db,service,id){
 const row=await db.prepare("SELECT id,metadata FROM rer_portability_jobs WHERE id=? AND kind='export' AND phase='complete'").bind(id).first();
 if(!row)return;
 const names=ownedCopies(row);
 if(!names.length)return;
 const existing=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN (SELECT value FROM json_each(?))").bind(JSON.stringify(names)).all()).results;
 if(!existing.length)return;
 // Use the maintained verifier, including all preview rows, binary content and
 // closing hashes. Never trust phase alone when discarding the alternate copy.
 for await(const _record of readArchive(await service.exports.download(id))){}
 await db.batch([
  db.prepare("INSERT INTO rer_portability_guard(value) SELECT CASE WHEN EXISTS(SELECT 1 FROM rer_portability_jobs WHERE id=? AND kind='export' AND phase='complete' AND metadata=?) THEN 1 ELSE 0 END").bind(id,row.metadata),
  db.prepare(`DROP TRIGGER IF EXISTS ${quoteCopy(retirementTrigger(jobOwner(id)))}`),
  ...existing.map(({name})=>db.prepare(`DROP TABLE IF EXISTS ${quoteCopy(name)}`)),
  db.prepare('DELETE FROM rer_portability_guard'),
 ]);
}

/** Edition facade keeps the archive wire format and maintained import engine. */
export function retainedExports(db,service){
 return {...service,exports:{...service.exports,async advance(id,options){
  const status=await service.exports.advance(id,options);
  if(status.phase==='complete')await compactExport(db,service,id);
  return status;
 },async abort(id){
  const owner=jobOwner(id);
  if(owner)await db.prepare(`DROP TRIGGER IF EXISTS ${quoteCopy(retirementTrigger(owner))}`).run();
  return service.exports.abort(id);
 }}};
}
