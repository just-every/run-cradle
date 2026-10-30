import type { PreparedSource,ImportOptions,ImportIdentities,PlannedRecord,SourceTable,SourceColumn,ImportDiagnostic,LookupCandidate } from './contracts'
import type { Field } from '../contracts'
import type { RelationPlan } from './links'
import { canonical,rawText } from './format'
import { exactApiNumber } from './numeric-lexeme'
export type LookupCoordinates={relationColumnKey:string;valueColumnKey:string}
export type { LookupCandidate } from './contracts'
export function storedLookupTarget(source:PreparedSource,options:ImportOptions,identities:ImportIdentities,fields:Map<string,Field[]>,relations:RelationPlan[],table:SourceTable,mapping:LookupCoordinates){
 const relation=relations.find(r=>r.table.key===table.key&&r.column.key===mapping.relationColumnKey&&!r.inverseOf&&fields.get(table.key)?.some(f=>f.id===identities.tables[table.key].fields[r.column.key]&&f.type==='relation'))
 const target=source.tables.find(t=>t.key===relation?.targetTableKey),targetColumn=target?.columns.find(c=>c.key===mapping.valueColumnKey),targetField=targetColumn&&target&&fields.get(target.key)?.find(f=>f.id===identities.tables[target.key].fields[targetColumn.key])
 const targetOverride=targetColumn&&target&&options.tables?.[target.key]?.columns?.[targetColumn.key],targetIsLookup=!!(targetOverride?.lookup??targetColumn?.lookup)&&!(targetOverride?.type&&targetOverride.type!=='computed')
 const workbookTargetFormula=['xlsx','google-sheets'].includes(source.format)&&!!targetColumn&&!!target?.rows.some(row=>row.formulas?.[targetColumn.key])
 const supported=!workbookTargetFormula&&!!relation&&relation.cardinality==='one'&&!!targetField&&!targetIsLookup&&!['relation','computed','attachment','person','multi_select'].includes(targetField.type)
 return {relation,target,targetField,supported}
}
/** Every row contributes to matchedRows; the first mismatch is retained without stopping later validation. */
export function proveLookup(source:PreparedSource,table:SourceTable,column:SourceColumn,mapping:LookupCoordinates,target:ReturnType<typeof storedLookupTarget>,recordsByKey:Map<string,PlannedRecord>):LookupCandidate {
 const cellsByRow=new Map(target.relation?.cells.map(c=>[c.rowKey,c])??[])
 let matchedRows=0,firstMismatch:ImportDiagnostic|undefined
 for(const row of table.rows){
  const cell=cellsByRow.get(row.key),refs=cell?.references??[],ref=refs[0];let derived:unknown=''
  if(!target.supported||cell?.error||refs.length>1||ref&&!ref.materializable)derived=null
  else if(ref){const value=recordsByKey.get(JSON.stringify([target.target!.key,ref.targetRowKey]))?.fields[target.targetField!.id];derived=target.targetField!.type==='select'?target.targetField!.options?.find(o=>o.id===value)?.label??'':value??''}
  const raw=row.values[column.key]??'';let exported=source.format==='api'&&Array.isArray(raw)?raw.length===0?'':raw.length===1?raw[0]:raw:raw
  const tokens=row.numericTokens?.[column.key],numeric=tokens?.find(token=>token.path.length===0||Array.isArray(raw)&&raw.length===1&&token.path.length===1&&token.path[0]===0)
  if(numeric&&target.targetField?.type==='number'){try{exported=exactApiNumber(numeric.lexeme)}catch{derived=null}}
  if(derived!==null&&rawText(exported)===rawText(derived as never))matchedRows++
  else if(!firstMismatch)firstMismatch={code:'LOOKUP_MISMATCH',tableKey:table.key,rowKey:row.key,columnKey:column.key,location:row.location,raw,...(target.target?{targetTableKey:target.target.key}:{}),message:`Lookup retained as TEXT: exported ${canonical(raw)}, derived ${canonical(derived)}; first mismatch at ${row.location.artifact} LINE ${row.location.row??row.location.page??1}${target.supported?'':'; lookup needs an actual ONE link and a stored scalar target'}`}
 }
 if(!target.supported&&!firstMismatch)firstMismatch={code:'LOOKUP_MISMATCH',tableKey:table.key,columnKey:column.key,message:'Lookup retained as TEXT: selected coordinates need an actual ONE link and a stored scalar target; no source rows are available to compare.'}
 return {...mapping,targetTableKey:target.target?.key??target.relation?.targetTableKey??'',rowsRead:table.rows.length,matchedRows,matchesAllRows:target.supported&&matchedRows===table.rows.length,...(firstMismatch?{firstMismatch}:{})}
}
