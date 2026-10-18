import type { RecordRow } from '../../domains/records/contracts'
export const addDays = (date: string, days: number) => new Date(Date.parse(date + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10)
export function localDate(value: string, timezone: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value)).map(part => [part.type, part.value]))
  return `${p.year}-${p.month}-${p.day}`
}
export function recordDate(row: RecordRow, field: string | undefined, timezone: string) {
  const cell = field ? row.fields[field] : null
  return cell?.state === 'value' && typeof cell.value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(cell.value) ? localDate(cell.value, timezone) : null
}
export function calendarDays(anchor: string, mode: 'month' | 'week' | 'day') {
  if (mode === 'day') return [anchor]
  const date = mode === 'month' ? anchor.slice(0, 7) + '-01' : anchor
  const offset = (new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7
  const first = addDays(date, -offset)
  const last = mode === 'week' ? addDays(first, 6) : new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0, 12)).toISOString().slice(0, 10)
  const count = mode === 'week' ? 7 : Math.ceil((Date.parse(last) - Date.parse(first) + 86400000) / 604800000) * 7
  return Array.from({ length: count }, (_, index) => addDays(first, index))
}
/** Shift civil dates; instants retain their elapsed range duration and local start clock across DST. */
export function movedDates(row: RecordRow, startField: string, endField: string | undefined, target: string, timezone: string) {
  const start = row.fields[startField]
  if (start?.state !== 'value' || typeof start.value !== 'string') throw Error('The start date is unavailable.')
  const days = (Date.parse(target) - Date.parse(localDate(start.value, timezone))) / 86400000
  const shift = (value: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return addDays(value, days)
    const old = new Date(value), parts = (at: number) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(at).map(p => [p.type, p.value]))
    const local = parts(old.getTime()), desired = Date.parse(`${addDays(`${local.year}-${local.month}-${local.day}`, days)}T${local.hour}:${local.minute}:${local.second}.${String(old.getUTCMilliseconds()).padStart(3, '0')}Z`)
    let candidate = old.getTime() + days * 86400000
    for (let n = 0; n < 3; n++) { const actual = parts(candidate), civil = Date.parse(`${actual.year}-${actual.month}-${actual.day}T${actual.hour}:${actual.minute}:${actual.second}.${String(old.getUTCMilliseconds()).padStart(3, '0')}Z`); const delta = desired - civil; if (!delta) return new Date(candidate).toISOString(); candidate += delta }
    throw Error('That local time does not exist in the workspace time zone. Choose another date or edit the record.')
  }
  const nextStart = shift(start.value), changes: Record<string, string> = { [startField]: nextStart }
  const end = endField ? row.fields[endField] : null
  if (endField && end?.state === 'value' && typeof end.value === 'string') changes[endField] = /^\d{4}-\d{2}-\d{2}$/.test(end.value) ? shift(end.value) : new Date(Date.parse(end.value) + Date.parse(nextStart) - Date.parse(start.value)).toISOString()
  return changes
}
