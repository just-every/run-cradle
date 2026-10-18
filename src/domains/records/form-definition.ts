import { z } from 'zod'
import type { Field, Form } from './contracts'
import { idSchema, ruleConditionSchema, validateCell } from './validators'
import { validateTableRules } from './validation-schema'

export const formFieldDefinition = z.object({
  fieldId: idSchema, label: z.string().max(200), help: z.string().max(2000), required: z.boolean(),
  showWhen: ruleConditionSchema.optional(), page: z.string().trim().min(1).max(120).optional(), section: z.string().trim().min(1).max(120).optional(),
}).strict()

export function validateFormLogic(form: Pick<Form, 'fields'>, fields: Field[]) {
  const earlier: Field[] = [], pages = new Set<string>()
  let page: string | undefined
  for (const definition of form.fields) {
    const field = fields.find(f => f.id === definition.fieldId)
    if (!field) throw Error('Form field is unavailable. Edit the form after changing its schema.')
    const nextPage = definition.page ?? ''
    if (nextPage !== page) {
      if (pages.has(nextPage)) throw Error('Keep each form page together in field order.')
      pages.add(nextPage); page = nextPage
    }
    if (definition.showWhen) {
      if (field.required || field.defaultValue !== undefined) throw Error(`${field.label}: required fields and fields with defaults must always be shown.`)
      validateTableRules({ fields: earlier, validationRules: [{ id: field.id, name: definition.label, message: 'Form visibility', when: definition.showWhen, require: definition.showWhen }] }, validateCell)
    }
    earlier.push(field)
  }
}
