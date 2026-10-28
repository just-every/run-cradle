import { useRef, useState } from 'react'
import type { CellValue } from '../../contracts/primitives'
import type { EntitySchema, ListLevel, RecordRow } from '../../domains/records/contracts'
import { GridHistoryProvider } from './grid-history'
import { ListBranch, listPath, type ListNode } from './record-list-branch'
import { ListHistoryBridge, listWritable, type ListHistories } from './record-list-editors'
import { listConfigurationError, listParent, listRecordKey, useListExpansion, useListRows, useListSchemas } from './record-list-data'
import { ListSettings } from './record-list-settings'
import './record-list.css'

export { ListSettings } from './record-list-settings'

/** A policy-projected outline. Every mutation remains an ordinary record command. */
export function RecordList({ schema, levels, onLevelsChange, viewKey }: { schema: EntitySchema; levels: ListLevel[]; onLevelsChange?(levels: ListLevel[]): void; viewKey?: string }) {
  const tables = useListSchemas(schema)
  const configurationError = tables.schemas ? listConfigurationError(schema, levels, tables.schemas) : undefined
  const records = useListRows(schema.appId, levels, !!tables.schemas && !configurationError)
  const expansion = useListExpansion(schema.appId, viewKey ?? schema.id)
  const histories: ListHistories = useRef(new Map())
  const dragging = useRef<ListNode | null>(null)
  const [editing, setEditing] = useState<{ path: string; fieldId: string } | null>(null)
  const [creating, setCreating] = useState<string | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [activeTable, setActiveTable] = useState(schema.id)
  const writeBusy = useRef(false)
  const data = records.rows ?? []
  const byId = (entityId: string) => tables.schemas!.find(table => table.id === entityId)!
  const childRows = (parent: ListNode): RecordRow[] => {
    const next = levels[parent.level + 1]
    if (!next || parent.level >= 4) return []
    return (data[parent.level + 1] ?? []).filter(row => {
      const ref = listParent(row, next.parentFieldId)
      return ref && listRecordKey(ref) === listRecordKey(parent.row.ref) && !parent.path.includes(listRecordKey(row.ref))
    })
  }
  const children = (parent: ListNode): ListNode[] => childRows(parent).map(row => ({ row, level: parent.level + 1, path: [...parent.path, listRecordKey(row.ref)], parent }))

  // Include rows from every configured occurrence of a table when checking moves.
  // The ordinary record command rechecks current authority before the link write.
  function descendantKeys(source: ListNode) {
    const found = new Map<string, number>(), sourceKey = listRecordKey(source.row.ref)
    function walk(row: RecordRow, entityId: string, depth: number, path: Set<string>) {
      const key = listRecordKey(row.ref)
      if (path.has(key)) return
      found.set(key, Math.max(found.get(key) ?? 0, depth))
      if (depth > 5) return
      const nextPath = new Set([...path, key])
      for (const [index, level] of levels.entries()) {
        const parentId = levels[index - 1]?.entityId ?? schema.id
        if (!level.parentFieldId || parentId !== entityId) continue
        for (const child of data[index] ?? []) {
          const parent = listParent(child, level.parentFieldId)
          if (parent && listRecordKey(parent) === key) walk(child, level.entityId, depth + 1, nextPath)
        }
      }
    }
    walk(source.row, source.row.ref.entityId, 1, new Set())
    found.delete(sourceKey)
    return found
  }
  function canMove(source: ListNode, parent?: ListNode) {
    if (busy || !tables.schemas || !records.rows) return false
    const sourceLevel = levels[source.level], targetIndex = parent ? parent.level + 1 : 0, target = levels[targetIndex]
    if (!sourceLevel?.parentFieldId || !target || target.entityId !== sourceLevel.entityId || target.parentFieldId !== sourceLevel.parentFieldId) return false
    const field = byId(sourceLevel.entityId).fields.find(item => item.id === sourceLevel.parentFieldId)
    if (!field || !listWritable(source.row, field) || !parent && field.required) return false
    const sourceKey = listRecordKey(source.row.ref), oldParent = listParent(source.row, sourceLevel.parentFieldId)
    if (parent ? parent.path.includes(sourceKey) || oldParent && listRecordKey(oldParent) === listRecordKey(parent.row.ref) : oldParent === null) return false
    const descendants = descendantKeys(source)
    if (parent && descendants.has(listRecordKey(parent.row.ref))) return false
    const height = Math.max(1, ...descendants.values())
    if (targetIndex + height > 5 || targetIndex + height > levels.length) return false
    return !parent || field.relation?.entityId === parent.row.ref.entityId && field.relation.ownerAppId === parent.row.ref.appId
  }
  async function patch(node: ListNode, fieldId: string, value: CellValue) {
    const history = histories.current.get(node.row.ref.entityId)
    if (writeBusy.current || !history || history.busy) return false
    const field = byId(node.row.ref.entityId).fields.find(item => item.id === fieldId)
    if (!field || !listWritable(node.row, field)) return false
    writeBusy.current = true; setBusy(true); setError(''); setActiveTable(node.row.ref.entityId)
    try { history.clearFeedback(); return await history.execute([{ recordId: node.row.id, changes: { [fieldId]: value } }], [node.row]) }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'The record could not be changed.'); return false }
    finally { writeBusy.current = false; setBusy(false) }
  }
  async function move(source: ListNode, parent?: ListNode) {
    if (!canMove(source, parent)) { setError('Choose a parent that keeps this outline within five levels without a cycle.'); return }
    if (await patch(source, levels[source.level]!.parentFieldId!, parent?.row.ref ?? null)) {
      setEditing(null)
      if (parent) expansion.expand(listPath(parent))
    }
  }
  const rootVersions = new Set(records.roots?.map(row => `${row.id}:${row.version}`))
  const rootRows = (data[0] ?? []).filter(row => !levels[0]?.parentFieldId || rootVersions.has(`${row.id}:${row.version}`))
  const roots: ListNode[] = rootRows.map(row => ({ row, level: 0, path: [listRecordKey(row.ref)] }))
  const errorMessage = tables.error ?? configurationError ?? records.error
  const uniqueSchemas = tables.schemas?.filter(table => levels.some(level => level.entityId === table.id)) ?? []
  return <div className="cr-record-list" onKeyDown={event => {
    if (!event.defaultPrevented && !event.altKey && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !(event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable="true"]'))) {
      event.preventDefault(); const history = histories.current.get(activeTable); if (history) event.shiftKey ? history.redo() : history.undo()
    }
  }}>
    {onLevelsChange && <ListSettings schema={schema} levels={levels} onChange={onLevelsChange} />}
    {uniqueSchemas.map(table => <GridHistoryProvider key={`${table.id}:${table.version}`} schema={table}><ListHistoryBridge schema={table} histories={histories} /></GridHistoryProvider>)}
    {expansion.error && <p role="alert">{expansion.error} <button type="button" className="cr-button cr-button--quiet" onClick={expansion.reset}>Reset expanded branches</button></p>}
    {error && <p role="alert">{error}</p>}
    {errorMessage ? <p role="alert">{errorMessage} <button type="button" className="cr-button" onClick={() => { tables.refresh(); records.refresh() }}>Refresh list</button></p> : !records.rows ? <p role="status">Reading list records…</p> : <>
      <div className="cr-list-root" onDragOver={event => { const source = dragging.current; if (source && canMove(source)) { event.preventDefault(); event.dataTransfer.dropEffect = 'move' } }} onDrop={event => {
        const source = dragging.current
        if (!source || !canMove(source)) return
        event.preventDefault(); dragging.current = null
        if (event.dataTransfer.getData('application/x-cradle-list-record') === listRecordKey(source.row.ref)) void move(source)
      }}>
        <ListBranch schemas={tables.schemas!} levels={levels} nodes={roots} level={0} expanded={expansion.paths} toggle={expansion.toggle} children={children} editing={editing} edit={setEditing} creating={creating} create={setCreating} savedChild={node => { setCreating(null); expansion.expand(listPath(node)) }} patch={patch} move={move} canMove={canMove} dragging={dragging} busy={busy} focus={setActiveTable} />
      </div>
    </>}
  </div>
}
