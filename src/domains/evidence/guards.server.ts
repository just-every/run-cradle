import type {EvidenceLink} from './contracts';
import {sources,versions,and,eq} from './shared.server';
import {exists,trustedPredicate} from '../admission/sql.server';
/** Rechecked inside R admission; pre-read validation alone never freezes freshness. */
export const sourceGuards=(links:readonly Pick<EvidenceLink,'sourceId'|'sourceVersion'>[],historicalCutoff?:string)=>links.map(e=>historicalCutoff?and(exists(sources,and(eq(sources,'id',e.sourceId),eq(sources,'erased_at',null))),exists(versions,and(eq(versions,'source_id',e.sourceId),eq(versions,'version',e.sourceVersion),trustedPredicate('known_at<=?',[historicalCutoff])))):exists(sources,and(eq(sources,'id',e.sourceId),eq(sources,'current_version',e.sourceVersion),eq(sources,'erased_at',null))));
