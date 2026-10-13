export type PdfName={kind:'name';value:string}
export type PdfString={kind:'string';value:string;fontText?:string}
export type PdfRef={kind:'ref';key:string}
export type PdfDict=Map<string,PdfValue>
export type PdfValue=number|boolean|null|PdfName|PdfString|PdfRef|PdfDict|PdfValue[]
const white=(c:string|undefined)=>c!==undefined&&/[\x00\t\n\f\r ]/.test(c)
const delimiter=(c:string|undefined)=>c===undefined||white(c)||'()<>[]{}/%'.includes(c)
export const isName=(value:PdfValue|undefined,name?:string):value is PdfName=>!!value&&typeof value==='object'&&'kind'in value&&value.kind==='name'&&(name===undefined||value.value===name)
export const isString=(value:PdfValue|undefined):value is PdfString=>!!value&&typeof value==='object'&&'kind'in value&&value.kind==='string'
export const isRef=(value:PdfValue|undefined):value is PdfRef=>!!value&&typeof value==='object'&&'kind'in value&&value.kind==='ref'
export function dictionary(value:PdfValue|undefined):PdfDict{
 if(!(value instanceof Map))throw new Error('unsupported PDF dictionary')
 return value
}
export function keys(dict:PdfDict,allowed:readonly string[]){
 for(const key of dict.keys())if(!allowed.includes(key))throw new Error('unsupported PDF dictionary field: '+key)
}
export function integer(value:PdfValue|undefined):number{
 if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw new Error('invalid PDF integer')
 return value
}
export function valueText(value:PdfValue):string[]{
 if(isName(value)||isString(value))return [value.value]
 if(value instanceof Map)return [...value].flatMap(([key,entry])=>[key,...valueText(entry)])
 if(Array.isArray(value))return value.flatMap(valueText)
 return []
}
function stringText(bytes:number[]):PdfString{
 const data=new Uint8Array(bytes)
 const bom=data[0]===254&&data[1]===255?'utf-16be':data[0]===255&&data[1]===254?'utf-16le':undefined
 if(bom){
  const value=new TextDecoder(bom,{fatal:true}).decode(data.subarray(2)),codes=bytes.slice(2)
  // A BOM identifies a PDF text string, not a Type1 glyph encoding. Retain the
  // printable glyph bytes too; otherwise hex UTF16 can hide an ASCII identity.
  const inspectable=codes.every(b=>b===0||b>=32&&b<=126)
  return {kind:'string',value,...inspectable?{fontText:new TextDecoder().decode(new Uint8Array(codes.filter(b=>b!==0)))}:{}}
 }
 if(bytes.some(b=>b>127||b===0))throw new Error('unsupported PDF string encoding')
 const value=new TextDecoder('utf-8',{fatal:true}).decode(data)
 return {kind:'string',value,...bytes.every(b=>b>=32&&b<=126)?{fontText:value}:{}}
}
/** One lexer for objects, dictionaries and content. Comments are separators;
 * names are decoded before comparison; duplicate decoded keys are refused. */
export class PdfSyntax{
 at:number
 private tokens=0
 constructor(readonly text:string,start=0,readonly end=text.length){this.at=start}
 skip(){
  while(this.at<this.end){
   if(white(this.text[this.at]))this.at++
   else if(this.text[this.at]==='%'){while(this.at<this.end&&!/[\r\n]/.test(this.text[this.at]!))this.at++}
   else break
  }
 }
 done(){this.skip();return this.at===this.end}
 private count(){if(++this.tokens>1000000)throw new Error('PDF token inspection limit')}
 word(expected?:string):string{
  this.skip();this.count();const start=this.at
  while(this.at<this.end&&!delimiter(this.text[this.at]))this.at++
  const value=this.text.slice(start,this.at)
  if(!value||expected!==undefined&&value!==expected)throw new Error('unsupported PDF token')
  return value
 }
 hasWord(word:string){this.skip();return this.text.startsWith(word,this.at)&&this.at+word.length<=this.end&&delimiter(this.text[this.at+word.length])}
 number(){const word=this.word();if(!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(word))throw new Error('invalid PDF number');const value=Number(word);if(!Number.isFinite(value))throw new Error('invalid PDF number');return value}
 value(depth=0):PdfValue{
  this.skip();this.count();if(depth>64||this.at>=this.end)throw new Error('PDF nesting or truncation limit')
  const c=this.text[this.at]!
  if(c==='/'){
   this.at++;let value=''
   while(this.at<this.end&&!delimiter(this.text[this.at])){
    let byte=this.text.charCodeAt(this.at++)
    if(byte===35){const hex=this.text.slice(this.at,this.at+2);if(this.at+2>this.end||!/^[\da-f]{2}$/i.test(hex))throw new Error('invalid PDF name escape');byte=parseInt(hex,16);this.at+=2}
    if(byte<32||byte>126)throw new Error('unsupported PDF name encoding')
    value+=String.fromCharCode(byte)
   }
   if(!value)throw new Error('unsupported empty PDF name')
   return {kind:'name',value}
  }
  if(c==='('){
   this.at++;const bytes:number[]=[];let nesting=1
   while(this.at<this.end&&nesting){
    const ch=this.text[this.at++]!
    if(ch==='\\'){
     if(this.at>=this.end)throw new Error('truncated PDF escape')
     const next=this.text[this.at++]!
     if(/[0-7]/.test(next)){let octal=next;for(let n=0;n<2&&this.at<this.end&&/[0-7]/.test(this.text[this.at]!);n++)octal+=this.text[this.at++];bytes.push(parseInt(octal,8)&255)}
     else if(next==='\r'){if(this.text[this.at]==='\n')this.at++}
     else if(next!=='\n')bytes.push(({n:10,r:13,t:9,b:8,f:12} as Record<string,number>)[next]??next.charCodeAt(0))
    }else if(ch==='('){if(++nesting>64)throw new Error('PDF string nesting limit');bytes.push(40)}
    else if(ch===')'){if(--nesting)bytes.push(41)}
    else if(ch==='\r'){if(this.text[this.at]==='\n')this.at++;bytes.push(10)}
    else bytes.push(ch.charCodeAt(0))
   }
   if(nesting)throw new Error('unterminated PDF string')
   return stringText(bytes)
  }
  if(c==='<'&&this.text[this.at+1]!=='<'){
   this.at++;let hex=''
   while(this.at<this.end&&this.text[this.at]!=='>'){const ch=this.text[this.at++]!;if(white(ch))continue;if(!/[\da-f]/i.test(ch))throw new Error('invalid PDF hex string');hex+=ch}
   if(this.at>=this.end)throw new Error('unterminated PDF hex string');this.at++
   if(hex.length%2)hex+='0'
   const bytes:number[]=[];for(let i=0;i<hex.length;i+=2)bytes.push(parseInt(hex.slice(i,i+2),16))
   return stringText(bytes)
  }
  if(c==='['){this.at++;const values:PdfValue[]=[];while(true){this.skip();if(this.text[this.at]===']'){this.at++;return values}values.push(this.value(depth+1))}}
  if(c==='<'&&this.text[this.at+1]==='<'){
   this.at+=2;const dict:PdfDict=new Map()
   while(true){
    this.skip();if(this.text.startsWith('>>',this.at)){this.at+=2;return dict}
    const key=this.value(depth+1)
    if(!isName(key)||dict.has(key.value))throw new Error('invalid or duplicate PDF dictionary key')
    dict.set(key.value,this.value(depth+1))
   }
  }
  if(/[+\-.\d]/.test(c)){
   const number=this.number(),end=this.at
   // A reference is exactly two unsigned integers followed by the R token.
   if(Number.isSafeInteger(number)&&number>=0){
    this.skip()
    if(/\d/.test(this.text[this.at]??'')){
     const generation=this.number()
     if(Number.isSafeInteger(generation)&&generation>=0&&this.hasWord('R')){this.word('R');return {kind:'ref',key:`${number} ${generation}`}}
    }
   }
   this.at=end;return number
  }
  const word=this.word()
  if(word==='null')return null
  if(word==='true'||word==='false')return word==='true'
  throw new Error('unsupported PDF value')
 }
}
