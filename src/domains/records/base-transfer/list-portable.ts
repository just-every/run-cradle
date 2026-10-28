import type { Filter, ListLevel } from '../contracts'
import { validateListLevels } from '../list-schema'
import type { PortableBase, PortableView } from './json-format'
import { nativePortableField } from './json-validation'
import { remapFilter } from './json-remap'
import { ImportInputError } from './input-error'

export function validatePortableList(view: PortableView, base: PortableBase['base']): void {
  try {
    validateListLevels({ ...view, appId: base.id, entityId: view.tableId }, entityId => {
      const table = base.tables.find(table => table.id === entityId)
      if (!table) throw new Error('List level references an unavailable table')
      return table.fields.map(field => nativePortableField(field, base.id))
    })
  } catch (error) { throw new ImportInputError(`${view.name}: ${(error as Error).message}`) }
  for (const level of view.listLevels ?? []) {
    const table = base.tables.find(table => table.id === level.entityId)!
    const check = (filter: Filter): void => {
      if (filter.kind !== 'condition') { filter.conditions.forEach(check); return }
      const field = table.fields.find(field => field.id === filter.fieldId)!
      for (const value of Array.isArray(filter.value) ? filter.value : [filter.value]) {
        if (value === undefined || value === null) continue
        if ((['select', 'multi_select'].includes(field.type) || ['select', 'multi_select'].includes(field.resultType ?? '') || field.resultElementType === 'select') && !field.options?.some(option => option.id === value)) throw new ImportInputError(`${view.name}: dangling list filter option`)
        if (field.relation && (typeof value !== 'object' || !('recordId' in value) || !('appId' in value) || !('entityId' in value) || value.appId !== base.id || value.entityId !== field.relation.tableId || !base.tables.find(table => table.id === field.relation!.tableId)!.records.some(row => row.id === value.recordId))) throw new ImportInputError(`${view.name}: dangling list filter link`)
      }
    }
    if (level.filter) check(level.filter)
  }
}

export function remapListLevels(levels: ListLevel[], tables: PortableBase['base']['tables'], map: Map<string, string>): ListLevel[] {
  return levels.map(level => ({ ...level, entityId: map.get(level.entityId)!, ...(level.parentFieldId ? { parentFieldId: map.get(level.parentFieldId)! } : {}), fields: level.fields.map(id => map.get(id)!), ...(level.filter ? { filter: remapFilter(level.filter, tables.find(table => table.id === level.entityId)!, map) } : {}), sort: level.sort.map(sort => ({ ...sort, fieldId: map.get(sort.fieldId)! })) }))
}
