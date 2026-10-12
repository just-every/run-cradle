import type {RequestContext} from '../../authority/ports'
import {AdmissionError} from '../../admission/errors'

/** Only the freshly admitted restore owner may read or explicitly continue old custody. */
export async function restoredJobAuthority(db:D1Database,ctx:RequestContext,jobId:string,archivedPrincipalId:string){
 const binding=await db.prepare(`SELECT 1 FROM cradle_restore_owner_admissions a JOIN cradle_restore r ON r.singleton=1
  JOIN cradle_base_operators m ON m.principal_id=a.owner_id JOIN oa_operators o ON o.id=m.base_id
  JOIN authority_principals p ON p.id=a.owner_id
  WHERE a.owner_id=? AND a.source_owner_id=? AND r.pending=0 AND r.current_owner_id=a.owner_id
  AND o.status='active' AND o.role='owner' AND p.state='active' AND p.initial_owner=1
  AND p.authentication_epoch=? AND EXISTS(SELECT 1 FROM ik_jobs WHERE id=? AND principal_id=a.source_owner_id)`)
  .bind(ctx.principal.id,archivedPrincipalId,ctx.principal.authenticationEpoch,jobId).first()
 if(!binding)throw new AdmissionError('not_found','Import job not found.')
}
