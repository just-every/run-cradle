import type {RevisionRef} from '../../contracts/primitives';
import type {RequestContext} from '../authority/ports';
import type {SqlMutation} from '../admission/ports';
import {nodes,eq} from './shared.server';
const batches=new WeakMap<RequestContext,Map<string,string[]>>();
const key=(ref:RevisionRef)=>JSON.stringify(ref);
/** Batch-scoped cache retains exact source-version identities; each row still emits atomic mutations. */
export async function withCanonicalInvalidationRows<T>(db:D1Database,ctx:RequestContext,refs:RevisionRef[],run:()=>Promise<T>){
 const rows=(await db.prepare("WITH RECURSIVE d(root,id) AS (SELECT j.key,n.id FROM json_each(?) j JOIN evidence_nodes n ON n.app_id=json_extract(j.value,'$.ref.appId') AND n.kind='canonical' AND n.object_id=json_extract(j.value,'$.ref.recordId') AND n.object_version=json_extract(j.value,'$.version') UNION SELECT d.root,e.child_id FROM evidence_dependencies e JOIN d ON e.parent_id=d.id) SELECT d.root,d.id FROM d JOIN evidence_nodes n ON n.id=d.id WHERE n.invalidated_at IS NULL").bind(JSON.stringify(refs)).all<{root:number;id:string}>()).results;
 const cache=new Map(refs.map(ref=>[key(ref),[] as string[]]));for(const row of rows)cache.get(key(refs[row.root]!))!.push(row.id);
 if(batches.has(ctx))throw new Error('Nested invalidation scope');batches.set(ctx,cache);try{return await run();}finally{batches.delete(ctx);}
}
export async function prepareCanonicalInvalidation(db:D1Database,ctx:RequestContext,prior:RevisionRef){
 let ids=batches.get(ctx)?.get(key(prior));
 if(!ids)ids=(await db.prepare("WITH RECURSIVE d(id) AS (SELECT id FROM evidence_nodes WHERE app_id=? AND kind='canonical' AND object_id=? AND object_version=? UNION SELECT child_id FROM evidence_dependencies JOIN d ON parent_id=d.id) SELECT d.id FROM d JOIN evidence_nodes n ON n.id=d.id WHERE n.invalidated_at IS NULL").bind(prior.ref.appId,prior.ref.recordId,prior.version).all<{id:string}>()).results.map(r=>r.id);
 return{guards:[],mutations:ids.map(id=>({kind:'update',table:nodes,set:{invalidated_at:ctx.now},where:eq(nodes,'id',id),expectedRows:1})) as SqlMutation[]};
}
