import { csvResultType } from './csv-calculation-fields'
import type { PortableBase } from './json-format'
import { exportIndex } from './export-index'
import type { CsvCorrespondence } from './correspondence-format'
import { hash,stableOptionId } from './format'
import { parseBaseCsv,parseLinkCell } from './parse'
/** Source identities are scoped public data, never destination write identities. */
export function exportCorrespondence(snapshot:PortableBase,files:{filename:string;csv:string}[],index=exportIndex(snapshot.base)):CsvCorrespondence {
 const tables=snapshot.base.tables,encoder=new TextEncoder(),result:CsvCorrespondence={format:'cradle-csv-correspondence',version:1,baseId:snapshot.base.id,tables:[],references:[],cells:[]}
 for(const [tableIndex,table]of tables.entries()){
  const fields=[table.fields.find(f=>f.id===table.primaryFieldId)!,...table.fields.filter(f=>f.id!==table.primaryFieldId)],file=files[tableIndex],bytes=encoder.encode(file.csv),parsed=table.records.length?parseBaseCsv(bytes,file.filename,160):{rows:[]}
  const columns=[...fields.map((field,n)=>({id:field.id,key:`column-${n+1}`,type:csvResultType(field),required:field.required,unique:field.unique,...(['select','multi_select'].includes(csvResultType(field))&&field.options?{options:field.options.map(option=>({...option,id:field.type==='computed'?stableOptionId(snapshot.base.id,table.id,field.id+'-csv-result',option.label):option.id}))}:{}),...(field.relation?{relation:structuredClone(field.relation)}:{}),...(field.validation?{validation:structuredClone(field.validation)}:{}),...(field.numberFormat&&csvResultType(field)==='number'?{numberFormat:field.numberFormat}:{}),...(field.defaultValue!==undefined?{defaultValue:structuredClone(field.defaultValue)}:{})})),...table.incomingRelations.map((field,n)=>({id:field.id,key:`column-${fields.length+n+1}`,type:'relation' as const,required:false,unique:false}))]
  result.tables.push({id:table.id,filename:file.filename,bytes:bytes.length,sha256:hash(bytes),primaryColumnKey:'column-1',...(table.validationRules?{validationRules:structuredClone(table.validationRules)}:{}),columns,rows:table.records.map((row,n)=>({id:row.id,ordinal:n+1,primary:parsed.rows[n].cells[0]}))})
  for(const [rowIndex,row]of table.records.entries())for(const [columnIndex,column]of columns.entries()){
   const field=fields[columnIndex],incoming=table.incomingRelations[columnIndex-fields.length],display=parsed.rows[rowIndex].cells[columnIndex]
   if(field&&field.type!=='relation'&&column.type!=='computed'&&display==='')result.cells.push({tableId:table.id,recordId:row.id,columnId:column.id,state:row.values[field.id]===null?'null':column.type==='boolean'?'false':'empty'})
   if(column.type!=='relation')continue
   const targetTableId=field?.relation?.tableId??incoming.sourceEntityId
   const value=field?row.values[field.id]:index.incoming.get(incoming.id)!.get(row.id)??[]
   const refs=value===null?[]:Array.isArray(value)?value:[value],tokens=parseLinkCell(display)
   for(const [occurrence,targetRecordId]of refs.entries())result.references.push({tableId:table.id,recordId:row.id,columnId:column.id,occurrence,referenceText:tokens[occurrence],targetTableId,targetRecordId:String(targetRecordId)})
  }
 }
 return result
}
