import type { RevisionRef } from '../../contracts/primitives'
import type { RequestContext } from '../authority/ports'
import { canonical } from '../admission/canonical'

/** A value changed away and back by another actor still conflicts with undo.
 * Audit and changed revisions commit atomically with every ordinary record write.
 * Only field identities leave this internal query; values come from current policy reads. */
export async function otherActorCellChanges(db: D1Database, ctx: RequestContext, expected: RevisionRef[]) {
  if (!expected.length) return new Set<string>()
  const rows = await db.prepare(`SELECT DISTINCT json_extract(a.subject_json,'$.recordId') AS record_id,
    json_extract(delta.value,'$.fieldId') AS field_id
    FROM admission_audit a JOIN command_admissions c ON c.command_id=a.command_id
    JOIN json_each(?) requested ON a.subject_json=json_extract(requested.value,'$.ref')
    JOIN json_each(c.result_json,'$.changed') revision ON json_extract(revision.value,'$.ref')=a.subject_json
    JOIN json_each(a.changes_json) delta
    WHERE a.app_id=? AND c.state='committed'
      AND (a.actor_id<>? OR a.actor_kind<>'human')
      AND json_extract(revision.value,'$.version')>json_extract(requested.value,'$.version')
      AND (json_extract(delta.value,'$.before')<>json_extract(delta.value,'$.after')
        OR json_extract(delta.value,'$.before.state')<>'value' OR json_extract(delta.value,'$.after.state')<>'value')`)
    .bind(canonical(expected), expected[0]!.ref.appId, ctx.principal.id).all<{ record_id: string; field_id: string }>()
  return new Set(rows.results.map(row => `${row.record_id}:${row.field_id}`))
}
