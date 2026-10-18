import { lookupElementType } from '../../../domains/records/lookup-types'
import type { Expr, Field } from '../../../domains/records/contracts'
import type { SchemaDraft } from '../../../domains/records/manual/contracts'
import { expressionType, calculationKind } from '../../../domains/records/calculation-schema'
import { FilterEditor } from '../filter-editor'
import { FormulaEditor } from './formula-editor'
import { LookupControls } from './lookup-controls'
export type CalculationKind='formula'|'lookup'|'rollup'|'count'
export {calculationKind} from '../../../domains/records/calculation-schema'
const aggregates=[['sum','SUM'],['average','AVERAGE'],['min','MIN'],['max','MAX'],['count','COUNT'],['counta','COUNTA'],['countall','COUNTALL'],['arrayjoin','ARRAYJOIN'],['arrayunique','ARRAYUNIQUE'],['and','AND'],['or','OR']] as const
const scalarTypes=['text','url','number','date','instant','money','boolean','select','person'] as const
export function ComputedEditor({field,table,draft,onChange}:{field:Field;table:SchemaDraft['tables'][number];draft:SchemaDraft;onChange:(field:Field,source?:string)=>void}){
 const kind=calculationKind(field)
 if(kind==='formula')return <FormulaEditor field={field} table={table} draft={draft} onChange={onChange} />
 const expression=field.expression as Extract<Expr,{kind:'rollup'}>,relation=table.fields.find(f=>f.id===expression.relationFieldId),target=draft.tables.find(t=>t.id===relation?.relation?.entityId),source=target?.fields.find(f=>f.id===expression.valueFieldId)
 let issue='';if(source)try{expressionType(expression,table,draft.tables)}catch(error){issue=(error as Error).message}
 function update(next:typeof expression){
  const link=table.fields.find(f=>f.id===next.relationFieldId),nextTarget=draft.tables.find(t=>t.id===link?.relation?.entityId),value=nextTarget?.fields.find(f=>f.id===next.valueFieldId)
  let resultType:Field['resultType'];try{const type=expressionType(next,table,draft.tables);resultType=type==='blank'?'text':type}catch{resultType=undefined}
  const resultElementType=next.aggregate==='lookup'&&resultType==='array'&&value?lookupElementType(value):undefined
  onChange({...field,readOnly:true,expression:next,resultType,resultElementType,options:next.aggregate==='lookup'?value?.options:undefined})
 }
 function changeLink(id:string){
  const link=table.fields.find(f=>f.id===id),nextTarget=draft.tables.find(t=>t.id===link?.relation?.entityId),targetChanged=nextTarget?.id!==target?.id
  update({...expression,relationFieldId:id,valueFieldId:kind==='count'?nextTarget?.fields[0]?.id??'':targetChanged?'':expression.valueFieldId,filter:targetChanged?undefined:expression.filter,sort:targetChanged?undefined:expression.sort})
 }
 const links=table.fields.filter(f=>f.type==='relation')
 return <>
  <label className="cr-field">{kind==='lookup'?'Lookup link':'Linked records'}<select aria-label={kind==='lookup'?'Lookup link':'Linked records'} value={expression.relationFieldId} required onChange={e=>changeLink(e.target.value)}><option value="">Choose link</option>{links.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
  {kind!=='count'&&<label className="cr-field">{kind==='lookup'?'Lookup source field':'Aggregate field'}<select aria-label={kind==='lookup'?'Lookup source field':'Aggregate field'} value={expression.valueFieldId} required onChange={e=>update({...expression,valueFieldId:e.target.value})}><option value="">Choose source field</option>{target?.fields.filter(f=>kind==='lookup'?!!lookupElementType(f):scalarTypes.some(type=>type===(f.type==='computed'?f.resultType:f.type))).map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</select></label>}
  {kind==='rollup'&&<label className="cr-field">Aggregate<select aria-label="Aggregate" value={expression.aggregate} onChange={e=>update({...expression,aggregate:e.target.value as typeof expression.aggregate})}>{aggregates.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>}
  {expression.aggregate==='arrayjoin'&&<label className="cr-field">Separator<input aria-label="Separator" value={expression.separator??','} maxLength={200} onChange={e=>update({...expression,separator:e.target.value})} /></label>}
  {target&&<><label className="cr-choice"><input type="checkbox" checked={!!expression.filter} onChange={e=>update({...expression,filter:e.target.checked?{kind:'all',conditions:[]}:undefined})} />Only linked records matching conditions</label>{expression.filter&&<FilterEditor schema={{appId:draft.appId,id:target.id,fields:target.fields.filter(f=>scalarTypes.some(type=>type===f.type))}} filter={expression.filter} onChange={filter=>update({...expression,filter})} />}</>}
  {kind==='lookup'&&target&&<LookupControls expression={expression} fields={target.fields} onChange={update} />}
  {issue&&<p className="cr-error" role="alert">{field.label}: {issue}</p>}
  <p className="cr-muted">{kind==='count'?'Counts linked records you can read.':source?`Result type: ${field.resultType??'unavailable'}${field.resultElementType?` of ${field.resultElementType}`:''}.`:'Choose a source field.'} Recomputed from current linked records on each read.</p>
 </>
}
