import type { CellValue, Money } from '../../contracts/primitives'
import type { EntitySchema, Field, RuleCondition } from './contracts'
import { canonical } from '../admission/canonical'
import { AdmissionError } from '../admission/errors'
import { compare } from './exact'
import { validationPattern } from './validation-pattern'

export type ValidationViolation = { ruleId: string; ruleName: string; message: string }
export function emptyRuleValue(value: CellValue | undefined) {
  return value === undefined || value === null || typeof value === 'string' && !value.trim() || Array.isArray(value) && !value.length
}
export function compareRuleValues(field: Field, left: CellValue, right: CellValue): number | undefined {
  if (left === null || right === null) return undefined
  if (['number','rating','duration'].includes(field.type) && typeof left === 'string' && typeof right === 'string') return compare(left, right)
  if (field.type === 'money' && typeof left === 'object' && typeof right === 'object' && 'minor' in left && 'minor' in right) {
    if (left.currency !== right.currency || left.scale !== right.scale) return undefined
    return compare(left.minor, right.minor)
  }
  if (['text', 'url', 'email', 'date', 'instant', 'select', 'person'].includes(field.type) && typeof left === 'string' && typeof right === 'string')
    return left < right ? -1 : left > right ? 1 : 0
  return undefined
}
export function matchesRule(condition: RuleCondition, fields: readonly Field[], values: Readonly<Record<string, CellValue>>): boolean {
  if (condition.kind !== 'condition') return condition.kind === 'all'
    ? condition.conditions.every(c => matchesRule(c, fields, values)) : condition.conditions.some(c => matchesRule(c, fields, values))
  const value = values[condition.fieldId] ?? null, expected = condition.value ?? null
  if (condition.op === 'empty') return emptyRuleValue(value)
  if (condition.op === 'not_empty') return !emptyRuleValue(value)
  if (condition.op === 'eq' || condition.op === 'ne') return (canonical(value) === canonical(expected)) === (condition.op === 'eq')
  const field = fields.find(f => f.id === condition.fieldId)!
  const compared = compareRuleValues(field, value, expected)
  if (compared === undefined) return false
  return condition.op === 'gt' ? compared > 0 : condition.op === 'gte' ? compared >= 0 : condition.op === 'lt' ? compared < 0 : compared <= 0
}
export function fieldValidationViolations(field: Field, value: CellValue): ValidationViolation[] {
  const violations: ValidationViolation[] = []
  const fail = (kind: string, message: string) => violations.push({ ruleId: `${field.id}:${kind}`, ruleName: `${field.label} ${kind}`, message })
  if (field.required && emptyRuleValue(value)) fail('required', `${field.label} is required.`)
  if (value === null) return violations
  const limits = field.validation
  if (!limits) return violations
  for (const bound of ['min', 'max'] as const) if (limits[bound] !== undefined) {
    const scalar = field.type === 'money' ? (value as Money).minor : value as string
    const order = ['number','money','rating','duration'].includes(field.type) ? compare(scalar, limits[bound]!) : scalar < limits[bound]! ? -1 : scalar > limits[bound]! ? 1 : 0
    if (bound === 'min' ? order < 0 : order > 0) fail(bound, `${field.label} must be ${bound === 'min' ? 'at least' : 'at most'} ${limits[bound]}.`)
  }
  if (typeof value === 'string') {
    const length = [...value].length
    if (limits.minLength !== undefined && length < limits.minLength) fail('minLength', `${field.label} needs at least ${limits.minLength} characters.`)
    if (limits.maxLength !== undefined && length > limits.maxLength) fail('maxLength', `${field.label} allows at most ${limits.maxLength} characters.`)
    if (limits.pattern && !validationPattern(limits.pattern).test(value)) fail('pattern', `${field.label} must match pattern ${limits.pattern}.`)
  }
  return violations
}
export function recordValidationViolations(schema: Pick<EntitySchema, 'fields' | 'validationRules'>, values: Readonly<Record<string, CellValue>>): ValidationViolation[] {
  const violations = schema.fields.filter(f => f.type !== 'computed').flatMap(field => fieldValidationViolations(field, values[field.id] ?? null))
  for (const rule of schema.validationRules ?? []) if (matchesRule(rule.when, schema.fields, values) && !matchesRule(rule.require, schema.fields, values))
    violations.push({ ruleId: rule.id, ruleName: rule.name, message: rule.message })
  return violations
}
export function assertRecordValidation(schema: Pick<EntitySchema, 'fields' | 'validationRules'>, values: Readonly<Record<string, CellValue>>) {
  const violations = recordValidationViolations(schema, values)
  if (violations.length) throw new AdmissionError('validation', violations.map(v => `${v.ruleName}: ${v.message}`).join(' '))
}
