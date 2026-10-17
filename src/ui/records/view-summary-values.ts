import type { CellValue, Money } from '../../contracts/primitives'
import type { EntitySchema, Field, RecordRow } from '../../domains/records/contracts'
import { add, compare, decimal, divide, format } from '../../domains/records/exact'

export type SummaryAggregate = 'sum' | 'average' | 'min' | 'max' | 'count' | 'empty' | 'percent-filled'
export type SummaryValue = { available: true; value: string; note?: string } | { available: false; reason: string }
export type SummaryGroup = { key: string; label: string; count: number }
export type SummaryGroups = { available: true; groups: SummaryGroup[] } | { available: false; reason: string }
export const summaryEmpty = (value: CellValue) => value === null || value === '' || Array.isArray(value) && value.length === 0
export const summaryNumeric = (field: Field) => ['number', 'money'].includes(field.type === 'computed' ? field.resultType ?? '' : field.type)
const unavailable = (reason: string): SummaryValue => ({ available: false, reason })
const isMoney = (value: CellValue): value is Money => value !== null && !Array.isArray(value) && typeof value === 'object' && 'minor' in value

/** Count means filled cells. Null, an empty string and an empty array are empty; false and zero are filled. */
export function computeViewAggregate(rows: RecordRow[], field: Field, aggregate: SummaryAggregate): SummaryValue {
  const values: CellValue[] = []
  for (const row of rows) {
    const cell = row.fields[field.id]
    if (cell?.state !== 'value') return unavailable('A selected cell is restricted, unavailable or missing. No aggregate can be shown for this field.')
    if (!summaryEmpty(cell.value)) values.push(cell.value)
  }
  if (aggregate === 'count') return { available: true, value: String(values.length) }
  if (aggregate === 'empty') return { available: true, value: String(rows.length - values.length) }
  if (aggregate === 'percent-filled') {
    if (!rows.length) return unavailable('Percent filled is undefined when no records match.')
    try { return { available: true, value: `${divide(String(values.length * 100), String(rows.length))}%` } }
    catch {
      const units = (BigInt(values.length) * 10000n + BigInt(rows.length) / 2n) / BigInt(rows.length)
      return { available: true, value: `≈ ${format({ units, scale: 2 })}%`, note: `${values.length} filled of ${rows.length}; percentage rounded to two decimal places.` }
    }
  }
  if (!summaryNumeric(field)) return unavailable('Sum, average, minimum and maximum require a number or money field.')
  const moneyField = (field.type === 'computed' ? field.resultType : field.type) === 'money'
  if (!values.length) return aggregate === 'sum' && !moneyField ? { available: true, value: '0' } : unavailable('No filled values are available for this calculation.')
  try {
    let currency: string | undefined, scale: number | undefined
    const numbers = values.map(value => {
      if (moneyField) {
        if (!isMoney(value) || !/^[A-Z]{3}$/.test(value.currency) || !Number.isInteger(value.scale) || value.scale < 0 || value.scale > 6 || !/^-?(0|[1-9]\d*)$/.test(value.minor)) throw Error('A money value is invalid.')
        if (currency !== undefined && (currency !== value.currency || scale !== value.scale)) throw Error('Mixed currencies or money scales cannot be aggregated.')
        currency = value.currency; scale = value.scale
        decimal(value.minor)
        return value.minor
      }
      if (typeof value !== 'string') throw Error('A number value is invalid.')
      decimal(value)
      return value
    })
    let result = numbers[0]!
    if (aggregate === 'sum' || aggregate === 'average') {
      result = numbers.reduce((sum, value) => add(sum, value), '0')
      if (aggregate === 'average') {
        try { result = divide(result, String(numbers.length)) }
        catch { return unavailable('The average is non-terminating or exceeds the supported exact precision. No rounded average is shown.') }
      }
    } else for (const value of numbers.slice(1)) if (aggregate === 'min' ? compare(value, result) < 0 : compare(value, result) > 0) result = value
    const exact = decimal(result)
    return { available: true, value: currency ? `${currency} ${format({ units: exact.units, scale: exact.scale + scale! })}` : format(exact) }
  } catch (error) { return unavailable(error instanceof Error ? error.message : 'The selected values cannot be aggregated exactly.') }
}

function groupValue(field: Field, value: CellValue): string {
  if (summaryEmpty(value)) return 'Empty'
  if (field.type === 'select') {
    const option = field.options?.find(option => option.id === value)
    if (!option) throw Error('A grouping option is unavailable. Refresh the view schema.')
    return option.label
  }
  if (field.type === 'boolean' && typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (field.type === 'text' && typeof value === 'string') return value
  throw Error('Group counts currently support visible text, select and boolean fields.')
}

/** Never uses raw server group keys: those can include hidden renderer fields. */
export function computeViewGroupCounts(rows: RecordRow[], schema: EntitySchema, visible: string[], groupBy: string[]): SummaryGroups {
  if (!groupBy.length) return { available: true, groups: [] }
  const fields = groupBy.map(id => visible.includes(id) ? schema.fields.find(field => field.id === id) : undefined)
  if (fields.some(field => !field)) return { available: false, reason: 'Group counts are unavailable because a grouping field is hidden or unreadable.' }
  const groups = new Map<string, SummaryGroup>()
  try {
    for (const row of rows) {
      const values = fields.map(field => {
        const cell = row.fields[field!.id]
        if (cell?.state !== 'value') throw Error('Group counts are unavailable because a grouping cell is restricted, unavailable or missing.')
        return { value: cell.value, label: `${field!.label}: ${groupValue(field!, cell.value)}` }
      })
      const key = JSON.stringify(values.map(item => item.value)), old = groups.get(key)
      if (old) old.count++
      else groups.set(key, { key, label: values.map(item => item.label).join(' · '), count: 1 })
    }
    return { available: true, groups: [...groups.values()] }
  } catch (error) { return { available: false, reason: error instanceof Error ? error.message : 'Group counts are unavailable.' } }
}
