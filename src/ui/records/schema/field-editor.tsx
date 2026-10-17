import type { Field } from '../../../domains/records/contracts'
import type { SchemaDraft } from '../../../domains/records/manual/contracts'
import { FieldValidationEditor } from './field-validation'
import { manualFieldTypes } from './field-type-label'
import { createUlid } from '../../../core/shared/ids'
import { calculationKind, ComputedEditor } from './computed-editor'
export function SchemaFieldEditor({field,table,draft,existing,onChange,onRemove}:{field:Field;table:SchemaDraft['tables'][number];draft:SchemaDraft;existing:boolean;onChange:(field:Field,source?:string)=>void;onRemove:()=>void}){
 const type=field.type==='computed'?calculationKind(field)==='lookup'?'computed':calculationKind(field):field.type
 function setType(value:string){
  const calculation=['computed','formula','rollup','count'].includes(value)
  const next:Field={id:field.id,label:field.label,type:calculation?'computed':value as Field['type'],required:false,unique:false,...(calculation?{readOnly:true,resultType:value==='rollup'||value==='count'?'number':'text'}:{}),...(['select','multi_select'].includes(value)?{options:[{id:createUlid(),label:'Option 1'}]}:{})}
  if(calculation&&value!=='formula')next.expression={kind:'rollup',relationFieldId:'',valueFieldId:'',aggregate:value==='computed'?'lookup':value==='count'?'countall':'sum'}
  onChange(next,value==='formula'?'':undefined)
 }
 return <fieldset className="cr-field-tile"><legend className="cr-sr-only">{field.label||'New field'}</legend>
  <div className="cr-field-row"><label className="cr-field">Field name<input value={field.label} onChange={e=>onChange({...field,label:e.target.value})} required /></label><label className="cr-field">Field type<select aria-label="Field type" disabled={existing&&field.type!=='computed'} value={type} onChange={e=>setType(e.target.value)}>{manualFieldTypes.map(([value,label])=><option value={value} key={value} disabled={existing&&field.type==='computed'&&value!=='computed'}>{label}</option>)}<option value="formula">Formula</option><option value="rollup">Rollup</option><option value="count">Count linked records</option></select></label>{field.type!=='computed'&&<label className="cr-choice"><input type="checkbox" checked={field.required} onChange={e=>onChange({...field,required:e.target.checked})} />Required</label>}<button type="button" className="cr-button cr-button--quiet" onClick={onRemove}>Remove field</button></div>
  {['select','multi_select'].includes(field.type)&&<label className="cr-field">Options (one per line)<textarea aria-label="Options (one per line)" disabled={existing} value={field.options?.map(o=>o.label).join('\n')??''} onChange={e=>onChange({...field,options:e.target.value.split('\n').map((label,i)=>({id:field.options?.[i]?.id??createUlid(),label}))})} /></label>}
  {!['computed','multi_select','attachment'].includes(field.type)&&!(field.type==='relation'&&field.relation?.cardinality==='many')&&<label className="cr-choice"><input type="checkbox" checked={field.unique} onChange={e=>onChange({...field,unique:e.target.checked})} />Unique value</label>}
  <FieldValidationEditor field={field} appId={draft.appId} onChange={onChange} />
  {field.type==='relation'&&<div className="cr-field-extra"><label className="cr-field">Linked table<select aria-label="Linked table" disabled={existing} required value={field.relation?.entityId??''} onChange={e=>onChange({...field,relation:{ownerAppId:draft.appId,entityId:e.target.value,cardinality:field.relation?.cardinality??'one',onDelete:'restrict'}})}><option value="">Choose table</option>{draft.tables.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label><label className="cr-field">Link cardinality<select aria-label="Link cardinality" disabled={existing||!field.relation} value={field.relation?.cardinality??'one'} onChange={e=>onChange({...field,relation:{...field.relation!,cardinality:e.target.value as 'one'|'many'}})}><option value="one">One record</option><option value="many">Multiple records</option></select></label></div>}
  {field.type==='computed'&&<div className="cr-field-extra"><ComputedEditor field={field} table={table} draft={draft} onChange={onChange} /></div>}
 </fieldset>
}
