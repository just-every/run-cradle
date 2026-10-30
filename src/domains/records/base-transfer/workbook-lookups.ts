import type {ImportOptions,PreparedSource,SourceTable,WorkbookFormula} from './contracts'
import {rawText} from './format'
import {parseLinkCell} from './parse'
import {isWorkbookLookup,workbookLookup} from './workbook-lookup-parser'

/** Source formula coordinates disambiguate equal-valued sheets, never duplicate target keys. */
export function proposeWorkbookLookups(source:PreparedSource,tables:SourceTable[],options:ImportOptions):WorkbookFormula[]{
 if(!['xlsx','google-sheets'].includes(source.format))return []
 const primary=(table:SourceTable)=>options.tables?.[table.key]?.primaryColumnKey??table.primaryColumnKey??table.columns[0].key,results:WorkbookFormula[]=[]
 for(const table of tables)for(const column of table.columns){
  const sourceFormulas=table.rows.flatMap(row=>row.formulas?.[column.key]?[{rowKey:row.key,...row.formulas[column.key]}]:[])
  if(!sourceFormulas.some(isWorkbookLookup))continue
  const result:WorkbookFormula={tableKey:table.key,columnKey:column.key,recognized:false,sourceFormulas,matchedRows:0,rowsRead:table.rows.length};results.push(result)
  try{
   if(column.key===primary(table)||sourceFormulas.length!==table.rows.length)throw new Error('Lookup needs a uniform non-primary formula column')
   for(const row of table.rows){
    const formula=row.formulas![column.key]
    if(!/^[A-Z]+[1-9]\d*$/.test(formula.coordinate)||Number(formula.coordinate.match(/\d+$/)![0])!==row.location.row)throw new Error('Source formula coordinate is unavailable')
    const mapping=workbookLookup(formula,row.location.row!,table,tables,primary)
    if(result.lookup&&JSON.stringify(result.lookup)!==JSON.stringify(mapping))throw new Error('Mixed lookup formula definitions in this column')
    result.lookup=mapping
   }
   const mapping=result.lookup!,link=table.columns.find(c=>c.key===mapping.relationColumnKey)!,target=tables.find(t=>t.key===mapping.targetTableKey)!,key=primary(target),override=options.tables?.[table.key]?.columns?.[link.key]
   if(override?.skip||override?.type&&override.type!=='relation'||override?.relationTableKey&&override.relationTableKey!==target.key||override?.cardinality==='many')throw new Error('Lookup key must map to the selected ONE link')
   if(table.rows.some(row=>row.formulas?.[link.key]))throw new Error('A calculated lookup key cannot become a stored link')
   const seen=new Set<string>()
   for(const row of target.rows){const value=rawText(row.values[key]),folded=value.toLowerCase();if(!value||seen.has(folded))throw new Error('Lookup target keys must be nonempty and unique, including letter case');seen.add(folded)}
   for(const row of table.rows){
    const raw=rawText(row.values[link.key]),refs=parseLinkCell(raw),matches=target.rows.filter(t=>rawText(t.values[key])===raw)
    if(refs.length!==1||refs[0]!==raw||matches.length!==1)throw new Error('Every lookup key must match exactly one complete target key')
    if(/^=?(?:_xlfn\.)?VLOOKUP/i.test(row.formulas![column.key].expression.trim())&&/[*?~]/.test(raw))throw new Error('VLOOKUP wildcard keys are not preserved')
    const a=row.values[link.key],b=matches[0].values[key],aNumeric=!!row.numericOrigins?.[link.key],bNumeric=!!matches[0].numericOrigins?.[key]
    if(typeof a!==typeof b||aNumeric!==bNumeric)throw new Error('Lookup key types must agree with the target keys')
   }
   link.relationTableKey=target.key
   // Reuse the native all-row lookup proof after current mapping and row validation.
   if(!options.tables?.[table.key]?.columns?.[column.key]?.lookup)column.lookup={relationColumnKey:link.key,valueColumnKey:mapping.valueColumnKey}
  }catch(error){result.reason=error instanceof Error?error.message:'Unsupported workbook lookup'}
 }
 return results
}
