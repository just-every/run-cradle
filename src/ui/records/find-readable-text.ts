import type { Cell, CellValue, ScalarCellValue, Page, Ref } from '../../contracts/primitives'
import type { Member } from '../../domains/authority/contracts'
import type { EntitySchema, Field, RecordDetail } from '../../domains/records/contracts'
import { readApi, RequestFailure } from '../shared/api'
import { money } from '../shared/presentation'
import { primaryRecordField } from './record-label'

/** One resolver per search: a new search reads labels under current policy. */
export function createFindReadableText(signal: AbortSignal) {
  const schemas = new Map<string, Promise<EntitySchema | null>>()
  const links = new Map<string, Promise<string>>()
  const people = new Map<string, Promise<Map<string, string>>>()

  async function permitted<T>(url: string): Promise<T | null> {
    signal.throwIfAborted()
    try { return (await readApi<T>(url, undefined, signal)).data }
    catch (error) {
      // Authentication, transport, malformed responses and server failures must
      // reach the search's error state, rather than become an apparent no-match.
      if (error instanceof RequestFailure && (error.status === 403 || error.status === 404)) return null
      throw error
    }
  }

  function personName(appId: string, id: string): Promise<string> {
    let names = people.get(appId)
    if (!names) {
      names = permitted<Page<Member>>(`/api/v1/members?appId=${encodeURIComponent(appId)}`).then(page => new Map(
        page?.items.filter(member => member.state === 'active').map(member => [member.id, member.name]) ?? [],
      ))
      people.set(appId, names)
    }
    return names.then(items => items.get(id) ?? '')
  }

  function linkedName(reference: Ref): Promise<string> {
    const base = `/api/v1/apps/${encodeURIComponent(reference.appId)}/entities/${encodeURIComponent(reference.entityId)}`
    const url = `${base}/records/${encodeURIComponent(reference.recordId)}`
    let label = links.get(url)
    if (!label) {
      label = (async () => {
        let schema = schemas.get(base)
        if (!schema) { schema = permitted<EntitySchema>(base); schemas.set(base, schema) }
        const target = await schema
        if (!target) return ''
        const detail = await permitted<RecordDetail>(url)
        if (!detail) return ''
        const primary = primaryRecordField(target)
        if (!primary) return ''
        const cell = detail.record.fields[primary.id]
        if (cell?.state !== 'value' || cell.value === null) return ''
        // LinkedRecord's title is its primary scalar label. Never index its
        // missing-title placeholder, references or internal person identity.
        const type = primary.type === 'computed' ? primary.resultType : primary.type
        if (type === 'select') return primary.options?.find(option => option.id === cell.value)?.label ?? ''
        if (typeof cell.value === 'boolean') return cell.value ? 'Yes' : 'No'
        if (type === 'person') return typeof cell.value === 'string' ? personName(target.appId, cell.value) : ''
        return typeof cell.value === 'string' && cell.value.trim() ? cell.value : ''
      })()
      links.set(url, label)
    }
    return label
  }

  async function valueText(field: Field, value: CellValue, appId: string): Promise<string> {
    signal.throwIfAborted()
    if (value === null) return ''
    if (field.type === 'computed' && field.resultType === 'array') {
      if (!Array.isArray(value) || !field.resultElementType) return ''
      const element = { ...field, resultType: field.resultElementType, resultElementType: undefined }
      const parts: string[] = []
      for (const item of value as ScalarCellValue[]) parts.push(await valueText(element, item, appId))
      return parts.filter(Boolean).join(', ')
    }
    const type = field.type === 'computed' ? field.resultType : field.type
    if (type === 'attachment') return ''
    if (type === 'select' || type === 'multi_select') {
      const ids = Array.isArray(value) ? value : [value]
      return ids.map(id => field.options?.find(option => option.id === id)?.label ?? '').filter(Boolean).join(', ')
    }
    if (type === 'person') return typeof value === 'string' ? personName(appId, value) : ''
    if (type === 'relation') {
      const references = Array.isArray(value) ? value : [value], labels: string[] = []
      for (const reference of references) {
        if (reference && typeof reference === 'object' && 'recordId' in reference) labels.push(await linkedName(reference))
      }
      return labels.filter(Boolean).join(', ')
    }
    if (type === 'boolean') return typeof value === 'boolean' ? value ? 'Yes' : 'No' : ''
    if (type === 'money') return typeof value === 'object' && !Array.isArray(value) && 'minor' in value ? money(value).replace('USD ', '$') : ''
    if (type === 'text' || type === 'number' || type === 'date' || type === 'instant' || type === 'url') return typeof value === 'string' ? value : ''
    return ''
  }

  return (field: Field, cell: Cell | undefined, appId: string) => cell?.state === 'value' ? valueText(field, cell.value, appId) : Promise.resolve('')
}
