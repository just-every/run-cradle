import type { RecordRow, View, EntitySchema } from './contracts'
const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')
const stamp = (value: string) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
function fold(line: string) {
  const lines: string[] = []; let current = '', bytes = 0
  for (const character of line) { const size = new TextEncoder().encode(character).length; if (bytes + size > 75) { lines.push(current); current = ' '; bytes = 1 } current += character; bytes += size }
  return [...lines, current].join('\r\n')
}
export function calendarIcal(view: View, schema: EntitySchema, rows: RecordRow[], timezone: string, origin: string) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Cradle//Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escape(view.name)}`, `X-WR-TIMEZONE:${escape(timezone)}`]
  const field = schema.fields.find(field => field.id === view.layout.startFieldId)
  for (const row of rows) {
    const cell = (id?: string) => { const cell = id ? row.fields[id] : undefined; return cell?.state === 'value' && typeof cell.value === 'string' ? cell.value : null }
    const start = cell(view.layout.startFieldId), end = cell(view.layout.endFieldId)
    if (!start) continue
    const title = cell(view.layout.titleFieldId) ?? 'Record'
    lines.push('BEGIN:VEVENT', `UID:${row.id}.${view.id}@cradle`, `DTSTAMP:${stamp(row.updatedAt)}`, `SEQUENCE:${row.version}`, `SUMMARY:${escape(title)}`)
    if (field?.type === 'date') {
      lines.push(`DTSTART;VALUE=DATE:${start.replace(/-/g, '')}`)
      const exclusive = new Date(`${end ?? start}T00:00:00Z`); exclusive.setUTCDate(exclusive.getUTCDate() + 1)
      lines.push(`DTEND;VALUE=DATE:${exclusive.toISOString().slice(0, 10).replace(/-/g, '')}`)
    } else { lines.push(`DTSTART:${stamp(start)}`); if (end) lines.push(`DTEND:${stamp(end)}`) }
    lines.push(`URL:${origin}/app/records/${view.appId}/${view.entityId}/${row.id}`, 'END:VEVENT')
  }
  return [...lines, 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n'
}
