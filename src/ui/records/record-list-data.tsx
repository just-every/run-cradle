import { useEffect, useState } from 'react'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { useDocumentSession } from '../../core/app/document-context'
import { createUlid } from '../../core/shared/ids'
import type { Page, Ref } from '../../contracts/primitives'
import type { EntitySchema, ListLevel, Query, RecordRow } from '../../domains/records/contracts'
import { idSchema } from '../../domains/records/validators'
import { readApi } from '../shared/api'

/** A projected null link may still have a hidden parent. Establish roots before
 * cell projection, returning only identities of readable, genuinely unlinked rows. */
const readListRoots = createServerFn({ method: 'GET' })
  .inputValidator((input: unknown) => z.object({ appId: idSchema, entityId: idSchema, parentFieldId: idSchema }).strict().parse(input))
  .handler(async ({ data }) => {
    const [{ env }, { getRequest }, { currentComposition }, { and, identifier, trustedPredicate }] = await Promise.all([
      import('cloudflare:workers'), import('@tanstack/react-start/server'),
      import('../../core/app/application-cache.server'), import('../../domains/admission/sql.server'),
    ])
    const { runtime } = await currentComposition(env), { foundation, records } = runtime
    const ctx = await foundation.authenticate(getRequest(), 'http', createUlid())
    const scope = await foundation.policy.scope(ctx, { appId: data.appId, entityId: data.entityId, purpose: 'read' })
    const parent = foundation.descriptors.get(data.appId, data.entityId).fields.get(data.parentFieldId)
    if (parent?.field.type !== 'relation' || parent.field.relation?.cardinality !== 'one' || parent.field.relation.ownerAppId !== data.appId || parent.field.relation.entityId !== data.entityId || !scope.readableFieldIds.includes(data.parentFieldId) || !scope.discoverableRelations.includes(data.parentFieldId)) throw Error('The list parent link is unavailable.')
    const empty = trustedPredicate(`${identifier(parent.column)} IS NULL`)
    const rootsScope = { ...scope, rowPredicate: and(scope.rowPredicate, empty), cursorPredicate: and(scope.cursorPredicate ?? scope.rowPredicate, empty) }
    const roots: Pick<RecordRow, 'id' | 'version'>[] = []
    let cursor: string | undefined
    do {
      const page = await records.services.reader.query(ctx, rootsScope, { fields: [], limit: 100, ...(cursor ? { cursor } : {}) })
      roots.push(...page.items.map(({ id, version }) => ({ id, version })))
      cursor = page.nextCursor ?? undefined
    } while (cursor)
    await records.services.reader.assertScope(ctx, scope)
    return roots
  })

export const listRecordKey = (ref: Ref) => `${ref.appId}:${ref.entityId}:${ref.recordId}`
export function listParent(row: RecordRow, fieldId?: string): Ref | null | undefined {
  if (!fieldId) return null
  const cell = row.fields[fieldId]
  if (cell?.state !== 'value') return undefined
  const value = cell.value
  if (value === null) return null
  return typeof value === 'object' && !Array.isArray(value) && 'recordId' in value ? value : undefined
}

/** Follow the public cursor, never the total: totals may be deliberately bounded. */
async function pages<T>(url: string, signal: AbortSignal, query?: Query): Promise<T[]> {
  const rows: T[] = [], visited = new Set<string>()
  let cursor: string | null = null
  do {
    const { data }: { data: Page<T> } = await readApi<Page<T>>(query ? url : `${url}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, query ? { method: 'POST', body: JSON.stringify({ ...query, limit: 100, ...(cursor ? { cursor } : {}) }) } : undefined, signal)
    rows.push(...data.items)
    cursor = data.nextCursor
    if (cursor && visited.has(cursor)) throw Error('The list returned a repeated page cursor. Refresh the list.')
    if (cursor) visited.add(cursor)
  } while (cursor)
  return rows
}

export function useListSchemas(schema: EntitySchema) {
  const principal = useDocumentSession()?.operator.id
  const key = `${principal}:${schema.appId}:${schema.version}`
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<{ key: string; schemas?: EntitySchema[]; error?: string }>({ key })
  useEffect(() => {
    const abort = new AbortController()
    setState({ key })
    void pages<EntitySchema>(`/api/v1/apps/${encodeURIComponent(schema.appId)}/entities`, abort.signal).then(schemas => {
      if (!abort.signal.aborted) setState({ key, schemas })
    }, error => { if (!abort.signal.aborted) setState({ key, error: error instanceof Error ? error.message : 'Could not read table schemas.' }) })
    return () => abort.abort()
  }, [key, revision])
  return { schemas: state.key === key ? state.schemas : undefined, error: state.key === key ? state.error : undefined, refresh: () => setRevision(value => value + 1) }
}

export function listConfigurationError(schema: EntitySchema, levels: ListLevel[], schemas: EntitySchema[]): string | undefined {
  if (!levels.length || levels.length > 5 || levels[0]?.entityId !== schema.id) return 'Choose one to five list levels, starting with this table.'
  for (const [index, level] of levels.entries()) {
    const table = schemas.find(item => item.id === level.entityId)
    if (!table) return `Level ${index + 1}: this table is unavailable.`
    // Current field policy may legitimately remove every selected display field.
    if (level.fields.some(id => !table.fields.some(field => field.id === id))) return `Level ${index + 1}: choose available visible fields.`
    if (index > 0 || level.parentFieldId) {
      const parent = table.fields.find(field => field.id === level.parentFieldId)
      if (parent?.type !== 'relation' || parent.relation?.cardinality !== 'one' || parent.relation.ownerAppId !== schema.appId || parent.relation.entityId !== (levels[index - 1]?.entityId ?? schema.id)) return `Level ${index + 1}: choose a single parent link to the preceding table.`
    }
  }
}

/** Display pages and root membership are authorized by the server. */
export function useListRows(appId: string, levels: ListLevel[], enabled: boolean) {
  const principal = useDocumentSession()?.operator.id
  const key = JSON.stringify([principal, appId, levels, enabled])
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<{ key: string; rows?: RecordRow[][]; roots?: Pick<RecordRow, 'id' | 'version'>[]; error?: string }>({ key })
  useEffect(() => {
    if (!enabled) return
    const abort = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined, running = false, paused = false, requested = 0, completed = -1, previous = ''
    const entities = [...new Set(levels.map(level => level.entityId))]
    setState({ key })
    async function tick() {
      if (running || paused || abort.signal.aborted || document.visibilityState !== 'visible' || !navigator.onLine) return
      running = true
      try {
        const presence = await Promise.all(entities.map(entityId => readApi<{ revision: number; accessRevision: string }>(`/api/v1/apps/${appId}/entities/${entityId}/presence`, { method: 'POST', body: '{}' }, abort.signal)))
        const fingerprint = JSON.stringify(presence.map(item => item.data))
        if (fingerprint !== previous || completed !== requested) {
          const reading = requested
          const first = levels[0]!
          const [rows, roots] = await Promise.all([
            Promise.all(levels.map(level => pages<RecordRow>(`/api/v1/apps/${appId}/entities/${level.entityId}/query`, abort.signal, { fields: [...new Set([...level.fields, ...(level.parentFieldId ? [level.parentFieldId] : [])])], filter: level.filter, sort: level.sort }))),
            first.parentFieldId ? readListRoots({ data: { appId, entityId: first.entityId, parentFieldId: first.parentFieldId }, signal: abort.signal }) : undefined,
          ])
          if (!abort.signal.aborted && reading === requested) setState({ key, rows, roots })
          completed = reading
        }
        previous = fingerprint
      } catch (error) {
        if (!abort.signal.aborted) {
          setState({ key, error: error instanceof Error ? error.message : 'Could not read list records.' })
          paused = true
        }
      } finally {
        running = false
        if (!abort.signal.aborted && !paused) timer = setTimeout(tick, 1000)
      }
    }
    const refresh = () => { requested++; paused = false; clearTimeout(timer); void tick() }
    const revoked = () => { paused = true; setState({ key, error: 'Your session changed. Sign in again to read this list.' }) }
    window.addEventListener('records-changed', refresh)
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', refresh)
    document.addEventListener('cradle:session-revoked', revoked)
    void tick()
    return () => { abort.abort(); clearTimeout(timer); window.removeEventListener('records-changed', refresh); window.removeEventListener('online', refresh); document.removeEventListener('visibilitychange', refresh); document.removeEventListener('cradle:session-revoked', revoked) }
  }, [key, revision])
  return { rows: state.key === key && enabled ? state.rows : undefined, roots: state.key === key && enabled ? state.roots : undefined, error: state.key === key ? state.error : undefined, refresh: () => setRevision(value => value + 1) }
}

export function useListExpansion(appId: string, viewKey: string) {
  const principal = useDocumentSession()?.operator.id
  const key = principal ? `cradle-list-expanded:${principal}:${appId}:${viewKey}` : null
  const [state, setState] = useState<{ key: string | null; paths: string[]; error?: string }>({ key: null, paths: [] })
  useEffect(() => {
    if (!key) return
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
      if (!Array.isArray(saved) || !saved.every(path => typeof path === 'string')) throw Error('Invalid expansion state')
      setState({ key, paths: saved })
    } catch { setState({ key, paths: [], error: 'Saved expansion state could not be read. Reset it to remember branches again.' }) }
  }, [key])
  function update(paths: string[]) {
    if (!key) return
    try { localStorage.setItem(key, JSON.stringify(paths)); setState({ key, paths }) }
    catch { setState({ key, paths, error: 'Browser storage could not save expanded branches.' }) }
  }
  const paths = state.key === key ? state.paths : []
  return { paths, error: state.key === key ? state.error : undefined, toggle: (path: string) => update(paths.includes(path) ? paths.filter(item => item !== path) : [...paths, path]), expand: (path: string) => { if (!paths.includes(path)) update([...paths, path]) }, reset: () => update([]) }
}
