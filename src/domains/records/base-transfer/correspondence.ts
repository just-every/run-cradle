import { validateCsvMetadata } from './csv-schema-metadata'
import { canonicalChunks,canonicalHash } from './canonical-stream'
import { ImportInputError } from './input-error'
import { PLAN_BYTES_LIMIT } from '../../../../vendor/base/modules/import-kit/src/plan/size'
import { Buffer } from 'node:buffer'
import type { PreparedSource,UploadedArtifact,ImportOptions,ImportIdentities } from './contracts'
import { parseCorrespondence,referenceCoordinate,type CorrespondenceReview } from './correspondence-format'
import { hash,rawText,canonical } from './format'
import { chosenType } from './infer'
import { parseLinkCell } from './parse'
function fail(message:string):never{throw new ImportInputError(`correspondence.json: ${message}`)}
function unique(values:string[],description:string){if(new Set(values).size!==values.length)fail(`duplicate ${description}`)}
function canonicalBytes(value:unknown){let bytes=0;for(const chunk of canonicalChunks(value))bytes+=Buffer.byteLength(chunk);return bytes}
export function attachCorrespondence(source:PreparedSource,artifact:UploadedArtifact):PreparedSource {
 if(source.format!=='csv-set')fail('requires a CSV set')
 if(artifact.filename!=='correspondence.json')fail('filename must be correspondence.json')
 if(artifact.bytes.length>200*1048576)fail(`fileBytes limit 209715200; current ${artifact.bytes.length}`)
 if(source.bundle.artifacts.some(a=>a.name===artifact.filename))fail('metadata filename collides with a CSV file')
 let data:unknown;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(artifact.bytes))}catch{fail('invalid UTF-8 or JSON')}
 const csvCorrespondence=parseCorrespondence(data)
 return {...source,csvCorrespondence,bundle:{...source.bundle,artifacts:[...source.bundle.artifacts,{name:artifact.filename,sha256:hash(artifact.bytes),size:artifact.bytes.length,original:{status:'available',base64:Buffer.from(artifact.bytes).toString('base64')}}]}}
}
/** Validate all proposals before applying any decision; loading alone accepts nothing. */
export function reviewCorrespondence(source:PreparedSource,options:ImportOptions,ids:ImportIdentities):CorrespondenceReview|undefined {
 if(!source.csvCorrespondence){if(options.correspondenceAcceptedFingerprint||options.referenceChoices)fail('choices need their correspondence file');return}
 if(source.format!=='csv-set')fail('requires a CSV set')
 const data=parseCorrespondence(source.csvCorrespondence),manifest=source.bundle.artifacts.find(a=>a.name==='correspondence.json')
 if(!manifest||manifest.original?.status!=='available')fail('exact original metadata is missing')
 const bytes=Buffer.from(manifest.original.base64,'base64');if(hash(bytes)!==manifest.sha256||bytes.length!==manifest.size||canonicalHash(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)))!==canonicalHash(data))fail('metadata custody differs from proposals')
 unique(data.tables.map(t=>t.id),'table identity');unique(data.tables.map(t=>t.filename),'filename')
 unique(data.tables.flatMap(t=>t.columns.map(c=>c.id)),'column identity');unique(data.tables.flatMap(t=>t.rows.map(r=>r.id)),'record identity');unique(data.tables.flatMap(t=>[t.id,...t.columns.map(c=>c.id),...t.rows.map(r=>r.id)]),'source identity')
 if(data.tables.length!==source.tables.length||source.bundle.artifacts.filter(a=>a.name!=='correspondence.json'&&a.name!=='import-options.json').length!==source.tables.length)fail('table inventory must cover exactly the uploaded CSV set')
 const sourceTables=new Map(source.tables.map(t=>[t.key,t])),sourceRows=new Map(source.tables.map(t=>[t.key,new Map(t.rows.map(r=>[r.key,r]))])),tables=new Map(data.tables.map(t=>[t.id,t])),rowMaps=new Map(data.tables.map(t=>[t.id,new Map(t.rows.map(r=>[r.id,r]))])),columnMaps=new Map(data.tables.map(t=>[t.id,new Map(t.columns.map(c=>[c.id,c]))]))
 const coordinate=(tableId:string,rowId:string,columnId:string)=>{const table=tables.get(tableId),row=rowMaps.get(tableId)?.get(rowId),column=columnMaps.get(tableId)?.get(columnId),csv=sourceTables.get(table?.filename??'');return table&&row&&column&&csv?.rows[row.ordinal-1]?{tableKey:table.filename,rowKey:csv.rows[row.ordinal-1].key,columnKey:column.key}:undefined}
 for(const table of data.tables){
  const csv=sourceTables.get(table.filename),artifact=source.bundle.artifacts.find(a=>a.name===table.filename)
  if(!csv||!artifact||artifact.size!==table.bytes||artifact.sha256!==table.sha256)fail(`${table.filename}: exact filename, byte length and SHA-256 must match`)
  if(table.columns.length!==csv.columns.length||table.rows.length!==csv.rows.length)fail(`${table.filename}: row and column maps must be bijective`)
  unique(table.columns.map(c=>c.key),'column coordinate');unique(table.rows.map(r=>String(r.ordinal)),'row ordinal')
  const primary=options.tables?.[csv.key]?.primaryColumnKey??csv.primaryColumnKey??csv.columns[0].key
  if(primary!==table.primaryColumnKey)fail(`${table.filename}: primary mapping changed; review new correspondence`)
  for(const column of table.columns){const sourceColumn=csv.columns.find(c=>c.key===column.key);if(!sourceColumn||chosenType(csv,sourceColumn,options.tables?.[csv.key]?.columns?.[column.key])!==column.type)fail(`${table.filename}.${column.key}: type mapping differs from correspondence`);if(column.options&&canonical(options.tables?.[csv.key]?.columns?.[column.key]?.options)!==canonical(column.options.map(o=>o.label)))fail(`${table.filename}.${column.key}: option mapping differs from correspondence`)}
  for(const row of table.rows){const sourceRow=csv.rows[row.ordinal-1];if(!sourceRow||rawText(sourceRow.values[primary])!==row.primary)fail(`${table.filename} data row ${row.ordinal}: primary text differs`)}
 }
 validateCsvMetadata(data)
 const primaryIndexes=new Map(data.tables.map(table=>{const index=new Map<string,CorrespondenceReview['references'][number]['candidates']>();for(const row of sourceTables.get(table.filename)!.rows){const label=rawText(row.values[table.primaryColumnKey]),rows=index.get(label)??[];rows.push({rowKey:row.key,values:row.values});index.set(label,rows)}return [table.filename,index]}))
 const references:CorrespondenceReview['references']=[],seen=new Set<string>(),candidateCache=new Map<string,{rows:CorrespondenceReview['references'][number]['candidates'];bytes:number}>();let reviewBytes=0
 for(const reference of data.references){
  const at=coordinate(reference.tableId,reference.recordId,reference.columnId),target=tables.get(reference.targetTableId),targetRow=rowMaps.get(reference.targetTableId)?.get(reference.targetRecordId)
  if(!at||!target||!targetRow)fail('reference contains an unknown or outside-set identity')
  const table=sourceTables.get(at.tableKey)!,row=sourceRows.get(at.tableKey)!.get(at.rowKey)!,column=table.columns.find(c=>c.key===at.columnKey)!,override=options.tables?.[at.tableKey]?.columns?.[at.columnKey]
  if(chosenType(table,column,override)!=='relation'||override?.relationTableKey!==target.filename)fail(`${at.tableKey}.${at.columnKey}: link target mapping differs`)
  const tokens=parseLinkCell(rawText(row.values[column.key])),key=referenceCoordinate(at.tableKey,at.rowKey,at.columnKey,reference.occurrence)
  if(seen.has(key))fail('duplicate token occurrence');seen.add(key)
  if(tokens[reference.occurrence]!==reference.referenceText||targetRow.primary!==reference.referenceText)fail(`${at.tableKey} ${at.rowKey}: token or proposed target primary differs`)
  const targetSource=sourceTables.get(target.filename)!,candidateKey=JSON.stringify([target.filename,reference.referenceText]);let cached=candidateCache.get(candidateKey);if(!cached){const rows=primaryIndexes.get(target.filename)!.get(reference.referenceText)??[];cached={rows,bytes:canonicalBytes(rows)};candidateCache.set(candidateKey,cached)}const candidates=cached.rows;reviewBytes+=cached.bytes;if(reviewBytes>PLAN_BYTES_LIMIT)fail(`expanded reviewBytes limit ${PLAN_BYTES_LIMIT}; current ${reviewBytes}`)
  const selectedRowKey=options.referenceChoices?.[key]??targetSource.rows[targetRow.ordinal-1].key
  if(!candidates.some(r=>r.rowKey===selectedRowKey))fail(`${key}: selected row must be an exact candidate in the imported target table`)
  references.push({...at,sourcePrimary:rawText(row.values[tables.get(reference.tableId)!.primaryColumnKey]),key,occurrence:reference.occurrence,token:reference.referenceText,state:candidates.length===1?'resolved':'ambiguous',targetTableKey:target.filename,selectedRowKey,candidates})
 }
 for(const table of source.tables)for(const column of table.columns)if(chosenType(table,column,options.tables?.[table.key]?.columns?.[column.key])==='relation')for(const row of table.rows)for(const [n]of parseLinkCell(rawText(row.values[column.key])).entries())if(!seen.has(referenceCoordinate(table.key,row.key,column.key,n)))fail(`${table.key} ${row.key} ${column.key}: missing token occurrence ${n}`)
 for(const key of Object.keys(options.referenceChoices??{}))if(!seen.has(key))fail('unknown reference choice coordinate')
 const selected=new Map<string,Set<string>>();for(const ref of references){const key=JSON.stringify([ref.tableKey,ref.rowKey,ref.columnKey]),targets=selected.get(key)??new Set<string>();if(targets.has(ref.selectedRowKey))fail(`${key}: repeated selected target cannot be silently deduplicated`);targets.add(ref.selectedRowKey);selected.set(key,targets)}
 const cells:CorrespondenceReview['cells']=[],cellSeen=new Set<string>()
 for(const cell of data.cells){const at=coordinate(cell.tableId,cell.recordId,cell.columnId);if(!at)fail('cell annotation contains an unknown identity');const table=tables.get(cell.tableId)!,column=table.columns.find(c=>c.id===cell.columnId)!,csv=sourceTables.get(at.tableKey)!,row=sourceRows.get(at.tableKey)!.get(at.rowKey)!,key=JSON.stringify(at)
  if(cellSeen.has(key)||(column.required||column.type==='multi_select')&&cell.state==='null'||cell.state==='false'&&column.type!=='boolean'||cell.state==='empty'&&column.type!=='text'||['relation','computed'].includes(column.type)||rawText(row.values[at.columnKey])!=='')fail(`${at.tableKey} ${at.rowKey} ${at.columnKey}: incompatible or duplicate empty-cell annotation`)
  cellSeen.add(key);cells.push({...at,state:cell.state})
 }
 for(const table of data.tables)for(const row of sourceTables.get(table.filename)!.rows)for(const column of table.columns)if(!['relation','computed'].includes(column.type)&&rawText(row.values[column.key])===''&&!cellSeen.has(JSON.stringify({tableKey:table.filename,rowKey:row.key,columnKey:column.key})))fail(`${table.filename} ${row.key} ${column.key}: missing empty-cell state annotation`)
 const {correspondenceAcceptedFingerprint:_,...mapping}=options,fingerprint=canonicalHash({artifacts:source.bundle.artifacts.map(a=>[a.name,a.sha256,a.size]),mapping,ids:{appId:ids.appId,tables:Object.fromEntries(Object.entries(ids.tables).map(([key,t])=>[key,{entityId:t.entityId,fields:t.fields,records:t.records}]))},references,cells})
 if(options.correspondenceAcceptedFingerprint&&options.correspondenceAcceptedFingerprint!==fingerprint)fail('mapping or choices changed; accept the current proposals again')
 return {fingerprint,accepted:options.correspondenceAcceptedFingerprint===fingerprint,references,cells}
}
