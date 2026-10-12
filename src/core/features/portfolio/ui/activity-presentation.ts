import { formatDate, formatDateTime } from './portfolio-format'
import type { ActivitySummary } from './portfolio-types'
export function activityActions(entries: ActivitySummary[]) {
  const groups = new Map<string, ActivitySummary[]>()
  for (const entry of entries) {
    const key = entry.subjectId && entry.type ? entry.actionId ?? `${entry.actor?.id ?? 'automation'}:${entry.occurredAt}:${entry.subjectId}:${entry.type}` : entry.id
    const group = groups.get(key) ?? []; group.push(entry); groups.set(key, group)
  }
  return [...groups.values()].map(facts => {
    const entry = facts.find(fact => fact.type === 'risk.updated' && fact.fieldName === 'state' && fact.nextValue === 'Escalated') ?? facts.find(fact => fact.type === 'decision.updated' && fact.fieldName === 'state' && ['Approved','Rejected','Cancelled'].includes(fact.nextValue ?? '')) ?? facts[0]!, state = facts.find(fact => fact.subjectId === entry.subjectId && fact.fieldName === 'state')?.nextValue
    const kind = entry.type === 'import.committed' ? 'campaign' : entry.type?.split('.')[0] ?? 'record'
    const operation = entry.type?.split('.')[1]
    const verb = entry.type === 'import.committed' ? 'imported' : kind === 'decision' && ['Approved','Rejected','Cancelled'].includes(state ?? '') ? state!.toLowerCase() : kind === 'risk' && state === 'Escalated' ? 'escalated' : kind === 'risk' && state === 'Resolved' ? 'resolved' : operation === 'created' ? 'created' : operation === 'deleted' ? 'deleted' : operation === 'archived' ? 'archived' : operation === 'restored' ? 'restored' : 'updated'
    return { ...entry, description: entry.type ? `${verb} ${kind}${entry.subjectTitle ? ` “${entry.subjectTitle}”` : ' (subject unavailable)'}` : entry.description, facts }
  })
}
export const activityFieldLabel = (field: string) => field.replace(/_id$/, '').replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())

export function activityValue(field: string, value: string | null | undefined, timezone: string) {
  if (value == null) return 'Empty'
  if (/(?:_date|Date)$/.test(field) && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value)
  if (/(?:_at|At)$/.test(field)) {
    const instant = /^\d{13}$/.test(value) ? new Date(Number(value)).toISOString() : value
    if (!Number.isNaN(new Date(instant).valueOf())) return formatDateTime(instant, timezone)
  }
  return value
}
