import type { Json } from '../../contracts/primitives'
import { AdmissionError } from '../../domains/admission/errors'
import { compileLens } from './lenses.server'
import { lensDefinition } from './contracts'
import { toWire, type LaunchRow } from './storage.server'

/** All displayed values are materialised by one D1 batch, including the saved
 * definition revision. Selecting a result never reads a newer detail record. */
export async function readSavedLensResults(db: D1Database, id: string, now: string, offset = 0) {
 if (!Number.isSafeInteger(offset) || offset < 0) throw new AdmissionError('validation', 'Invalid cursor')
 const saved = await db.prepare('SELECT * FROM lenses WHERE id=?').bind(id).first<LaunchRow>()
 if (!saved) throw new AdmissionError('not_found', 'Lens was not found')
 const definition = lensDefinition.parse({name:saved.name,description:saved.description,recordType:saved.record_type,conditions:JSON.parse(String(saved.conditions_json)),sort:JSON.parse(String(saved.sort_json)),fields:JSON.parse(String(saved.fields_json)),display:saved.display})
 const q = await compileLens(db, definition, now)
 const personFields = q.kind === 'decision' ? ['requester', 'assignee'] : ['owner']
 const people = personFields.map(field => `(SELECT name FROM operators WHERE id=r.${field}_id) AS ${field}`)
 const custom = q.kind === 'campaign' ? `,(SELECT json_group_object(field_id,json(value_json)) FROM launch_custom_values WHERE campaign_id=r.id) AS custom_fields_json,(SELECT json_group_array(tag) FROM campaign_tags WHERE campaign_id=r.id) AS tags_json` : ''
 const [revision, records, count] = await db.batch<Record<string,string|number|null>>([
  db.prepare('SELECT version FROM lenses WHERE id=?').bind(id),
  db.prepare(`SELECT r.*,c.code AS campaign,c.name AS campaign_name,c.code AS campaign_code,c.launch_date AS campaign_launch_date,${people.join(',')}${custom} FROM ${q.from} WHERE ${q.where} ORDER BY ${q.order} LIMIT 200 OFFSET ?`).bind(...q.values, offset),
  db.prepare(`SELECT COUNT(*) AS n FROM (SELECT 1 FROM ${q.from} WHERE ${q.where} LIMIT 10001)`).bind(...q.values),
 ])
 if (revision!.results[0]?.version !== saved.version) throw new AdmissionError('version_conflict', 'The lens changed during evaluation. Refresh to use its current definition.')
 const items: Record<string, Json>[] = (records!.results as LaunchRow[]).map(row => {
  const { custom_fields_json: customFieldsJson, tags_json: tagsJson, ...fields } = row
  return {...toWire(fields as LaunchRow), ...(q.kind === 'campaign' ? {summary:row.status_summary,tags:JSON.parse(String(tagsJson ?? '[]'))} : {}), ...(customFieldsJson ? JSON.parse(String(customFieldsJson)) : {}), ...(q.kind === 'milestone' ? {overdue:row.status !== 'Complete' && String(row.end_date ?? row.start_date) < q.today} : {})}
 })
 const n = Number(count!.results[0]!.n)
 return {
  lens: {...definition,id,version:saved.version,shareUrl:`/app/lenses/${id}`},
  conditionSummary: definition.conditions.map(condition => `${condition.field} ${condition.operator}${condition.value === undefined ? '' : ` ${Array.isArray(condition.value) ? condition.value.join(', ') : String(condition.value ?? '')}`}`),
  items, selectedDetail: items[0] ?? null,
  total: {kind:n > 10000 ? 'at_least' as const : 'exact' as const,value:Math.min(n,10000)},
  nextCursor: offset + 200 < n ? String(offset + 200) : null, evaluatedAt:now, timezone:q.timezone,
 }
}
