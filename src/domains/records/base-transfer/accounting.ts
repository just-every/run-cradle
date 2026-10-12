import type { PreparedSource, ImportReport, ImportOptions, ImportIdentities, PlannedRecord } from './contracts'
import type { Field } from '../contracts'
import { rawText, rawCellText, nonempty } from './format'
import { sourceChoiceUsage } from './source-choice-usage'

/** Distinguish a representation conversion from a change to its displayed text. */
export function completeColumnAccounting(source:PreparedSource,options:ImportOptions,identities:ImportIdentities,fields:Map<string,Field[]>,records:PlannedRecord[],report:ImportReport) {
 for(const table of source.tables)for(const column of table.columns){
  const accounting=report.tables.find(t=>t.tableKey===table.key)!.columns.find(c=>c.columnKey===column.key)!
  const override=options.tables?.[table.key]?.columns?.[column.key]??{},kind=override.sourceKind??column.sourceType
  if(kind){accounting.sourceKind=kind;accounting.sourceKindOrigin=override.sourceKind?'owner':'recorded'}
  if(override.sourceChoices){
   accounting.sourceOptions=[...override.sourceChoices]
   const used=new Set(table.rows.flatMap(row=>Array.isArray(row.values[column.key])?(row.values[column.key] as unknown[]).map(String):kind==='multipleSelects'?sourceChoiceUsage(rawText(row.values[column.key]),override.sourceChoices!):[rawText(row.values[column.key])]))
   accounting.unusedSourceOptions=override.sourceChoices.filter(choice=>!used.has(choice))
  }
  const field=fields.get(table.key)?.find(f=>f.id===identities.tables[table.key].fields[column.key])
  const changes=report.diagnostics.filter(d=>d.tableKey===table.key&&d.columnKey===column.key&&['CELL_CONVERTED','LINK_CONVERTED'].includes(d.code))
  accounting.textChanges=changes.filter(change=>{
   const row=table.rows.find(r=>r.key===change.rowKey)!,value=row.values[column.key]
   if(row.numericOrigins?.[column.key])return false
   if(change.code==='LINK_CONVERTED')return source.format==='csv-set'
   if(column.sourceType==='multipleSelects'&&Array.isArray(value))return true
   if(typeof value!=='string')return false
   return rawCellText(value,row.numericTokens?.[column.key])!==rawText(change.converted)
  }).length
  const acceptedRows=new Set(records.filter(record=>record.tableKey===table.key).map(record=>record.rowKey))
  accounting.keptText=field?.type==='text'?table.rows.filter(row=>acceptedRows.has(row.key)&&nonempty(row.values[column.key])).length:0
  accounting.notRecreated=['formula','rollup'].includes(kind??'')||accounting.chosenType==='skipped'&&(column.relationTableKey!==undefined||options.tables?.[table.key]?.columns?.[column.key]?.type==='relation')?accounting.nonempty??0:0
  accounting.recomputed=field?.type==='computed'?acceptedRows.size:0
  if(accounting.keptText&&['dateTime','createdTime','lastModifiedTime','multipleSelects'].includes(kind??''))accounting.reasons.push(`${accounting.keptText} values kept as text.`)
  if(accounting.notRecreated)accounting.reasons.push(`${accounting.notRecreated} source values have behavior not recreated.`)
  if(field?.type==='boolean'){
   const present=table.rows.filter(row=>source.format==='csv-set'?row.values[column.key]==='checked':row.values[column.key]===true).length
   if(source.format==='csv-set'){accounting.normalizedCheckedCheckboxTrue=present;accounting.normalizedBlankCheckboxFalse=table.rows.filter(row=>row.values[column.key]===undefined||row.values[column.key]===null||row.values[column.key]==='').length}
   else{accounting.normalizedApiCheckboxTrue=present;accounting.normalizedOmittedCheckboxFalse=table.rows.filter(row=>!Object.hasOwn(row.values,column.key)).length}
  }
 }
}
