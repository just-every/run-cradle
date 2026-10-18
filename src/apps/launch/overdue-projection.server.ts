import type { RecordRow } from '../../domains/records/contracts'
import { trustedPredicate } from '../../domains/admission/sql.server'
import type { SqlPredicate } from '../../domains/admission/ports'
import { LAUNCH_APP_ID, launchEntities } from './contracts'
import { launchFieldIds } from './descriptors.server'
import { localDate } from './milestones.server'

type Kind = 'deliverable' | 'milestone'
export function launchOverdueKind(appId: string, entityId: string): Kind | null {
 if (appId !== LAUNCH_APP_ID) return null
 return entityId === launchEntities.deliverable ? 'deliverable' : entityId === launchEntities.milestone ? 'milestone' : null
}
export const overdueFieldNames = (kind: Kind) => kind === 'deliverable' ? ['campaignId', 'state', 'dueDate'] : ['campaignId', 'status', 'startDate', 'endDate']
export const overdueFieldIds = (kind: Kind) => overdueFieldNames(kind).map(name => launchFieldIds[kind][name]!)

/** Mark an existing displayed cell, preserving DATA-002's exact columns and order.
 * Lifecycle text is preferred so ordinary date cells remain dates when possible. */
export function overdueMarkerField(kind: Kind, visible: readonly string[]) {
 return [kind === 'deliverable' ? 'state' : 'status', ...(kind === 'deliverable' ? ['dueDate'] : ['endDate', 'startDate']), 'title'].find(field => visible.includes(field)) ?? visible[0]
}
export function launchOverdue(kind: Kind, values: Record<string, unknown>, today: string, active: boolean) {
 const date = kind === 'deliverable' ? values.dueDate : values.endDate ?? values.startDate
 return active && (kind === 'deliverable' ? values.state === 'Open' : values.status !== 'Complete') && typeof date === 'string' && date < today
}

/** Inputs come only from the records reader's authorized cells. A hidden input
 * produces no boolean, so the derived marker cannot disclose a masked date/state. */
export async function projectLaunchOverdue(db: D1Database, kind: Kind, rows: readonly RecordRow[], now: string) {
 const candidates = rows.flatMap(row => {
  const names = overdueFieldNames(kind), cells = names.map(name => row.fields[launchFieldIds[kind][name]!])
  if (cells.some(cell => cell?.state !== 'value')) return []
  const values = Object.fromEntries(names.map((name, index) => { const cell = cells[index]; return [name, cell?.state === 'value' ? cell.value : null] }))
  return typeof values.campaignId === 'string' ? [{ id: row.id, values, campaignId: values.campaignId }] : []
 })
 const flags = new Map<string, boolean>(), guards: SqlPredicate[] = []
 if (!candidates.length) return { flags, guards }
 const settings = await db.prepare('SELECT id,version,timezone FROM workspace_settings LIMIT 1').first<{ id: string; version: number; timezone: string }>()
 if (!settings) throw new Error('Workspace timezone is required for overdue projection')
 const today = localDate(now, settings.timezone)
 guards.push(trustedPredicate('EXISTS(SELECT 1 FROM workspace_settings WHERE id=? AND version=? AND timezone=?)', [settings.id, settings.version, settings.timezone]))
 const campaigns = (await db.prepare('SELECT id,version,archived_at FROM campaigns WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify([...new Set(candidates.map(row => row.campaignId))])).all<{ id: string; version: number; archived_at: number | null }>()).results
 const byId = new Map(campaigns.map(row => [row.id, row]))
 for (const campaign of campaigns) guards.push(trustedPredicate('EXISTS(SELECT 1 FROM campaigns WHERE id=? AND version=?)', [campaign.id, campaign.version]))
 for (const candidate of candidates) {
  const campaign = byId.get(candidate.campaignId)
  if (campaign) flags.set(candidate.id, launchOverdue(kind, candidate.values, today, campaign.archived_at === null))
 }
 return { flags, guards }
}
