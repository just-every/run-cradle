import type { Field } from '../../../domains/records/contracts'
import type { SchemaDraft } from '../../../domains/records/manual/contracts'
import { FieldValidationEditor } from './field-validation'
import { manualFieldTypes } from './field-type-label'
import { createUlid } from '../../../core/shared/ids'
import { calculationKind, ComputedEditor } from './computed-editor'
import { LinkPickerSettings, type PickerViews } from './link-picker-settings'
export function SchemaFieldEditor({field,table,draft,existing,original,savedViews,onChange,onRemove}:{field:Field;table:SchemaDraft['tables'][number];draft:SchemaDraft;existing:boolean;original?:Field;savedViews?:PickerViews;onChange:(field:Field,source?:string)=>void;onRemove:()=>void}){
 const configureKind=!existing||!!original&&original.type!==field.type
 const type=field.type==='computed'?calculationKind(field)==='lookup'?'computed':calculationKind(field):field.type
 function setType(value:string){
  const originalType=original?.type==='computed'?calculationKind(original)==='lookup'?'computed':calculationKind(original):original?.type
  if(original&&value===originalType){onChange({...original,label:field.label,help:field.help});return}
  const calculation=['computed','formula','rollup','count'].includes(value)
  const next:Field={id:field.id,label:field.label,help:field.help,type:calculation?'computed':value as Field['type'],required:!calculation&&field.required,unique:!calculation&&!['multi_select','attachment'].includes(value)&&field.unique,...(calculation?{readOnly:true,resultType:value==='rollup'||value==='count'?'number':'text'}:{}),...(['select','multi_select'].includes(value)?{options:[{id:createUlid(),label:'Option 1'}]}:{})}
  if(calculation&&value!=='formula')next.expression={kind:'rollup',relationFieldId:'',valueFieldId:'',aggregate:value==='computed'?'lookup':value==='count'?'countall':'sum'}
  onChange(next,value==='formula'?'':undefined)
 }
 return <fieldset className="cr-field-tile"><legend className="cr-sr-only">{field.label||'New field'}</legend>
  <div className="cr-field-row"><label className="cr-field">Field name<input value={field.label} onChange={e=>onChange({...field,label:e.target.value})} required /></label><label className="cr-field">Field type<select aria-label="Field type" value={type} onChange={e=>setType(e.target.value)}>{manualFieldTypes.map(([value,label])=><option value={value} key={value}>{label}</option>)}{original?.type==='attachment'&&<option value="attachment">Attachment</option>}<option value="formula">Formula</option><option value="rollup">Rollup</option><option value="count">Count linked records</option></select></label>{field.type!=='computed'&&<label className="cr-choice"><input type="checkbox" checked={field.required} onChange={e=>onChange({...field,required:e.target.checked})} />Required</label>}<button type="button" className="cr-button cr-button--quiet" onClick={onRemove}>Remove field</button></div>
  {['select','multi_select'].includes(field.type)&&<label className="cr-field">Options (one per line)<textarea aria-label="Options (one per line)" disabled={!configureKind} value={field.options?.map(o=>o.label).join('\n')??''} onChange={e=>onChange({...field,options:e.target.value.split('\n').map((label,i)=>({id:field.options?.[i]?.id??createUlid(),label}))})} /></label>}
  {['select','multi_select'].includes(field.type)&&!configureKind&&original?.options&&<label className="cr-field">Add options (one per line)<textarea aria-label="Add options (one per line)" value={field.options?.slice(original.options.length).map(option=>option.label).join('\n')??''} onChange={event=>onChange({...field,options:[...original.options!,...(event.target.value?event.target.value.split('\n').map((label,index)=>({id:field.options?.[original.options!.length+index]?.id??createUlid(),label})):[])]})} /></label>}
  <label className="cr-field">Help text<textarea aria-label="Help text" maxLength={2000} value={field.help??''} onChange={event=>onChange({...field,help:event.target.value})} /></label>
  {!['computed','multi_select','attachment'].includes(field.type)&&!(field.type==='relation'&&field.relation?.cardinality==='many')&&<label className="cr-choice"><input type="checkbox" checked={field.unique} onChange={e=>onChange({...field,unique:e.target.checked})} />Unique value</label>}
  {field.type==='number'&&<label className="cr-field">Show as<select aria-label="Show as" value={field.numberFormat??'number'} onChange={e=>onChange({...field,numberFormat:e.target.value==='percent'?'percent':undefined})}><option value="number">Number</option><option value="percent">Percentage</option></select></label>}
  {field.type==='rating'&&<label className="cr-field">Rating maximum<input aria-label="Rating maximum" type="number" min="1" max="10" step="1" value={field.validation?.max??'5'} onChange={e=>onChange({...field,validation:{...field.validation,max:e.target.value}})} /></label>}
  <FieldValidationEditor field={field} appId={draft.appId} entityId={table.id} onChange={onChange} />
  {field.type==='relation'&&<div className="cr-field-extra"><label className="cr-field">Linked table<select aria-label="Linked table" disabled={!configureKind} required value={field.relation?.entityId??''} onChange={e=>onChange({...field,linkPicker:undefined,relation:{ownerAppId:draft.appId,entityId:e.target.value,cardinality:field.relation?.cardinality??'one',onDelete:'restrict'}})}><option value="">Choose table</option>{draft.tables.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label><label className="cr-field">Link cardinality<select aria-label="Link cardinality" disabled={!configureKind||!field.relation} value={field.relation?.cardinality??'one'} onChange={e=>onChange({...field,relation:{...field.relation!,cardinality:e.target.value as 'one'|'many'}})}><option value="one">One record</option><option value="many">Multiple records</option></select></label></div>}
  {field.type==='relation'&&<LinkPickerSettings field={field} target={draft.tables.find(target=>target.id===field.relation?.entityId)} savedViews={savedViews} onChange={onChange} />}
  {field.type==='computed'&&<div className="cr-field-extra"><ComputedEditor field={field} table={table} draft={draft} onChange={onChange} /></div>}
 </fieldset>
}
