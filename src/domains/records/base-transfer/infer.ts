import type { Field } from '../contracts'
import type { SourceColumn,SourceTable,ColumnOverride } from './contracts'
import { nonempty,rawText } from './format'
import { numberValue } from './convert'
import { exactApiNumber } from './numeric-lexeme'
const numbers=new Set(['number','currency','percent','rating','duration','autoNumber','autonumber','count'])
export function inferColumn(table:SourceTable,column:SourceColumn):Field['type']|'skipped' {
 const type=column.sourceType
 if(column.lookup)return 'text'
 if(type==='multipleRecordLinks'||column.relationTableKey)return 'relation'
 if(type==='multipleAttachments'||type==='button'||type==='attachment')return 'skipped'
 if(numbers.has(type??''))return 'number'
 if(type==='checkbox')return 'boolean'
 if(type==='singleSelect')return 'select'
 if(type==='date')return 'date'
 if(type==='dateTime')return 'instant'
 if(type==='formula'||type==='rollup'){
  const rows=table.rows.filter(row=>nonempty(row.values[column.key]))
  return rows.length&&rows.every(row=>{
   const value=row.values[column.key],origin=row.numericOrigins?.[column.key]
   if(Array.isArray(value)||value&&typeof value==='object'||typeof value==='boolean'||typeof value==='number'&&Number.isInteger(value)&&!Number.isSafeInteger(value))return false
   try{if(origin)exactApiNumber(origin.lexeme);else numberValue(rawText(value));return true}catch{return false}
  })?'number':'text'
 }
 if(type)return 'text'
 const values=table.rows.map(r=>r.values[column.key]).filter(nonempty).map(rawText)
 if(values.length&&values.every(v=>{if(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(v))return true;if(!/^[£$€¥(]|[%)]$|\d,\d/.test(v.trim()))return false;try{numberValue(v);return true}catch{return false}}))return 'number'
 if(values.length&&values.every(v=>/^\d{4}-\d\d-\d\d$/.test(v)||/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)))return 'date'
 if(values.length&&values.every(v=>v==='checked'))return 'boolean'
 const distinct=[...new Set(values)]
 if(distinct.length>1&&distinct.length<=20&&distinct.length<values.length&&values.every(v=>v.length<=200&&!/[\r\n]/.test(v)))return 'select'
 return 'text'
}
export function chosenType(table:SourceTable,column:SourceColumn,override:ColumnOverride={}):Field['type']|'skipped' {return override.skip?'skipped':override.type??inferColumn(table,column)}

import type { PreparedSource,ImportOptions,ImportDiagnostic } from './contracts'
import { parseLinkCell } from './parse'
/** CSV evidence proposes links only when one imported target matches every reference exactly. */
export function inferCsvStructure(source:PreparedSource,options:ImportOptions):{source:PreparedSource;diagnostics:ImportDiagnostic[]} {
 const tables=source.tables.map(t=>({...t,columns:t.columns.map(c=>({...c,...(options.tables?.[t.key]?.columns?.[c.key]?.lookup?{lookup:options.tables[t.key].columns![c.key].lookup}:{})}))})),diagnostics:ImportDiagnostic[]=[]
 if(!['csv-set','xlsx','google-sheets'].includes(source.format))return {source:{...source,tables},diagnostics}
 const primaryIndexes=new Map(tables.map(table=>{const primary=options.tables?.[table.key]?.primaryColumnKey??table.primaryColumnKey??table.columns[0].key,index=new Map<string,typeof table.rows>();for(const row of table.rows){const label=rawText(row.values[primary]);const matches=index.get(label);if(matches)matches.push(row);else index.set(label,[row])}return [table.key,index]}))
 for(const table of tables)for(const column of table.columns){
  const override=options.tables?.[table.key]?.columns?.[column.key]??{},primary=options.tables?.[table.key]?.primaryColumnKey??table.primaryColumnKey??table.columns[0].key
  if(column.key===primary||column.sourceType||column.relationTableKey||column.lookup||override.skip||override.type&&override.type!=='relation')continue
  let references:string[]
  try{references=[...new Set(table.rows.flatMap(row=>parseLinkCell(rawText(row.values[column.key]))))]}catch{continue}
  if(!references.length)continue
  const candidates=tables.filter(target=>{
   const labels=primaryIndexes.get(target.key)!
   return references.every(ref=>labels.has(ref))
  })
  if(override.relationTableKey!==undefined)column.relationTableKey=override.relationTableKey
  else if(candidates.length===1){column.relationTableKey=candidates[0].key;diagnostics.push({code:'LINK_INFERRED',tableKey:table.key,columnKey:column.key,message:`All ${references.length} references exactly match primary values of ${candidates[0].label}; proposed target may be overridden.`})}
  else if(candidates.length>1)diagnostics.push({code:'LINK_TARGET_AMBIGUOUS',tableKey:table.key,columnKey:column.key,message:`${references.length} references match ${candidates.length} candidate tables (${candidates.map(c=>c.label).join(', ')}); choose a link target.`})
 }
 // Candidate lookup identity comes from actual proposed/overridden relation, never a column label alone.
 for(const table of tables)for(const link of table.columns){
  const override=options.tables?.[table.key]?.columns?.[link.key]??{}
  if(!table.rows.length||!table.rows.some(row=>nonempty(row.values[link.key]))||override.skip||override.type&&override.type!=='relation')continue
  const target=tables.find(t=>t.key===(override.relationTableKey??link.relationTableKey));if(!target)continue
  const primary=options.tables?.[target.key]?.primaryColumnKey??target.primaryColumnKey??target.columns[0].key
  for(const column of table.columns){
   const columnOverride=options.tables?.[table.key]?.columns?.[column.key]
   if(columnOverride?.skip||columnOverride?.type&&columnOverride.type!=='computed')continue
   if(source.format==='xlsx'&&table.rows.some(row=>row.formulas?.[column.key]))continue
   if(column.key===link.key||column.key===(options.tables?.[table.key]?.primaryColumnKey??table.primaryColumnKey??table.columns[0].key)||column.relationTableKey||column.lookup)continue
   const candidates=target.columns.filter(targetColumn=>table.rows.every(row=>{
    let refs:string[];try{refs=parseLinkCell(rawText(row.values[link.key]))}catch{return false}
    if(refs.length>1)return false
    if(!refs.length)return rawText(row.values[column.key])===''
    const matches=primaryIndexes.get(target.key)!.get(refs[0])??[];return matches.length===1&&rawText(matches[0].values[targetColumn.key])===rawText(row.values[column.key])
   }))
   const candidate=candidates.length===1?candidates[0]:undefined
   if(candidate)column.lookup={relationColumnKey:link.key,valueColumnKey:candidate.key}
  }
 }
 return {source:{...source,tables},diagnostics}
}
