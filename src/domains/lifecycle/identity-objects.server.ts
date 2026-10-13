import {attachmentText} from './attachment-text.server'
import {AuthorityError} from '../authority/errors'
import {STAGING_ENTITY} from '../evidence/staging.server'
import {scrubWholeTokens} from './identity-match'
import type {IdentityCopy} from './identity-redaction.server'
/** R2 objects are deleted only through ownership: a file in the person's own private source
 * intake whose bytes, key or metadata carry their identity as a whole token. Every other
 * object that contains the literal is reported as a copy to resolve and is never deleted.
 */
export async function classifyIdentityObjects(db:D1Database,bucket:R2Bucket,input:{personId:string;matches:string[];label:string;others:string[]}){
 const owned=new Set((await db.prepare('SELECT f.object_key FROM evidence_files f JOIN evidence_staging s ON s.id=f.record_id WHERE f.entity_id=? AND s.owner_id=?').bind(STAGING_ENTITY,input.personId).all<{object_key:string}>()).results.map(row=>row.object_key))
 const erase:{key:string;fileId:string|null}[]=[],residual:IdentityCopy[]=[]
 let cursor:string|undefined
 do{
  const page=await bucket.list({cursor})
  for(const object of page.objects){
   const body=await bucket.get(object.key);if(!body)throw new AuthorityError('version_conflict',`Erasure cannot inspect missing R2 object ${await keyDigest(object.key)}; no identity was erased.`,409)
   const file=await db.prepare('SELECT id,media_type FROM evidence_files WHERE object_key=?').bind(object.key).first<{id:string;media_type:string}>()
   let decoded:string[]
   try{decoded=attachmentText(new Uint8Array(await body.arrayBuffer()),body.httpMetadata?.contentType??file?.media_type??'',body.httpMetadata?.contentEncoding)}catch{throw new AuthorityError('version_conflict',`Erasure cannot inspect R2 object ${await keyDigest(object.key)}: unsupported, corrupt or uninspectable attachment. Resolve its custody before erasure; no identity was erased.`,409)}
   const hay=[...decoded,JSON.stringify([object.key,body.customMetadata,body.httpMetadata])]
   if(!hay.some(value=>input.matches.some(match=>value.includes(match))))continue
   const whole=hay.some(value=>scrubWholeTokens(value,input.matches,input.label,input.others).changed>0)
   if(whole&&owned.has(object.key)){erase.push({key:object.key,fileId:file?.id??null});continue}
   const store=file?`R2 file ${file.id}`:`R2 object ${await keyDigest(object.key)}`
   residual.push({store,rows:1,reason:whole?'not_attributed':input.others.some(other=>hay.some(value=>value.includes(other)))?'other_person':'inside_longer_word'})
  }
  cursor=page.truncated?page.cursor:undefined
 }while(cursor)
 return {erase,residual}
}
/** Object keys can hold the identity itself, so refusals name a digest instead. */
async function keyDigest(key:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key)))].slice(0,8).map(byte=>byte.toString(16).padStart(2,'0')).join('')}
