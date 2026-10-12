import type { PreparedSource,ImportOptions,ImportIdentities,ImportDiagnostic,PlannedRecord } from './contracts'
import type { Field } from '../contracts'
import { rawCellText } from './format'
import type { RelationPlan } from './links'
import { proveLookup,storedLookupTarget,type LookupCandidate,type LookupCoordinates } from './lookup-proof'
export type LookupRecognition={tableKey:string;columnKey:string;recognized:boolean;candidates:LookupCandidate[];relationColumnKey?:string;valueColumnKey?:string;targetTableKey?:string;firstMismatch?:ImportDiagnostic;ambiguity?:ImportDiagnostic}
/** Owner/source mappings and automatic proposals pass the same proof. Labels never settle equal candidates. */
export function recognizeLookups(source:PreparedSource,options:ImportOptions,identities:ImportIdentities,fields:Map<string,Field[]>,records:PlannedRecord[],relations:RelationPlan[]):LookupRecognition[] {
 const recordsByKey=new Map(records.map(r=>[JSON.stringify([r.tableKey,r.rowKey]),r])),results:LookupRecognition[]=[]
 for(const table of source.tables)for(const column of table.columns){
  const override=options.tables?.[table.key]?.columns?.[column.key]??{},requested=override.lookup??column.lookup,field=fields.get(table.key)?.find(f=>f.id===identities.tables[table.key].fields[column.key])
  if(!field||field.type==='relation'||column.key===(options.tables?.[table.key]?.primaryColumnKey??table.primaryColumnKey??table.columns[0]?.key)){if(requested)results.push({tableKey:table.key,columnKey:column.key,recognized:false,candidates:[]});continue}
  if(source.format!=='csv-set'&&!requested)continue
  const candidates:LookupCandidate[]=[]
  for(const relation of relations.filter(r=>r.table.key===table.key&&!r.inverseOf&&r.cardinality==='one')){
   const targetTable=source.tables.find(t=>t.key===relation.targetTableKey);if(!targetTable)continue
   for(const targetColumn of targetTable.columns){
    const mapping={relationColumnKey:relation.column.key,valueColumnKey:targetColumn.key},target=storedLookupTarget(source,options,identities,fields,relations,table,mapping)
    if(target.supported)candidates.push(proveLookup(source,table,column,mapping,target,recordsByKey))
   }
  }
  const proven=candidates.filter(c=>c.matchesAllRows)
  // Without a mapping, empty source data supplies no evidence to infer a lookup definition.
  const hasEvidence=relations.some(r=>r.table.key===table.key&&!r.inverseOf&&r.cardinality==='one'&&r.cells.some(c=>c.references.some(ref=>ref.materializable)))
  const automatic=!requested&&hasEvidence&&table.rows.length&&proven.length===1?proven[0]:undefined,mapping:LookupCoordinates|undefined=requested??automatic
  let proof=mapping&&candidates.find(c=>c.relationColumnKey===mapping.relationColumnKey&&c.valueColumnKey===mapping.valueColumnKey)
  if(mapping&&!proof)proof=proveLookup(source,table,column,mapping,storedLookupTarget(source,options,identities,fields,relations,table,mapping),recordsByKey)
  if(proof&&!candidates.some(c=>c.relationColumnKey===proof!.relationColumnKey&&c.valueColumnKey===proof!.valueColumnKey))candidates.push(proof)
  // Declared API coordinates and CSV proposals share the same all-row proof.
  // An explicit scalar choice preserves the exported content instead.
  const ownerKeptScalar=override.skip||override.type&&override.type!=='computed'
  const recognized=!!mapping&&!!proof?.matchesAllRows&&!ownerKeptScalar
  const ambiguity=!requested&&table.rows.length&&proven.length>1?{code:'LOOKUP_CANDIDATE_AMBIGUOUS',tableKey:table.key,columnKey:column.key,message:`${proven.length} lookup definitions match every exported row; choose relationColumnKey and valueColumnKey explicitly. Equal data and field labels cannot restore the source definition.`}:undefined
  if(!requested&&!automatic&&!ambiguity&&!candidates.length)continue
  if(recognized){
   const target=storedLookupTarget(source,options,identities,fields,relations,table,mapping!)
   field.type='computed';field.readOnly=true;field.resultType=target.targetField!.type;field.expression={kind:'rollup',relationFieldId:identities.tables[table.key].fields[mapping!.relationColumnKey],valueFieldId:target.targetField!.id,aggregate:'lookup'}
   if(target.targetField!.options)field.options=target.targetField!.options.map(o=>({...o}));else delete field.options
   for(const record of records.filter(r=>r.tableKey===table.key))delete record.fields[field.id]
  }else if(requested&&!ownerKeptScalar||ambiguity&&!ownerKeptScalar){
   field.type='text';delete field.options
   for(const row of table.rows){const record=recordsByKey.get(JSON.stringify([table.key,row.key]));if(record)record.fields[field.id]=rawCellText(row.values[column.key],row.numericTokens?.[column.key])}
  }
  results.push({tableKey:table.key,columnKey:column.key,recognized,candidates,...(mapping?{relationColumnKey:mapping.relationColumnKey,valueColumnKey:mapping.valueColumnKey}:{}),...(proof?{targetTableKey:proof.targetTableKey,...(proof.firstMismatch?{firstMismatch:proof.firstMismatch}:{})}:{}),...(ambiguity?{ambiguity}:{})})
 }
 return results
}
