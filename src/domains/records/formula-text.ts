import type { Expr, Field } from './contracts'
import { functionDefinition } from './formula-functions'
const operators: Record<string,string> = { add: '+', subtract: '-', multiply: '*', divide: '/', concat: '&', eq: '=', ne: '!=', lt: '<', lte: '<=', gt: '>', gte: '>=' }
/** Reconstruct editable text with current labels; renames never invalidate stored formulas. */
export function formulaText(expr: Expr | undefined, fields: readonly Field[], depth = 0): string {
  if (!expr) return ''
  if (depth > 64) throw new Error('Expression depth exceeds 64')
  if (expr.kind === 'field') return `{${fields.find(f => f.id === expr.fieldId)?.label ?? expr.fieldId}}`
  if (expr.kind === 'literal') return expr.value === null ? 'BLANK()' : typeof expr.value === 'boolean' ? `${expr.value ? 'TRUE' : 'FALSE'}()` : expr.valueType === 'number' ? String(expr.value) : JSON.stringify(expr.value)
  if (expr.kind === 'rollup') return ''
  const args = expr.args.map(e => formulaText(e, fields, depth + 1))
  if (operators[expr.fn] && args.length === 2) return `(${args[0]} ${operators[expr.fn]} ${args[1]})`
  if (expr.fn === 'date_add') return `DATEADD(${args.join(', ')}, "days")`
  if (expr.fn === 'days_between') return `DATETIME_DIFF(${args[1]}, ${args[0]}, "days")`
  return `${functionDefinition(expr.fn).name}(${args.join(', ')})`
}
