import { useOptionalGridHistory, type HistoryResult } from './grid-history'
import { RecordConflict } from './record-conflict'
import { useEffect, useRef, useState } from 'react'
import type { CellValue } from '../../contracts/primitives'
import { RECORD_SCHEMA_ENTITY_ID, type EntitySchema, type Field, type RecordRow } from '../../domains/records/contracts'
import { useCommand } from '../shared/api'
import { CommandFeedback } from '../shared/presentation'
import { FieldInput } from './record-fields'

function equalValue(left:unknown,right:unknown):boolean {
  if(Object.is(left,right))return true
  if(left===null||right===null||typeof left!=='object'||typeof right!=='object')return false
  if(Array.isArray(left)||Array.isArray(right))return Array.isArray(left)&&Array.isArray(right)&&left.length===right.length&&left.every((value,index)=>equalValue(value,right[index]))
  const a=left as Record<string,unknown>,b=right as Record<string,unknown>,keys=Object.keys(a)
  return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&equalValue(a[key],b[key]))
}
/** Compare against the version explicitly accepted by the editor, including a
 * reviewed concurrent version. Unchanged relations must not be rewritten. */
export function recordEditorChanges(record:RecordRow,values:Record<string,CellValue>):Record<string,CellValue> {
  return Object.fromEntries(Object.entries(values).filter(([id,value])=>{const cell=record.fields[id];return !equalValue(cell?.state==='value'?cell.value:null,value)}))
}

export function RecordEditor({ schema, record, onSaved, onCancel }: { schema: EntitySchema; record?: RecordRow; onSaved: () => void; onCancel: () => void }) {
  const [baseRecord, setBaseRecord] = useState(record)
  const [values, setValues] = useState<Record<string, CellValue>>(() => Object.fromEntries(schema.fields.filter(field => field.type !== 'computed' && !field.readOnly).map(field => { const cell = record?.fields[field.id]; return [field.id, cell?.state === 'value' ? cell.value : !record && field.defaultValue !== undefined ? field.defaultValue : !record && field.type === 'boolean' ? false : null] })))
  const history=useOptionalGridHistory(),inverse=useRef<HistoryResult['inverse']>([])
  const command = useCommand<RecordRow>(`record:${schema.appId}:${schema.id}:${record?.id ?? 'new'}`)
  useEffect(() => { if (command.result.state === 'committed') {if(record&&inverse.current.length)history?.accept({rows:[command.result.value],inverse:inverse.current});onSaved()} }, [command.result.state])
  const conflict = command.result.state === 'failed' && command.result.error.detail.code === 'version_conflict'
  const errors = command.result.state === 'failed' ? command.result.error.detail.issues : undefined
  const editable = schema.fields.filter(field => field.type !== 'computed' && !field.readOnly)
  const input = (field: Field) => <FieldInput appId={schema.appId} entityId={schema.id} subject={record?.ref} key={field.id} field={field} value={values[field.id] ?? null} onChange={value => setValues(current => ({ ...current, [field.id]: value }))} error={errors?.find(issue => issue.fieldId === field.id)?.message} />
  const relations = editable.filter(field => field.type === 'relation'), scalars = editable.filter(field => field.type !== 'relation')
  return <form className="cr-form cr-record-editor" onSubmit={event => { event.preventDefault(); if(baseRecord){const changes=recordEditorChanges(baseRecord,values);inverse.current=Object.keys(changes).length&&Object.entries(changes).every(([id])=>baseRecord.fields[id]?.state==='value')?[{recordId:baseRecord.id,changes:Object.fromEntries(Object.keys(changes).map(id=>[id,baseRecord.fields[id]!.state==='value'?baseRecord.fields[id]!.value:null]))}]:[]}void command.submit(`/api/v1/commands/record.${record ? 'patch' : 'create'}`, record ? { ref: record.ref, changes: recordEditorChanges(baseRecord!,values) } : { appId: schema.appId, entityId: schema.id, values }, record ? [{ ref: record.ref, version: baseRecord!.version }] : [{ ref: { appId: schema.appId, entityId: RECORD_SCHEMA_ENTITY_ID,recordId:schema.id },version:schema.version }]) }}><h2>{record ? 'Edit record' : 'New record'}</h2><p className="cr-muted">{record ? `Editing version ${baseRecord!.version}. Changes are checked against the current record.` : 'Fill in the fields, then save your record.'}</p><div className={`cr-record-editor-grid${relations.length ? '' : ' cr-record-editor-grid--flow'}`}><div className="cr-record-editor-column">{scalars.map(input)}</div>{relations.length > 0 && <div className="cr-record-editor-column">{relations.map(input)}</div>}</div><CommandFeedback {...command} />{conflict && baseRecord && <RecordConflict schema={schema} original={baseRecord} proposed={values} onReviewed={current => { setBaseRecord(current); command.reset() }} />}<div className="cr-actions cr-actions--end cr-form-actions"><button className="cr-button" disabled={!!record && !!history?.busy || conflict || (command.result.state !== 'idle' && command.result.state !== 'failed')}>Save record</button><button className="cr-button cr-button--quiet" type="button" onClick={onCancel}>Close</button></div></form>
}
