import {hash} from '../evidence/shared.server';
import {identifier} from '../admission/sql.server';
import {canonical,snapshotName,selectColumns,type ArchiveManifest} from './archive-schema.server';
/** Only transfer bookkeeping and mandatory credential fencing normalize. Exact parts retain original rows. */
export const SEMANTIC_NORMALIZATION='cradle-transfer-controls-v1' as const;
export type SemanticProgress={table:number;offset:number;digest:string;header:boolean;complete:boolean};
export async function semanticStep(db:D1Database,manifest:ArchiveManifest,id:string,previous?:SemanticProgress,stage=false):Promise<SemanticProgress>{
 const p=previous?{...previous}:{table:0,offset:0,digest:await hash(canonical({format:'cradle-semantic-v1',schemaObjects:manifest.schemaObjects,derivedStorage:manifest.derivedStorage,files:[...manifest.files].sort((a,b)=>a.key.localeCompare(b.key)),normalization:SEMANTIC_NORMALIZATION})),header:false,complete:false};
 if(p.complete)return p;
 const table=manifest.tables[p.table];if(!table){p.complete=true;return p;}
 if(!p.header){p.digest=await hash(p.digest+canonical({name:table.name,schemaHash:table.schemaHash,columns:table.columns}));p.header=true;}
 const order=table.columns.filter(c=>c.pk).sort((a,b)=>a.pk-b.pk);
 // One D1 row per step bounds memory even when every permitted column contains large text.
 const rows=(await db.prepare(`SELECT ${selectColumns(table)} FROM ${snapshotName(id,table.name,stage)} ORDER BY ${(order.length?order:table.columns).map(c=>identifier(c.name)).join(',')} LIMIT 1 OFFSET ?`).bind(p.offset).all<Record<string,unknown>>()).results;
 for(const row of rows){if(table.name==='command_admissions'&&['export.start','restore.preview','restore.commit'].includes(String(row.action)))continue;if(table.name==='authority_grants')delete row.restore_hold;if(table.name==='authority_principals')delete row.authentication_epoch;p.digest=await hash(p.digest+canonical(row));}
 p.offset+=rows.length;if(!rows.length||p.offset>=table.rows){p.table++;p.offset=0;p.header=false;if(p.table>=manifest.tables.length)p.complete=true;}
 return p;
}
/** Convenience for local verification. Production jobs persist semanticStep after bounded work. */
export async function semanticHash(db:D1Database,manifest:ArchiveManifest,id:string,stage=false){let p:SemanticProgress|undefined;do{p=await semanticStep(db,manifest,id,p,stage);}while(!p.complete);return p.digest;}
