/** Whole-token identity matching for per-row rewrites; identity-redaction.server.ts holds its SQL form.
 * A literal is a whole token only when it is not adjacent to a word character and not
 * joined to one by `.`, `-`, `+` or `@` (so `Mark` is not in `Marketing`, `Jo Lee` is not
 * in `Jo Leeds`, `Ann` is not in `Mary-Ann`). Anything outside ASCII punctuation and the
 * general-punctuation block counts as a word character, so uncertain cases refuse rather
 * than rewrite.
 */
const JOIN='.+@-'
// Units, not code points: an astral character's surrogates both count as word characters.
const word=/[A-Za-z0-9_\u00C0-\u1FFF\u2070-\uFFFF]/
const joiner=(c:string|undefined)=>c!==undefined&&JOIN.includes(c)
const isWord=(c:string|undefined)=>c!==undefined&&word.test(c)
export function isWholeToken(text:string,start:number,length:number){
 const before=text[start-1],after=text[start+length]
 if(isWord(before)||(joiner(before)&&isWord(text[start-2])))return false
 return !(isWord(after)||(joiner(after)&&isWord(text[start+length+1])))
}
/** Literals in replacement order: longer first so a name inside its own email is consumed with the email. */
export const replacementOrder=(literals:readonly string[])=>[...new Set(literals)].filter(Boolean).sort((a,b)=>b.length-a.length)
/** Whole-token literal occurrences in scan order; masked spans (other people's names) are skipped. */
function* wholeTokens(text:string,literals:readonly string[],masks:readonly string[]){
 const ordered=replacementOrder(literals),guards=replacementOrder(masks),all=[...ordered,...guards],next=all.map(()=>-1);let i=0
 while(i<text.length){
  // Jump to the nearest start of any literal or mask; nothing between can match.
  for(const [k,value] of all.entries())if(next[k]!==text.length&&next[k]!<i){const at=text.indexOf(value,i);next[k]=at<0?text.length:at}
  i=Math.min(text.length,...next);if(i===text.length)break
  const mask=guards.find(m=>text.startsWith(m,i));if(mask){i+=mask.length;continue}
  const literal=ordered.find(l=>text.startsWith(l,i)&&isWholeToken(text,i,l.length))
  if(literal){yield {start:i,length:literal.length};i+=literal.length;continue}
  i++
 }
}
/** Rewrites whole-token occurrences only; masked spans (other people's names) are copied unchanged. */
export function scrubWholeTokens(text:string,literals:readonly string[],label:string,masks:readonly string[]){
 const parts:string[]=[];let at=0,changed=0
 for(const token of wholeTokens(text,literals,masks)){parts.push(text.slice(at,token.start),label);at=token.start+token.length;changed++}
 parts.push(text.slice(at))
 return {text:parts.join(''),changed}
}
/** Detection without building a rewritten copy (attachments can be megabytes). */
export const hasWholeToken=(text:string,literals:readonly string[],masks:readonly string[])=>!wholeTokens(text,literals,masks).next().done
