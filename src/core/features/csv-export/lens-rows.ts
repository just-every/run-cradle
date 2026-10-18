import { compileLens } from '../../../apps/launch/lenses.server'
import { lensDefinition } from '../../../apps/launch/contracts'
import type { ExportWorkspace } from './workspace-format'
import { instant, money } from './workspace-format'
import { launchOverdue, overdueMarkerField } from '../../../apps/launch/overdue-projection.server'
import { localDate } from '../../../apps/launch/milestones.server'

type Row = Record<string, string | number | null>
const labels: Record<string, string> = { code: 'Code', name: 'Name', title: 'Title', owner: 'Owner', ownerId: 'Owner', requester: 'Requester', requesterId: 'Requester', assignee: 'Assignee', assigneeId: 'Assignee', campaign: 'Campaign', campaignId: 'Campaign', campaignCode: 'Campaign code', campaignLaunchDate: 'Campaign launch date', summary: 'Status summary', statusSummary: 'Status summary', dueAt: 'Due' }
const columns: Record<string, string> = { ownerId: 'owner_id', owner: 'owner_id', requesterId: 'requester_id', requester: 'requester_id', assigneeId: 'assignee_id', assignee: 'assignee_id', startDate: 'start_date', launchDate: 'launch_date', endDate: 'end_date', dueDate: 'due_date', dueAt: 'due_at', summary: 'status_summary', statusSummary: 'status_summary', conflictReason: 'conflict_reason', resolutionNote: 'resolution_note' }
const humanize = (name: string) => name.replace(/([A-Z])/g, ' $1').replace(/^./, first => first.toUpperCase()).replace(/ ([A-Z])/g, (_, letter: string) => ' ' + letter.toLowerCase())

/** A saved lens's result in its own order with its fields in their saved order. */
export async function lensExport(db: D1Database, lens: { name: string; description: string; recordType: string; conditions: unknown; sort: unknown; fields: string[]; display: string }, workspace: ExportWorkspace) {
 const definition = lensDefinition.parse({ name: lens.name, description: lens.description, recordType: lens.recordType, conditions: lens.conditions, sort: lens.sort, fields: lens.fields, display: lens.display })
 const query = await compileLens(db, definition, workspace.capturedAt)
 const rows = (await db.prepare(`SELECT r.*,c.code AS export_campaign_code,c.launch_date AS export_campaign_launch FROM ${query.from} WHERE ${query.where} ORDER BY ${query.order}`).bind(...query.values).all<Row>()).results
 const people = new Map((await db.prepare('SELECT id,name FROM operators').all<{ id: string; name: string }>()).results.map(person => [person.id, person.name]))
 const custom = new Map((await db.prepare('SELECT id,name FROM launch_custom_fields').all<{ id: string; name: string }>()).results.map(field => [field.id, field.name]))
 const values = query.kind === 'campaign' ? (await db.prepare('SELECT campaign_id,field_id,value_json FROM launch_custom_values').all<{ campaign_id: string; field_id: string; value_json: string }>()).results : []
 const tags = query.kind === 'campaign' ? (await db.prepare('SELECT campaign_id,tag FROM campaign_tags ORDER BY tag').all<{ campaign_id: string; tag: string }>()).results : []
 const header = definition.fields.map(field => custom.get(field) ?? (field === 'budgetMinor' ? `Budget (${workspace.currency})` : field === 'spendMinor' ? `Spend (${workspace.currency})` : labels[field] ?? humanize(field)))
 const cell = (row: Row, field: string): string | number | null => {
  if (custom.has(field)) { const value = values.find(item => item.campaign_id === row.id && item.field_id === field); if (!value) return ''; const parsed = JSON.parse(value.value_json) as unknown; return Array.isArray(parsed) ? parsed.join(' | ') : String(parsed) }
  if (field === 'campaign' || field === 'campaignCode' || field === 'campaignId') return row.export_campaign_code ?? ''
  if (field === 'campaignLaunchDate') return row.export_campaign_launch ?? ''
  if (field === 'tags') return tags.filter(tag => tag.campaign_id === row.id).map(tag => tag.tag).join(' | ')
  if (field === 'budgetMinor' || field === 'spendMinor') return money(row[field === 'budgetMinor' ? 'budget_minor' : 'spend_minor'] as number | null)
  const column = columns[field] ?? field.replace(/[A-Z]/g, letter => '_' + letter.toLowerCase()), value = row[column] ?? null
  if (column.endsWith('_id')) return value === null ? '' : people.get(String(value)) ?? ''
  if (field === 'dueAt') return instant(value, workspace.timezone)
  return value ?? ''
 }
 const marker = query.kind === 'milestone' ? overdueMarkerField('milestone', definition.fields) : undefined
 const today = localDate(workspace.capturedAt, workspace.timezone)
 return { header, rows: rows.map(row => {
  const overdue = query.kind === 'milestone' && launchOverdue('milestone', { status: row.status, startDate: row.start_date, endDate: row.end_date }, today, true)
  return definition.fields.map(field => field === marker && overdue ? `${cell(row, field) ?? ''} (Overdue)` : cell(row, field))
 }) }
}
