import { sessionFetch } from '../../../../ui/shared/session-fetch'
import { useRef } from 'react'
import { useInitialDocumentValue } from '../../../app/document-data'
import { useEffect, useReducer, useState } from 'react'

export type LensCondition = { field: string; operator: string; value: string }
export type Lens = {
  id: string
  name: string
  description: string
  recordType: 'Campaign' | 'Risk' | 'Milestone' | 'Decision'
  conditions: LensCondition[]
  sort: string
  visibleFields: string[]
  display: string
  version: number
}
export type LensDraft = Omit<Lens, 'id' | 'version'>
export type LensPreview = { total: number | string; records: Array<{ id: string; title: string; subtitle: string; meta: string }> }

export class LensApiError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

type Load<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; value: T }
  | { kind: 'failed'; error: LensApiError }
  | { kind: 'not-found' }
  | { kind: 'signed-out' }

const object = (value: unknown, label: string) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new LensApiError(`${label} returned an invalid response.`, 502)
  }
  return value as Record<string, unknown>
}

const string = (source: Record<string, unknown>, key: string, label: string) => {
  if (typeof source[key] !== 'string') throw new LensApiError(`${label} omitted ${key}.`, 502)
  return source[key] as string
}

const number = (source: Record<string, unknown>, key: string, label: string) => {
  if (typeof source[key] !== 'number') throw new LensApiError(`${label} omitted ${key}.`, 502)
  return source[key] as number
}

const condition = (value: unknown): LensCondition => {
  const source = object(value, 'Lens condition')
  const raw = source.value
  return {
    field: string(source, 'field', 'Lens condition'),
    operator: string(source, 'operator', 'Lens condition'),
    value: Array.isArray(raw) ? raw.join(', ') : raw === undefined || raw === null ? '' : String(raw),
  }
}

const lens = (value: unknown): Lens => {
  const source = object(value, 'Lens')
  const recordType = string(source, 'recordType', 'Lens') as Lens['recordType']
  const sort = object(source.sort, 'Lens sort')
  if (!['Campaign', 'Risk', 'Milestone', 'Decision'].includes(recordType)
    || !Array.isArray(source.conditions) || !Array.isArray(source.fields)) {
    throw new LensApiError('Lens returned an invalid response.', 502)
  }
  return {
    id: string(source, 'id', 'Lens'),
    name: string(source, 'name', 'Lens'),
    description: string(source, 'description', 'Lens'),
    recordType,
    conditions: source.conditions.map(condition),
    sort: `${string(sort, 'field', 'Lens sort')}-${string(sort, 'direction', 'Lens sort') === 'desc' ? 'descending' : 'ascending'}`,
    visibleFields: source.fields.map((field) => {
      if (typeof field !== 'string') throw new LensApiError('Lens returned an invalid visible field.', 502)
      return field
    }),
    display: string(source, 'display', 'Lens'),
    version: number(source, 'version', 'Lens'),
  }
}

const request = async (path: string, init?: RequestInit) => {
  const response = await sessionFetch(path, { headers: { 'content-type': 'application/json', ...init?.headers }, ...init })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = payload && typeof payload === 'object' && 'error' in payload
      ? (payload as { error?: { message?: unknown } }).error
      : undefined
    throw new LensApiError(typeof error?.message === 'string' ? error.message : `Request to ${path} failed.`, response.status)
  }
  return object(payload, 'API')
}

const useLoad = <T>(key: string, load: () => Promise<T>, initial: T | undefined): [Load<T>, () => void] => {
  const [revision, retry] = useReducer((current) => current + 1, 0)
  const [state, setState] = useState<Load<T>>(() => initial === undefined ? { kind: 'loading' } : { kind: 'ready', value: initial })
  const mounted = useRef(false)
  useEffect(() => { if (!mounted.current) { mounted.current = true; if (initial !== undefined) return }
    let active = true
    setState({ kind: 'loading' })
    void load().then(
      (value) => { if (active) setState({ kind: 'ready', value }) },
      (caught: unknown) => {
        if (!active) return
        if (caught instanceof LensApiError && caught.status === 404) return setState({ kind: 'not-found' })
        if (caught instanceof LensApiError && caught.status === 401) return setState({ kind: 'signed-out' })
        setState({ kind: 'failed', error: caught instanceof LensApiError ? caught : new LensApiError('The lens request failed.', 0) })
      },
    )
    return () => { active = false }
  }, [key, revision])
  return [state, retry]
}

const definition = (draft: LensDraft) => {
  const match = /^(.*)-(ascending|descending)$/.exec(draft.sort)
  if (!match) throw new LensApiError('Sort must end in ascending or descending.', 400)
  return {
    name: draft.name,
    description: draft.description,
    recordType: draft.recordType,
    conditions: draft.conditions.map((item) => ({
      ...item,
      value: item.operator === 'one of'
        ? item.value.split(',').map((entry) => entry.trim()).filter(Boolean)
        : item.value,
    })),
    sort: { field: match[1], direction: match[2] === 'descending' ? 'desc' : 'asc' },
    fields: draft.visibleFields,
    display: draft.display,
  }
}

const decodeCatalog = (payload: unknown) => {
  const response = object(payload, 'Lens catalog')
  if (!Array.isArray(response.lenses)) throw new LensApiError('Lens catalog omitted lenses.', 502)
  return response.lenses.map(lens)
}
export const useLensCatalog = () => useLoad('lens-catalog', async () => decodeCatalog(await request('/api/lenses')), useInitialDocumentValue('/api/lenses', decodeCatalog))
export const useLens = (id: string | undefined) => useLoad(`lens:${id ?? 'new'}`, async () => id ? lens((await request(`/api/lenses/${encodeURIComponent(id)}`)).lens) : null, useInitialDocumentValue(`/api/lenses/${encodeURIComponent(id ?? '')}`, (value) => lens(object(value, 'Lens').lens)) ?? (id ? undefined : null))

export const previewLens = async (draft: LensDraft): Promise<LensPreview> => {
  const response = await request('/api/lenses/preview', { method: 'POST', body: JSON.stringify(definition(draft)) })
  if (!Array.isArray(response.records) || (typeof response.total !== 'number' && typeof response.total !== 'string')) {
    throw new LensApiError('Lens preview returned an invalid response.', 502)
  }
  return {
    total: response.total,
    records: response.records.map((item) => {
      const source = object(item, 'Lens preview record')
      return {
        id: string(source, 'id', 'Lens preview record'),
        title: string(source, 'title', 'Lens preview record'),
        subtitle: string(source, 'subtitle', 'Lens preview record'),
        meta: string(source, 'meta', 'Lens preview record'),
      }
    }),
  }
}

export const saveLens = async (id: string | undefined, draft: LensDraft & { version?: number }) => {
  const payload = { ...definition(draft), ...(draft.version ? { version: draft.version } : {}) }
  return lens((await request(id ? `/api/lenses/${encodeURIComponent(id)}` : '/api/lenses', {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(payload),
  })).lens)
}
