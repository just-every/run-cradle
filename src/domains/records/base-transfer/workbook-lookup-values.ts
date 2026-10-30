import type {Field} from '../contracts'
import type {ImportIdentities,PlannedRecord} from './contracts'
import type {RelationPlan} from './links'

/** Arithmetic reads proven native lookup inputs from their target rows, never from formula caches. */
export function numericLookupValues(ids:ImportIdentities,fields:Map<string,Field[]>,records:PlannedRecord[],relations:RelationPlan[]):Map<string,Map<string,string>>{
 const values=new Map<string,Map<string,string>>(),rows=new Map(records.map(r=>[JSON.stringify([r.tableKey,r.rowKey]),r]))
 for(const [tableKey,tableFields]of fields)for(const field of tableFields){
  const expression=field.expression
  if(field.type!=='computed'||field.resultType!=='number'||expression?.kind!=='rollup'||expression.aggregate!=='lookup')continue
  const relation=relations.find(r=>r.table.key===tableKey&&ids.tables[tableKey].fields[r.column.key]===expression.relationFieldId&&!r.inverseOf&&r.cardinality==='one')
  if(!relation?.targetTableKey)continue
  const byRow=new Map<string,string>()
  for(const cell of relation.cells){
   const ref=cell.references[0]
   if(cell.error||cell.references.length!==1||!ref.materializable||!ref.targetRowKey)continue
   const value=rows.get(JSON.stringify([relation.targetTableKey,ref.targetRowKey]))?.fields[expression.valueFieldId]
   if(typeof value==='string')byRow.set(cell.rowKey,value)
  }
  values.set(JSON.stringify([tableKey,field.id]),byRow)
 }
 return values
}
