import { ImportInputError } from './input-error'
import { Buffer } from 'node:buffer'
import type { PreparedSource,UploadedArtifact } from './contracts'
import { hash } from './format'
/** The public mapping upload is retained independently of subsequent owner edits. */
export function retainCsvMapping(source:PreparedSource,artifact:UploadedArtifact):PreparedSource {
 if(source.format!=='csv-set'||artifact.filename!=='import-options.json')throw new ImportInputError('import-options.json: choose the CSV mapping file')
 if(artifact.bytes.length>200*1048576)throw new ImportInputError(`import-options.json: fileBytes limit 209715200; current ${artifact.bytes.length}`)
 if(source.bundle.artifacts.some(a=>a.name===artifact.filename))throw new ImportInputError('import-options.json: metadata filename collision')
 try{JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(artifact.bytes))}catch{throw new ImportInputError('import-options.json: invalid UTF-8 or JSON')}
 return {...source,bundle:{...source.bundle,artifacts:[...source.bundle.artifacts,{name:artifact.filename,size:artifact.bytes.length,sha256:hash(artifact.bytes),original:{status:'available',base64:Buffer.from(artifact.bytes).toString('base64')}}]}}
}
