import type {RequestContext} from '../authority/ports';
import type {SqlMutation} from '../admission/ports';
import {comments,contexts,eq} from './shared.server';
/** OPS-005 preserves authored comment bodies and stable identity, replacing display attribution.
 * Sources belong to explicit record refs, not their uploader; person-record erasure uses prepareEffects.
 */
export function createMemberEvidenceErasure(db:D1Database){return async(ctx:RequestContext,memberId:string,label:string)=>{
 if(!/^Anonymous [A-Za-z0-9 -]+$/.test(label))throw new Error('Stable anonymous attribution label required');const mutations:SqlMutation[]=[];
 for(const c of (await db.prepare('SELECT id FROM evidence_comments WHERE author_id=?').bind(memberId).all<{id:string}>()).results)mutations.push({kind:'update',table:comments,set:{author_label:label},where:eq(comments,'id',c.id),expectedRows:1});
 for(const c of (await db.prepare('SELECT id FROM evidence_contexts WHERE principal_id=? AND erased_at IS NULL').bind(memberId).all<{id:string}>()).results)mutations.push({kind:'update',table:contexts,set:{content:null,source_refs:'[]',record_refs:'[]',erased_at:ctx.now},where:eq(contexts,'id',c.id),expectedRows:1});
 return{guards:[],mutations};
};}
