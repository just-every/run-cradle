import type { SqlMutation } from '../../domains/admission/ports'
import { and, eq, trustedPredicate } from '../../domains/admission/sql.server'
import { tables, tagTable, customValueTable, dependencyTable } from './storage.server'

// These are the retained schema's ON DELETE CASCADE relations with launch-owned
// writable fields. They describe authorization effects; the database still owns
// deletion. Guard the exact children so a concurrent insert cannot escape policy.
const cascades = [
 { parent: tables.campaign, child: tables.deliverable, column: 'campaign_id' },
 { parent: tables.campaign, child: tables.milestone, column: 'campaign_id' },
 { parent: tables.campaign, child: tables.risk, column: 'campaign_id' },
 { parent: tables.campaign, child: tables.decision, column: 'campaign_id' },
 { parent: tables.campaign, child: tagTable, column: 'campaign_id' },
 { parent: tables.campaign, child: customValueTable, column: 'campaign_id' },
 { parent: tables.customField, child: customValueTable, column: 'field_id' },
 { parent: tables.milestone, child: dependencyTable, column: 'milestone_id' },
 { parent: tables.milestone, child: dependencyTable, column: 'predecessor_id' },
 { parent: tables.milestone, child: tables.readiness, column: 'milestone_id' },
]
export async function launchCascadeWrites(db: D1Database, mutations: readonly SqlMutation[]) {
 const writes = [...mutations], guards = [], seen = new Set<string>()
 for (let index = 0; index < writes.length; index++) {
  const mutation = writes[index]!
  if (mutation.kind !== 'delete') continue
  for (const relation of cascades.filter(edge => edge.parent.tableId === mutation.table.tableId)) {
   const parents = await db.prepare(`SELECT id FROM "${mutation.table.tableId}" WHERE ${mutation.where.sql}`).bind(...mutation.where.values).all<{ id: string }>()
   for (const { id } of parents.results) {
    const key = `${relation.child.tableId}:${relation.column}:${id}`
    if (seen.has(key)) continue
    seen.add(key)
    const where = eq(relation.child, relation.column, id)
    const children = await db.prepare(`SELECT id FROM "${relation.child.tableId}" WHERE ${where.sql} ORDER BY id`).bind(...where.values).all<{ id: string }>()
    guards.push(trustedPredicate(`(SELECT COUNT(*) FROM "${relation.child.tableId}" WHERE ${where.sql})=?`, [...where.values, children.results.length]))
    // Count plus each captured ID proves the exact set without one unbounded
    // JSON bind; admission can chunk these guards within D1's statement limits.
    for (const child of children.results) guards.push(trustedPredicate(`EXISTS(SELECT 1 FROM "${relation.child.tableId}" WHERE id=? AND ${where.sql})`, [child.id, ...where.values]))
    // A child can have two cascading references to the same parent. Each read
    // still authorizes the affected row, while this is never executed as SQL.
    writes.push({ kind: 'delete', table: relation.child, where: and(where), expectedRows: children.results.length })
   }
  }
 }
 return { writes, guards }
}
