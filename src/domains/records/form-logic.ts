import type { CellValue } from '../../contracts/primitives'
import type { Field, Form, RuleCondition } from './contracts'
import { matchesRule } from './validation-rules'

export function formConditionFields(condition: RuleCondition): string[] {
  return condition.kind === 'condition' ? [condition.fieldId] : condition.conditions.flatMap(formConditionFields)
}

/** Hidden answers cannot influence later answers, even through an empty comparison. */
export function visibleFormFields(form: Pick<Form, 'fields'>, fields: Field[], values: Readonly<Record<string, CellValue>>) {
  const visible = new Set<string>()
  return form.fields.filter(field => {
    const show = !field.showWhen || formConditionFields(field.showWhen).every(id => visible.has(id)) && matchesRule(field.showWhen, fields, values)
    if (show) visible.add(field.fieldId)
    return show
  })
}

export function visibleFormValues(form: Pick<Form, 'fields'>, fields: Field[], values: Readonly<Record<string, CellValue>>) {
  const visible = new Set(visibleFormFields(form, fields, values).map(f => f.fieldId))
  return Object.fromEntries(Object.entries(values).filter(([id]) => visible.has(id)))
}
