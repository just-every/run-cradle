import type { Expr, Field } from '../../../domains/records/contracts'
import type { SchemaDraft } from '../../../domains/records/manual/contracts'
import { expressionType, calculationKind } from '../../../domains/records/calculation-schema'
import { FilterEditor } from '../filter-editor'
import { FormulaEditor } from './formula-editor'
export type CalculationKind='formula'|'lookup'|'rollup'|'count'
export {calculationKind} from '../../../domains/records/calculation-schema'
const aggregates=[['sum','SUM'],['average','AVERAGE'],['min','MIN'],['max','MAX'],['count','COUNT'],['counta','COUNTA'],['countall','COUNTALL'],['arrayjoin','ARRAYJOIN'],['arrayunique','ARRAYUNIQUE'],['and','AND'],['or','OR']] as const
export function ComputedEditor({field,table,draft,onChange}:{field:Field;table:SchemaDraft['tables'][number];draft:SchemaDraft;onChange:(field:Field,source?:string)=>void}){
 const kind=calculationKind(field)
 if(kind==='formula')return <FormulaEditor field={field} table={table} draft={draft} onChange={onChange} />
 const expression=field.expression as Extract<Expr,{kind:'rollup'}>,relation=table.fields.find(f=>f.id===expression.relationFieldId),target=draft.tables.find(t=>t.id===relation?.relation?.entityId),source=target?.fields.find(f=>f.id===expression.valueFieldId)
 function update(next:typeof expression){let resultType=field.resultType??'text';try{const type=expressionType(next,table,draft.tables);resultType=type==='blank'?'text':type}catch{}const value=target?.fields.find(f=>f.id===next.valueFieldId);onChange({...field,readOnly:true,expression:next,resultType,options:next.aggregate==='lookup'?value?.options:undefined})}
 const links=table.fields.filter(f=>f.type==='relation'&&(kind!=='lookup'||f.relation?.cardinality==='one'))
 return <>
  <label className="cr-field">{kind==='lookup'?'Lookup link':'Linked records'}<select aria-label={kind==='lookup'?'Lookup link':'Linked records'} value={expression.relationFieldId} required onChange={e=>{const link=table.fields.find(f=>f.id===e.target.value),next=draft.tables.find(t=>t.id===link?.relation?.entityId);update({...expression,relationFieldId:e.target.value,valueFieldId:kind==='count'?next?.fields[0]?.id??'':'',filter:undefined})}}><option value="">Choose link</option>{links.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
  {kind!=='count'&&<label className="cr-field">{kind==='lookup'?'Lookup source field':'Aggregate field'}<select aria-label={kind==='lookup'?'Lookup source field':'Aggregate field'} value={expression.valueFieldId} required onChange={e=>update({...expression,valueFieldId:e.target.value})}><option value="">Choose source field</option>{target?.fields.filter(f=>!['relation','attachment','multi_select'].includes(f.type)&&f.resultType!=='array').map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</select></label>}
  {kind==='rollup'&&<label className="cr-field">Aggregate<select aria-label="Aggregate" value={expression.aggregate} onChange={e=>update({...expression,aggregate:e.target.value as typeof expression.aggregate})}>{aggregates.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>}
  {expression.aggregate==='arrayjoin'&&<label className="cr-field">Separator<input aria-label="Separator" value={expression.separator??','} maxLength={200} onChange={e=>update({...expression,separator:e.target.value})} /></label>}
  {target&&<><label className="cr-choice"><input type="checkbox" checked={!!expression.filter} onChange={e=>update({...expression,filter:e.target.checked?{kind:'all',conditions:[]}:undefined})} />Only linked records matching conditions</label>{expression.filter&&<FilterEditor schema={{appId:draft.appId,fields:target.fields.filter(f=>!['computed','relation','attachment','multi_select'].includes(f.type))}} filter={expression.filter} onChange={filter=>update({...expression,filter})} />}</>}
  <p className="cr-muted">{kind==='count'?'Counts linked records you can read.':source?`Result type: ${field.resultType}.`:'Choose a source field.'} Recomputed from current linked records on each read.</p>
 </>
}
