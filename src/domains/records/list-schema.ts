import { z } from 'zod'
import type { Field, ListLevel, View } from './contracts'
import { idSchema, filterSchema } from './validators'
import { presentationFields } from './view-presentation'

export const listLevelSchema = z.object({
  entityId: idSchema,
  parentFieldId: idSchema.optional(),
  fields: z.array(idSchema).max(500),
  filter: filterSchema.optional(),
  sort: z.array(z.object({ fieldId: idSchema, direction: z.enum(['asc', 'desc']) }).strict()).max(10),
}).strict()
export const listLevelsSchema = z.array(listLevelSchema).min(1).max(5)

export function listLevelFields(level: ListLevel): string[] {
  return [...level.fields, ...(level.parentFieldId ? [level.parentFieldId] : []), ...level.sort.map(sort => sort.fieldId), ...(level.filter ? presentationFields(level.filter) : [])]
}

/** All levels are in the view's base; a child's link points back to its preceding table. */
export function validateListLevels(view: Pick<View, 'display' | 'appId' | 'entityId' | 'listLevels'>, fields: (entityId: string) => readonly Field[]): void {
  if (view.display !== 'list') {
    if (view.listLevels !== undefined) throw new Error('List levels require a list view')
    return
  }
  const levels = view.listLevels
  if (!levels?.length || levels.length > 5) throw new Error('A list view needs between one and five levels')
  if (levels[0]!.entityId !== view.entityId) throw new Error('The first list level must use the view table')
  for (const [index, level] of levels.entries()) {
    const available = fields(level.entityId)
    if (listLevelFields(level).some(id => !available.some(field => field.id === id))) throw new Error('List level references an unavailable field')
    if (new Set(level.fields).size !== level.fields.length) throw new Error('List level fields must be unique')
    if (index > 0 && !level.parentFieldId) throw new Error('A child list level needs a parent link')
    if (!level.parentFieldId) continue
    const parent = available.find(field => field.id === level.parentFieldId)
    if (parent?.type !== 'relation' || parent.relation?.cardinality !== 'one' || parent.relation.ownerAppId !== view.appId || parent.relation.entityId !== (index ? levels[index - 1]!.entityId : level.entityId)) throw new Error('A list parent field must link to one record in the preceding table, or its own table at the first level')
  }
}
