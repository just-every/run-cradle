import { ImportInputError } from './input-error'
import { Buffer } from 'node:buffer'
import { createUlid } from '../../../core/shared/ids'
import type { UploadedArtifact,PreparedSource,ImportIdentities } from './contracts'
import { canonical,hash,limit,rawText } from './format'
import { parseBaseCsv,SOURCE_LIMITS } from './parse'
import { inferColumn } from './infer'
export function prepareCsvSource(artifacts:UploadedArtifact[],namespace='cradle-csv'):PreparedSource {
 if(!artifacts.length)throw new ImportInputError('Choose at least one CSV file')
 limit('tables',SOURCE_LIMITS.tables,artifacts.length,'CSV selection',1)
 if(new Set(artifacts.map(a=>a.filename)).size!==artifacts.length)throw new ImportInputError('Duplicate filenames in CSV selection')
 const source:PreparedSource={format:'csv-set',namespace,bundle:{records:[],artifacts:[],diagnostics:[]},tables:[]}
 for(const artifact of artifacts){
  // Up to 80 native fields plus 80 declared incoming projections. The preview
  // enforces the native cap after proving/canonicalizing those projections.
  const parsed=parseBaseCsv(artifact.bytes,artifact.filename,160),artifactHash=hash(artifact.bytes),key=artifact.filename
  const columns=parsed.headers.map((label,i)=>({key:`column-${i+1}`,label}))
  const rows=parsed.rows.map((row,i)=>({key:`row-${i+1}`,values:Object.fromEntries(columns.map((column,j)=>[column.key,row.cells[j]])),location:{artifact:key,row:row.line}}))
  source.tables.push({key,label:artifact.filename.replace(/\.csv$/i,''),columns,rows})
  source.bundle.artifacts.push({name:key,sha256:artifactHash,size:artifact.bytes.byteLength,original:{status:'available',base64:Buffer.from(artifact.bytes).toString('base64')}})
  for(const row of rows)source.bundle.records.push({namespace,kind:key,sourceId:row.key,payload:row.values,payloadHash:hash(canonical(row.values)),artifactHash,location:row.location})
 }
 return source
}
/** IDs are allocated once, independent of current type overrides. */
export function allocateImportIdentities(source:PreparedSource):ImportIdentities {
 const identities:ImportIdentities={appId:createUlid(),tables:Object.create(null)}
 for(const table of source.tables){
  const fields=Object.fromEntries(table.columns.map(c=>[c.key,createUlid()])),records=Object.fromEntries(table.rows.map(r=>[r.key,createUlid()]))
  const options:Record<string,Record<string,string>>=Object.create(null)
  for(const column of table.columns){options[column.key]=Object.create(null);if(inferColumn(table,column)==='select')for(const label of [...(column.options??[]),...table.rows.map(r=>rawText(r.values[column.key]))])if(label!==''&&label.length<=200&&!Object.hasOwn(options[column.key],label))options[column.key][label]=createUlid()}
  identities.tables[table.key]={entityId:createUlid(),fields,records,options}
 }
 return identities
}
