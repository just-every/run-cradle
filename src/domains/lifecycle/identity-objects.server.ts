import {attachmentText} from './attachment-text.server'
import {AuthorityError} from '../authority/errors'
import {STAGING_ENTITY} from '../evidence/staging.server'
import {hasWholeToken} from './identity-match'
import {INSPECTION_BUDGET} from './inspection-budget.server'
import type {IdentityCopy} from './identity-redaction.server'
/** R2 objects are deleted only through ownership: a file in the person's own private source
 * intake whose bytes, key or metadata carry their identity as a whole token. Every other
 * object that contains the literal is reported as a copy to resolve and is never deleted.
 * Only the person's own files must be inspectable. Another object whose bytes cannot be
 * inspected (a photo, an unsupported PDF, a file over the memory budget) is still checked
 * by key and metadata, then counted as not inspected in the plan; it never blocks erasure.
 */
export async function classifyIdentityObjects(db:D1Database,bucket:R2Bucket,input:{personId:string;matches:string[];label:string;others:string[];deleting:ReadonlySet<string>}){
 const owned=new Set((await db.prepare('SELECT f.object_key FROM evidence_files f JOIN evidence_staging s ON s.id=f.record_id WHERE f.entity_id=? AND s.owner_id=?').bind(STAGING_ENTITY,input.personId).all<{object_key:string}>()).results.map(row=>row.object_key))
 const erase:{key:string;fileId:string|null}[]=[],residual:IdentityCopy[]=[]
 const found=(value:string)=>input.matches.some(match=>value.includes(match))
 let cursor:string|undefined,notInspected=0
 do{
  const page=await bucket.list({cursor,include:['httpMetadata','customMetadata']})
  for(const object of page.objects){
   if(input.deleting.has(object.key))continue
   const own=owned.has(object.key),file=await db.prepare('SELECT id,media_type FROM evidence_files WHERE object_key=?').bind(object.key).first<{id:string;media_type:string}>()
   const meta=JSON.stringify([object.key,object.customMetadata,object.httpMetadata])
   const decoded=object.size<=INSPECTION_BUDGET?await inspect(bucket,object.key,file?.media_type):undefined
   if(decoded===null&&!own)continue
   if(!decoded){
    if(own)throw new AuthorityError('version_conflict',`Erasure cannot inspect R2 object ${await keyDigest(object.key)}: unsupported, corrupt or uninspectable attachment. Resolve its custody before erasure; no identity was erased.`,409)
    if(!found(meta)){notInspected++;continue}
   }
   const hay=[...decoded??[],meta]
   if(!hay.some(found))continue
   const whole=hay.some(value=>hasWholeToken(value,input.matches,input.others))
   if(whole&&own){erase.push({key:object.key,fileId:file?.id??null});continue}
   const store=file?`R2 file ${file.id}`:`R2 object ${await keyDigest(object.key)}`
   residual.push({store,rows:1,reason:whole?'not_attributed':input.others.some(other=>hay.some(value=>value.includes(other)))?'other_person':'inside_longer_word'})
  }
  cursor=page.truncated?page.cursor:undefined
 }while(cursor)
 return {erase,residual,notInspected}
}
/** Decoded text forms, `undefined` when the bytes cannot be inspected, `null` when the object is gone. */
async function inspect(bucket:R2Bucket,key:string,mediaType:string|undefined){
 const body=await bucket.get(key);if(!body)return null
 try{return attachmentText(new Uint8Array(await body.arrayBuffer()),body.httpMetadata?.contentType??mediaType??'',body.httpMetadata?.contentEncoding)}catch{return undefined}
}
/** Object keys can hold the identity itself, so refusals name a digest instead. */
async function keyDigest(key:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key)))].slice(0,8).map(byte=>byte.toString(16).padStart(2,'0')).join('')}
