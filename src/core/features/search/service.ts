import type { RequestContext } from '../../../domains/authority/ports'
import { assertGuards } from '../../../domains/records/fence.server'
import type { createRecordServices } from '../../../domains/records/service.server'
import { AdmissionError } from '../../../domains/admission/errors'

export type SearchHit = { id: string; appId: string; entityId: string; baseName: string; recordType: string; name: string; href: string }

export const createSearchService = (db: D1Database, records: ReturnType<typeof createRecordServices>) => ({
  async search(ctx: RequestContext, query: string | undefined, includeArchived: boolean): Promise<SearchHit[]> {
    const term = query?.trim()
    if (!term) throw new AdmissionError('validation', 'Search requires a token.')
    const apps = await records.metadata.apps(ctx)
    const searches = await Promise.all(apps.map(async app => ({ app, ...await records.search(ctx, app.id, term, includeArchived) })))
    const hits = searches.flatMap(({ app, results }) => results.flatMap(({ entityId, items }) => {
      const descriptor = records.descriptors.get(app.id, entityId)
      const titleId = descriptor.schema.primaryFieldId ?? [...descriptor.fields.values()].find(storage => ['name', 'title'].includes(storage.column))?.field.id ?? descriptor.schema.fields.find(field => field.type === 'text')?.id
      return items.map(row => {
        const cell = titleId ? row.fields[titleId] : undefined
        const titleField = descriptor.schema.fields.find(field => field.id === titleId)
        const titleType = titleField?.type === 'computed' ? titleField.resultType : titleField?.type
        const title = cell?.state === 'value' ? typeof cell.value === 'boolean' ? cell.value ? 'Yes' : 'No' : typeof cell.value === 'string' ? titleType === 'select' ? titleField?.options?.find(option => option.id === cell.value)?.label : cell.value : undefined : undefined
        return { id: row.id, appId: app.id, entityId, baseName: app.name, recordType: descriptor.schema.label, name: title?.trim() || 'Record without a title', href: `/app/records/${app.id}/${entityId}/${row.id}` }
      })
    }))
    await assertGuards(db, searches.flatMap(search => search.guards))
    return hits
  },
})
