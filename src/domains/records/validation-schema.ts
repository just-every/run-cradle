import type { CellValue } from '../../contracts/primitives'
import type { Field, RuleCondition, ValidationRule } from './contracts'
import { compare, decimal } from './exact'
import { fieldValidationViolations } from './validation-rules'
import { validationPattern } from './validation-pattern'

type ParseCell = (field: Field, value: unknown) => CellValue
export function validateFieldConfiguration(field: Field, parse: ParseCell) {
  if(field.linkPicker){
    if(field.type!=='relation'||!field.relation)throw new Error('Picker settings require a linked-record field.')
    for(const ids of [field.linkPicker.searchFieldIds,field.linkPicker.displayFieldIds])if(new Set(ids).size!==ids.length)throw new Error('Picker fields must not repeat.')
  }
  if (field.unique && (['multi_select','attachment','computed'].includes(field.type) || field.type === 'relation' && field.relation?.cardinality === 'many')) throw new Error('Uniqueness is available for scalar fields only.')
  const limits = field.validation
  if (field.type === 'computed' && (limits !== undefined || field.defaultValue !== undefined)) throw new Error('Calculated fields cannot declare validation or defaults.')
  if (limits) {
    if ((limits.min !== undefined || limits.max !== undefined) && !['number', 'money', 'date', 'instant'].includes(field.type)) throw new Error('Min/max bounds require a number, money, date or instant field.')
    if ((limits.minLength !== undefined || limits.maxLength !== undefined || limits.pattern !== undefined) && !['text', 'url'].includes(field.type)) throw new Error('Length and pattern rules require a text or URL field.')
    for (const value of [limits.min, limits.max]) if (value !== undefined) {
      if (field.type === 'number' || field.type === 'money') { decimal(value); if (field.type === 'money' && !/^-?(0|[1-9]\d*)$/.test(value)) throw new Error('Money bounds use integer minor units.') }
      else parse({ ...field, required: false }, value)
    }
    if (limits.min !== undefined && limits.max !== undefined && (field.type === 'number' || field.type === 'money' ? compare(limits.min, limits.max) > 0 : limits.min > limits.max)) throw new Error('Minimum must not exceed maximum.')
    if (limits.minLength !== undefined && limits.maxLength !== undefined && limits.minLength > limits.maxLength) throw new Error('Minimum length must not exceed maximum length.')
    if (limits.pattern !== undefined) validationPattern(limits.pattern)
  }
  if (field.defaultValue !== undefined) {
    field.defaultValue = parse(field, field.defaultValue)
    const violations = fieldValidationViolations(field, field.defaultValue)
    if (violations.length) throw new Error(`Default breaks ${violations.map(v => v.ruleName).join(', ')}.`)
  }
}
export function assertRuleBounds(value: unknown) {
  const pending = [{ value, depth: 0 }]
  let nodes = 0
  while (pending.length) {
    const node = pending.pop()!
    if (++nodes > 100 || node.depth > 8) throw new Error('A rule condition supports at most 100 nodes and 8 levels.')
    if (node.value && typeof node.value === 'object' && 'conditions' in node.value && Array.isArray(node.value.conditions))
      pending.push(...node.value.conditions.map(value => ({ value, depth: node.depth + 1 })))
  }
}
export function validateTableRules(table: { fields: Field[]; validationRules?: ValidationRule[] }, parse: ParseCell) {
  const rules = table.validationRules ?? []
  if (new Set(rules.map(r => r.id)).size !== rules.length || new Set(rules.map(r => r.name)).size !== rules.length) throw new Error('Validation rule names and identities must be unique within a table.')
  function check(condition: RuleCondition) {
    if (condition.kind !== 'condition') { condition.conditions.forEach(check); return }
    const field = table.fields.find(f => f.id === condition.fieldId)
    if (!field || field.type === 'computed') throw new Error('Validation rules must reference stored fields in this table.')
    if (condition.op === 'empty' || condition.op === 'not_empty') {
      if (condition.value !== undefined) throw new Error('Empty conditions do not take a value.')
      return
    }
    if (condition.value === undefined) throw new Error('A comparison condition requires a typed value.')
    condition.value = parse({ ...field, required: false }, condition.value)
    if (['gt', 'gte', 'lt', 'lte'].includes(condition.op) && (condition.value === null || !['number', 'money', 'date', 'instant', 'text', 'url'].includes(field.type))) throw new Error('Ordered comparisons require a nonempty number, money, date, instant or text value.')
  }
  for (const rule of rules) {
    try { assertRuleBounds(rule.when); assertRuleBounds(rule.require); check(rule.when); check(rule.require) }
    catch (error) { throw new Error(`${rule.name}: ${(error as Error).message}`) }
  }
}
