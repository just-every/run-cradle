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
/** Rewrites whole-token occurrences only; masked spans (other people's names) are copied unchanged. */
export function scrubWholeTokens(text:string,literals:readonly string[],label:string,masks:readonly string[]){
 const ordered=replacementOrder(literals),guards=replacementOrder(masks);let out='',i=0,changed=0
 while(i<text.length){
  const mask=guards.find(m=>text.startsWith(m,i));if(mask){out+=mask;i+=mask.length;continue}
  const literal=ordered.find(l=>text.startsWith(l,i)&&isWholeToken(text,i,l.length))
  if(literal){out+=label;i+=literal.length;changed++;continue}
  out+=text[i];i++
 }
 return {text:out,changed}
}
