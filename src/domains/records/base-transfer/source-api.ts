import { ImportInputError } from './input-error'
import { readApiSource } from '../../../../vendor/base/modules/import-kit/src/readers/api'
import type { ApiTransport,ApiSourceInput,Json,SourceBundle } from '../../../../vendor/base/modules/import-kit/src/types'
import type { PreparedSource,SourceColumn,SourceTable,NumericOrigin,NumericToken } from './contracts'
import { cellCharacters,limit,rawCellText } from './format'
import { SOURCE_LIMITS } from './parse'
export type ApiSourceRequest={namespace?:string;metadataUrl:string;recordsUrl:(tableKey:string)=>string}
function object(value:Json):Record<string,Json>{if(!value||typeof value!=='object'||Array.isArray(value))throw new ImportInputError('Expected API object');return value}
function text(value:Json|undefined,label:string):string {if(typeof value!=='string'||!value)throw new ImportInputError(`Expected ${label}`);return value}
function array(value:Json|undefined):Json[]{if(!Array.isArray(value))throw new ImportInputError('Expected API array');return value}
function retain(bundle:SourceBundle,target:SourceBundle,prefix:string):void {
 target.artifacts.push(...bundle.artifacts.map(a=>({...a,name:prefix+'/'+a.name})))
 target.records.push(...bundle.records.map(r=>({...r,location:{...r.location,artifact:prefix+'/'+r.location.artifact}})))
 target.diagnostics.push(...bundle.diagnostics.map(d=>({...d,...(d.location?{location:{...d.location,artifact:prefix+'/'+d.location.artifact}}:{})})))
}
async function readExportPage(input:ApiSourceInput,transport:ApiTransport):Promise<SourceBundle> {
 let parserError:Error|undefined
 try{return await readApiSource({...input,parsePage(value,page,context){try{return input.parsePage(value,page,context)}catch(error){parserError=error instanceof Error?error:new Error('Invalid API export structure');throw error}}},transport)}
 catch(error){if(parserError)throw parserError;throw error}
}
/** Recorded/export API parser. Transport is caller-supplied; no production fetch/token/account flow. */
export async function prepareApiSource(request:ApiSourceRequest,transport:ApiTransport):Promise<PreparedSource> {
 const namespace=request.namespace??'cradle-api',bundle:SourceBundle={records:[],artifacts:[],diagnostics:[]},tables:SourceTable[]=[]
 const metadata=await readExportPage({namespace,url:request.metadataUrl,maxRetries:0,limits:{maxBytes:Number.MAX_SAFE_INTEGER,maxRecords:20,maxRecordBytes:Number.MAX_SAFE_INTEGER},parsePage(value){
  const root=object(value),definitions=array(root.tables)
  limit('tables',SOURCE_LIMITS.tables,definitions.length,'API metadata',1)
  if(!definitions.length)throw new ImportInputError('API metadata must contain at least one table')
  const tableIds=definitions.map(definition=>text(object(definition).id,'table ID'));if(new Set(tableIds).size!==tableIds.length)throw new ImportInputError('Duplicate API table ID')
  return {records:definitions.map(definition=>{const table=object(definition),key=text(table.id,'table ID');return {kind:'api-schema',sourceId:key,payload:definition}})}
 }},transport)
 retain(metadata,bundle,'metadata')
 for(const definition of metadata.records){
  const raw=object(definition.payload),key=definition.sourceId,definitions=array(raw.fields)
  limit('fields',SOURCE_LIMITS.fields,definitions.length,key,1)
  const columns:SourceColumn[]=definitions.map(definition=>{
   const field=object(definition),options=field.options&&typeof field.options==='object'&&!Array.isArray(field.options)?object(field.options):{},column:SourceColumn={key:text(field.id,'field ID'),label:text(field.name,'field name'),sourceType:text(field.type,'field type')}
   if(Array.isArray(options.choices))column.options=options.choices.map(choice=>text(object(choice).name,'select option'))
   if(typeof options.linkedTableId==='string')column.relationTableKey=options.linkedTableId
   if(typeof options.inverseLinkFieldId==='string')column.reciprocalColumnKey=options.inverseLinkFieldId
   if(column.sourceType==='multipleLookupValues'&&typeof options.recordLinkFieldId==='string'&&typeof options.fieldIdInLinkedTable==='string')column.lookup={relationColumnKey:options.recordLinkFieldId,valueColumnKey:options.fieldIdInLinkedTable}
   return column
  })
  if(new Set(columns.map(c=>c.key)).size!==columns.length)throw new ImportInputError(`${key}: Duplicate API field ID`)
  if(!columns.length)throw new ImportInputError(`${key}: API table has no fields`)
  const table:SourceTable={key,label:text(raw.name,'table name'),primaryColumnKey:typeof raw.primaryFieldId==='string'?raw.primaryFieldId:columns[0].key,columns,rows:[]};if(!columns.some(c=>c.key===table.primaryColumnKey))throw new ImportInputError(`${key}: Unknown declared primary field`);tables.push(table)
  const baseUrl=request.recordsUrl(key)
  const pageLexemes=new Map<number,Readonly<Record<string,string>>>()
  let rowsRead=0
  const records=await readExportPage({namespace,url:baseUrl,maxRequests:10001,maxRetries:0,limits:{maxBytes:Number.MAX_SAFE_INTEGER,maxRecords:10000,maxRecordBytes:Number.MAX_SAFE_INTEGER},
   preserveNumberLexeme:path=>path.length>=4&&path[0]==='records'&&typeof path[1]==='number'&&path[2]==='fields'&&typeof path[3]==='string'&&(path.length===4||columns.some(column=>(column.key===path[3]||column.label===path[3])&&['multipleLookupValues','rollup','formula'].includes(column.sourceType??''))),
   parsePage(value,page,context){
   pageLexemes.set(page,context.numericLexemes)
   const root=object(value),rows=array(root.records)
   rowsRead+=rows.length;limit('csvImportRows',10000,rowsRead,key,page)
   const parsed=rows.map((row,index)=>{const record=object(row),id=text(record.id,'record ID');return {kind:key,sourceId:id,payload:row,pointer:`/records/${index}`}})
   if(root.offset!==undefined&&(typeof root.offset!=='string'||!root.offset))throw new ImportInputError(`${key}: Invalid pagination offset`)
   const next=typeof root.offset==='string'?new URL(baseUrl):null;if(next)next.searchParams.set('offset',root.offset as string)
   void page;return {records:parsed,next:next?.href}
  }},transport)
  retain(records,bundle,key)
  if(new Set(records.records.map(r=>r.sourceId)).size!==records.records.length)throw new ImportInputError(`${key}: Duplicate API record identity`)
  for(const record of records.records){
   const raw=object(record.payload),values=raw.fields?object(raw.fields):{},mapped:Record<string,Json>=Object.create(null),numericOrigins:Record<string,NumericOrigin>=Object.create(null),numericTokens:Record<string,NumericToken[]>=Object.create(null)
   const lexemes=pageLexemes.get(record.location.page!)!
   const mapCell=(columnKey:string,sourceKey:string)=>{
    const value=values[sourceKey],pointer=record.location.pointer+'/fields/'+sourceKey.replaceAll('~','~0').replaceAll('/','~1')
    const tokens:NumericToken[]=[]
    const inspect=(cell:Json,at:string,path:(string|number)[])=>{if(typeof cell==='number')throw new ImportInputError(`${key}: API numeric cell is missing exact token provenance at ${at}`);if(Object.hasOwn(lexemes,at)){const lexeme=lexemes[at];if(cell!==lexeme)throw new ImportInputError(`${key}: API numeric token provenance does not match ${at}`);tokens.push({lexeme,pointer:at,path})}else if(Array.isArray(cell))cell.forEach((item,index)=>inspect(item,at+'/'+index,[...path,index]));else if(cell&&typeof cell==='object')for(const [name,item]of Object.entries(cell))inspect(item,at+'/'+name.replaceAll('~','~0').replaceAll('/','~1'),[...path,name])}
    if(typeof value!=='object'||value===null||columns.some(column=>column.key===columnKey&&['multipleLookupValues','rollup','formula'].includes(column.sourceType??'')))inspect(value,pointer,[])
    if(tokens.length){numericTokens[columnKey]=tokens;if(tokens[0].path.length===0)numericOrigins[columnKey]={lexeme:tokens[0].lexeme,pointer}}
    limit('cellCharacters',100000,cellCharacters(rawCellText(value,tokens)),key,record.location.page??1)
    mapped[columnKey]=value
   }
   // Keep every unsupported/unknown source field, including omitted known cells, in retained raw records.
   for(const column of columns){const sourceKey=Object.hasOwn(values,column.key)?column.key:Object.hasOwn(values,column.label)?column.label:undefined;if(sourceKey!==undefined)mapCell(column.key,sourceKey)}
   for(const name of Object.keys(values))if(!columns.some(c=>c.key===name||c.label===name))mapCell(name,name)
   table.rows.push({key:record.sourceId,values:mapped,...(Object.keys(numericOrigins).length?{numericOrigins}:{}),...(Object.keys(numericTokens).length?{numericTokens}:{}),location:{...record.location,artifact:key+'/'+record.location.artifact}})
  }
 }
 return {format:'api',namespace,bundle,tables}
}
