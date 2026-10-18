import { timelineLimits } from '../../domains/records/timeline-limits'
import type { TimelineBaseline, TimelineZoom } from '../../domains/records/contracts'
import type { TimelineTask } from './timeline-model'
import { addDays, localDate } from './calendar-dates'

export const DAY = 86400000
const scale: Record<TimelineZoom, number> = { day: 64, week: 24, month: 8, quarter: 3, year: 1 }
function floor(date: string, zoom: TimelineZoom) {
  if (zoom === 'day') return date
  if (zoom === 'week') return addDays(date, -(new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7)
  if (zoom === 'month') return date.slice(0, 7) + '-01'
  if (zoom === 'year') return date.slice(0, 4) + '-01-01'
  return `${date.slice(0, 4)}-${String(Math.floor((Number(date.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, '0')}-01`
}
function next(date: string, zoom: TimelineZoom) {
  if (zoom === 'day' || zoom === 'week') return addDays(date, zoom === 'day' ? 1 : 7)
  const value = new Date(date + 'T12:00:00Z')
  value.setUTCMonth(value.getUTCMonth() + (zoom === 'month' ? 1 : zoom === 'quarter' ? 3 : 12))
  return value.toISOString().slice(0, 10)
}
function midnight(date: string, timezone: string, dateOnly: boolean) {
  const wanted = Date.parse(date + 'T00:00:00Z')
  if (dateOnly) return wanted
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
  let at = wanted
  for (let n = 0; n < 3; n++) {
    const p = Object.fromEntries(formatter.formatToParts(at).map(part => [part.type, part.value]))
    const delta = wanted - Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`)
    if (!delta) break
    at += delta
  }
  return at
}
export function timelineAxis(tasks: TimelineTask[], baseline: TimelineBaseline | undefined, zoom: TimelineZoom, timezone: string, dateOnly: boolean) {
  const values = tasks.flatMap(task => [task.start, task.end]).filter((value): value is number => value !== null)
  for (const row of baseline?.records ?? []) for (const date of [row.start, row.end]) if (date) values.push(Date.parse(date))
  const min = values.reduce((low, value) => Math.min(low, value), Infinity), max = values.reduce((high, value) => Math.max(high, value), -Infinity)
  const civil = (at: number) => dateOnly ? new Date(at).toISOString().slice(0, 10) : localDate(new Date(at).toISOString(), timezone)
  const first = floor(civil(Number.isFinite(min) ? min : Date.now()), zoom), from = midnight(first, timezone, dateOnly)
  const end = Math.max(Number.isFinite(max) ? max : from, from + 720 / scale[zoom] * DAY)
  const ticks: { date: string; label: string; left: number; width: number }[] = []
  let date = first, until = from
  for (let index = 0; until <= end && index < timelineLimits.axisIntervals; index++) {
    const following = next(date, zoom), at = midnight(date, timezone, dateOnly)
    until = midnight(following, timezone, dateOnly)
    const label = zoom === 'year' ? date.slice(0, 4) : zoom === 'quarter' ? `Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1} ${date.slice(0, 4)}` : new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', ...(zoom === 'month' ? { month: 'short', year: 'numeric' } : { month: 'short', day: 'numeric' }) })
    ticks.push({ date, label, left: (at - from) / DAY * scale[zoom], width: (until - at) / DAY * scale[zoom] }); date = following
  }
  const width = (until - from) / DAY * scale[zoom]
  return { from, width, ticks, overflow: until <= end, x: (at: number) => (at - from) / DAY * scale[zoom], at: (x: number) => from + x / scale[zoom] * DAY, civil }
}
