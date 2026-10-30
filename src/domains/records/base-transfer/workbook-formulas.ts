import type {Expr,Field} from '../contracts'
import type {PreparedSource,ImportOptions,ImportIdentities,PlannedRecord,WorkbookFormula} from './contracts'
import {arithmetic} from '../formula-values'
import {formulaText} from '../formula-text'
import {exactApiNumber} from './numeric-lexeme'
import {workbookExpression,workbookDependencies} from './workbook-formula-parser'

/** Prove every cache against native arithmetic before any computed field is offered. */
export function recognizeWorkbookFormulas(source:PreparedSource,options:ImportOptions,ids:ImportIdentities,fields:Map<string,Field[]>,records:PlannedRecord[]):WorkbookFormula[]{
 if(source.format!=='xlsx')return []
 const results:WorkbookFormula[]=[]
 for(const table of source.tables){
  const nativeFields=fields.get(table.key)!,identity=ids.tables[table.key]
  const candidates=new Map<string,WorkbookFormula>(),byRow=new Map(records.filter(r=>r.tableKey===table.key).map(r=>[r.rowKey,r]))
  for(const column of table.columns){
   const sourceFormulas=table.rows.flatMap(row=>row.formulas?.[column.key]?[{rowKey:row.key,...row.formulas[column.key]}]:[])
   if(!sourceFormulas.length)continue
   const result:WorkbookFormula={tableKey:table.key,columnKey:column.key,recognized:false,sourceFormulas,matchedRows:0,rowsRead:table.rows.length}
   candidates.set(identity.fields[column.key],result);results.push(result)
   try{
    if(sourceFormulas.length!==table.rows.length)throw new Error('Mixed formula and literal cells in this column')
    if(column.key===(options.tables?.[table.key]?.primaryColumnKey??table.primaryColumnKey??table.columns[0]?.key))throw new Error('A primary column cannot become a formula field')
    for(const row of table.rows){
     const formula=row.formulas![column.key],coordinate=/^([A-Z]+)([1-9]\d*)$/.exec(formula.coordinate)
     if(!coordinate||Number(coordinate[2])!==row.location.row)throw new Error('Source formula coordinate is unavailable')
     if(!row.numericOrigins?.[column.key])throw new Error('Only numeric formula caches are supported')
     const expression=workbookExpression(formula,row.location.row!,table,identity.fields)
     if(result.expression&&JSON.stringify(result.expression)!==JSON.stringify(expression))throw new Error('Mixed formula definitions in this column')
     result.expression=expression
    }
    result.nativeFormula=formulaText(result.expression,nativeFields)
   }catch(error){result.reason=error instanceof Error?error.message:'Unsupported workbook formula'}
  }
  const visiting=new Set<string>(),finished=new Set<string>()
  function prove(fieldId:string):void {
   const result=candidates.get(fieldId)
   if(!result||finished.has(fieldId))return
   if(visiting.has(fieldId))throw new Error('Formula dependency cycle')
   if(result.reason){finished.add(fieldId);return}
   visiting.add(fieldId)
   try{
    const field=nativeFields.find(f=>f.id===fieldId),override=options.tables?.[table.key]?.columns?.[result.columnKey]
    if(!field||override?.skip)throw new Error('Owner skipped the formula field')
    if(override?.lookup||table.columns.find(c=>c.key===result.columnKey)?.lookup)throw new Error('Owner chose a lookup mapping instead of workbook arithmetic')
    for(const dependency of workbookDependencies(result.expression!)){
     if(candidates.has(dependency)){
      prove(dependency)
      if(!candidates.get(dependency)!.recognized)throw new Error('A referenced formula column could not be preserved')
     }else if(nativeFields.find(f=>f.id===dependency)?.type!=='number')throw new Error('Formula inputs must map to native number fields')
    }
    function evaluate(expr:Expr,rowKey:string,depth=1):string {
     if(depth>64)throw new Error('Formula dependency depth exceeds 64')
     if(expr.kind==='literal'&&typeof expr.value==='string')return expr.value
     if(expr.kind==='field'){
      const dependency=candidates.get(expr.fieldId)
      if(dependency)return evaluate(dependency.expression!,rowKey,depth+1)
      const value=byRow.get(rowKey)?.fields[expr.fieldId]
      if(typeof value!=='string')throw new Error('A numeric input or accepted source row is unavailable')
      return value
     }
     if(expr.kind==='call')return arithmetic(expr.fn,expr.args.map(e=>evaluate(e,rowKey,depth+1))) as string
     throw new Error('Unsupported workbook arithmetic')
    }
    let firstMismatch:string|undefined
    for(const row of table.rows){
     try{
      if(!byRow.has(row.key))throw new Error('Source row was rejected')
      const expected=exactApiNumber(row.numericOrigins![result.columnKey].lexeme),actual=evaluate(result.expression!,row.key)
      if(actual!==expected)throw new Error(`cached result ${expected} differs from native result ${actual}`)
      result.matchedRows++
     }catch(error){firstMismatch??=`${row.formulas![result.columnKey].coordinate}: ${error instanceof Error?error.message:'result unavailable'}`}
    }
    if(firstMismatch)throw new Error(firstMismatch)
    result.matchesAllRows=true
    if(override?.type&&override.type!=='computed')throw new Error('Owner chose cached values instead of a formula')
    field.type='computed';field.readOnly=true;field.resultType='number';field.expression=result.expression
    delete field.options
    for(const record of byRow.values())delete record.fields[fieldId]
    result.recognized=true
   }catch(error){result.reason=error instanceof Error?error.message:'Workbook formula could not be preserved'}
   finally{visiting.delete(fieldId);finished.add(fieldId)}
  }
  for(const fieldId of candidates.keys())prove(fieldId)
 }
 return results
}
