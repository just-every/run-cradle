import { createHash } from 'node:crypto'

/** The Kit's canonical JSON order and escaping, emitted without ever joining a
 * complete source/preview. String slices keep surrogate pairs together so UTF-8
 * hashing is identical to hashing the Kit's complete canonical string. */
export function* canonicalChunks(value:unknown):Generator<string> {
 const active=new Set<object>()
 function* string(text:string):Generator<string> {
  yield '"'
  for(let start=0;start<text.length;){
   let end=Math.min(start+4096,text.length)
   const last=text.charCodeAt(end-1)
   if(end<text.length&&last>=0xd800&&last<=0xdbff)end--
   yield JSON.stringify(text.slice(start,end)).slice(1,-1);start=end
  }
  yield '"'
 }
 function* visit(item:unknown,depth:number):Generator<string> {
  if(typeof item==='string'){yield* string(item);return}
  if(item===null||typeof item==='boolean'||typeof item==='number'&&Number.isFinite(item)){yield JSON.stringify(item);return}
  if(!item||typeof item!=='object'||!Array.isArray(item)&&Object.getPrototypeOf(item)!==Object.prototype&&Object.getPrototypeOf(item)!==null)throw new Error('INVALID_JSON: durable values must be finite JSON')
  if(depth>=256||active.has(item))throw new Error('INVALID_JSON: cyclic or excessively nested durable value')
  active.add(item)
  if(Array.isArray(item)){
   yield '['
   for(let i=0;i<item.length;i++){if(i)yield ',';yield* visit(item[i],depth+1)}
   yield ']'
  }else{
   yield '{';let first=true
   for(const key of Object.keys(item).sort()){if(!first)yield ',';first=false;yield* string(key);yield ':';yield* visit((item as Record<string,unknown>)[key],depth+1)}
   yield '}'
  }
  active.delete(item)
 }
 yield* visit(value,0)
}
export function canonicalHash(value:unknown):string {
 const hash=createHash('sha256')
 for(const chunk of canonicalChunks(value))hash.update(chunk)
 return hash.digest('hex')
}
