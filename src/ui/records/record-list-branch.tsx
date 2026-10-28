import { Fragment, type MutableRefObject } from 'react'
import type { EntitySchema, ListLevel, RecordRow } from '../../domains/records/contracts'
import { Tooltip } from '../shared/tooltip'
import { CellDisplay } from './record-fields'
import { recordLabel } from './record-label'
import { ListCellEditor, ListChildEditor, listWritable } from './record-list-editors'
import { listRecordKey } from './record-list-data'

export type ListNode = { row: RecordRow; level: number; path: string[]; parent?: ListNode }
export const listPath = (node: ListNode) => node.path.join('/')
export type ListBranchProps = {
  schemas: EntitySchema[]; levels: ListLevel[]; nodes: ListNode[]; level: number
  expanded: string[]; toggle(path: string): void; children(node: ListNode): ListNode[]
  editing: { path: string; fieldId: string } | null; edit(value: { path: string; fieldId: string } | null): void
  creating: string | null; create(path: string | null): void; savedChild(node: ListNode): void
  patch(node: ListNode, fieldId: string, value: Parameters<typeof ListCellEditor>[0]['onSave'] extends (value: infer V) => unknown ? V : never): Promise<boolean>
  move(node: ListNode, parent?: ListNode): Promise<void>; canMove(node: ListNode, parent?: ListNode): boolean
  dragging: MutableRefObject<ListNode | null>; busy: boolean; focus(entityId: string): void
}

export function ListBranch(props: ListBranchProps) {
  const { levels, schemas, nodes, level } = props
  const configuration = levels[level]!, schema = schemas.find(item => item.id === configuration.entityId)!
  const fields = configuration.fields.flatMap(id => schema.fields.find(field => field.id === id) ?? [])
  return <section className="cr-list-branch" aria-label={`${schema.label}, level ${level + 1}`}>
    <div className="cr-list-branch__heading">{schema.label}<span className="cr-muted">Level {level + 1} · {nodes.length} {nodes.length === 1 ? 'record' : 'records'}</span></div>
    {!nodes.length ? <p className="cr-list-empty">No matching records</p> : <div className="cr-list-scroll"><table className="cr-list-table"><thead><tr><th scope="col">Outline</th>{fields.map(field => <th scope="col" key={field.id}>{field.label}</th>)}<th scope="col">Actions</th></tr></thead><tbody>
      {nodes.map((node, index) => {
        const { row } = node, path = listPath(node), label = recordLabel(row, schema)
        const next = levels[level + 1], childSchema = next && schemas.find(item => item.id === next.entityId)
        const parentField = childSchema?.fields.find(field => field.id === next?.parentFieldId)
        const expanded = props.expanded.includes(path), children = props.children(node)
        const previous = nodes[index - 1]
        const movable = !!configuration.parentFieldId && !!schema.fields.find(field => field.id === configuration.parentFieldId && listWritable(row, field))
        return <Fragment key={path}><tr data-list-record-id={row.id} data-list-level={level} data-record-key={listRecordKey(row.ref)} onFocus={() => props.focus(schema.id)} draggable={movable && !props.busy}
          onDragStart={event => { if (event.target instanceof HTMLElement && event.target.closest('button,a,input,select,textarea,form')) { event.preventDefault(); return }; props.dragging.current = node; event.dataTransfer.setData('application/x-cradle-list-record', listRecordKey(row.ref)); event.dataTransfer.effectAllowed = 'move' }}
          onDragEnd={() => { props.dragging.current = null }}
          onDragOver={event => { const source = props.dragging.current; if (source && props.canMove(source, node)) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move' } }}
          onDrop={event => { const source = props.dragging.current; if (!source || !props.canMove(source, node)) return; event.preventDefault(); event.stopPropagation(); props.dragging.current = null; if (event.dataTransfer.getData('application/x-cradle-list-record') === listRecordKey(source.row.ref)) void props.move(source, node) }}>
          <td className="cr-list-outline"><div className="cr-list-outline__controls">{next ? <Tooltip label={`${expanded ? 'Collapse' : 'Expand'} ${label}`}><button type="button" className="cr-list-icon" aria-expanded={expanded} onClick={() => props.toggle(path)}>{expanded ? '▾' : '▸'}</button></Tooltip> : <span className="cr-list-icon-space" />}{expanded && next && <span className="cr-muted" aria-label={`${children.length} matching children`}>{children.length}</span>}<Tooltip label={`Open ${label}`}><a className="cr-list-icon" href={`/app/records/${schema.appId}/${schema.id}/${row.id}`}>↗</a></Tooltip></div></td>
          {fields.map(field => <td key={field.id} data-list-field-id={field.id} className="cr-list-cell">{props.editing?.path === path && props.editing.fieldId === field.id ? <ListCellEditor schema={schema} row={row} field={field} onSave={value => props.patch(node, field.id, value)} onCancel={() => props.edit(null)} /> : <div className="cr-list-cell__value"><CellDisplay appId={schema.appId} field={field} cell={row.fields[field.id]} record={{ ...row.ref, fieldId: field.id }} />{listWritable(row, field) && <Tooltip label={`Edit ${field.label}`}><button type="button" className="cr-list-icon" disabled={props.busy} onClick={() => props.edit({ path, fieldId: field.id })}>✎</button></Tooltip>}</div>}</td>)}
          <td><div className="cr-list-actions">{parentField && !parentField.readOnly && <Tooltip label="Add child"><button type="button" className="cr-list-icon" disabled={props.busy} onClick={() => props.create(props.creating === path ? null : path)}>+</button></Tooltip>}{movable && <><Tooltip label={`Indent ${label}`}><button type="button" className="cr-list-icon" disabled={props.busy || !previous || !props.canMove(node, previous)} onClick={() => previous && void props.move(node, previous)}>→</button></Tooltip><Tooltip label={`Outdent ${label}`}><button type="button" className="cr-list-icon" disabled={props.busy || !node.parent || !props.canMove(node, node.parent.parent)} onClick={() => void props.move(node, node.parent?.parent)}>←</button></Tooltip></>}</div></td>
        </tr>
        {props.creating === path && childSchema && parentField && <tr className="cr-list-child-form"><td colSpan={fields.length + 2}><ListChildEditor schema={childSchema} parent={row} parentField={parentField} onSaved={() => props.savedChild(node)} onCancel={() => props.create(null)} /></td></tr>}
        {expanded && next && <tr className="cr-list-children"><td colSpan={fields.length + 2}><ListBranch {...props} nodes={children} level={level + 1} /></td></tr>}
        </Fragment>
      })}
    </tbody></table></div>}
  </section>
}
