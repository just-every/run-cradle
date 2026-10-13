import {pdfEnvelope} from './pdf-envelope.server'
import {PdfSyntax,dictionary,integer,isName,isRef,isString,keys,valueText} from './pdf-syntax.server'
import type {PdfDict,PdfValue} from './pdf-syntax.server'
import {inflateSync} from 'node:zlib'
import {Buffer} from 'node:buffer'
const limit=32*1024*1024
const latin=(b:Uint8Array)=>Buffer.from(b.buffer,b.byteOffset,b.byteLength).toString('latin1')
const standardFont=/^(?:Helvetica(?:-Bold|-Oblique|-BoldOblique)?|Courier(?:-Bold|-Oblique|-BoldOblique)?|Times-(?:Roman|Bold|Italic|BoldItalic))$/
function array(value:PdfValue|undefined){if(!Array.isArray(value))throw new Error('unsupported PDF array');return value}
function numeric(values:PdfValue[],count:number){if(values.length!==count||values.some(v=>typeof v!=='number'))throw new Error('unsupported PDF numeric operands')}
/** Text-only content grammar. Unknown operators include inline images, drawing
 * paths, XObjects, marked content and extension operators: all are refused. */
function contentText(text:string,fonts:Set<string>){
 const parser=new PdfSyntax(text),out:string[]=[],glyphs:string[]=[];let operands:PdfValue[]=[],inText=false,font=false,saves=0
 const numbers:Record<string,number>={Td:2,TD:2,Tm:6,Tc:1,Tw:1,Tz:1,TL:1,Tr:1,Ts:1}
 const graphics:Record<string,number>={cm:6,g:1,G:1,rg:3,RG:3,k:4,K:4}
 function shown(value:PdfValue|undefined){
  if(!inText||!font||!isString(value)||value.fontText===undefined)throw new Error('uninspectable PDF text operand or glyph encoding')
  out.push(value.value);glyphs.push(value.fontText)
 }
 while(!parser.done()){
  if(/[\/(<\[+\-.\d]/.test(text[parser.at]!)){operands.push(parser.value());if(operands.length>100000)throw new Error('PDF operand inspection limit');continue}
  const op=parser.word()
  if(op==='BT'){if(inText||operands.length)throw new Error('invalid PDF text block');inText=true}
  else if(op==='ET'){if(!inText||operands.length)throw new Error('invalid PDF text block');inText=false}
  else if(op==='Tf'){
   if(!inText||operands.length!==2||!isName(operands[0])||!fonts.has(operands[0].value)||typeof operands[1]!=='number')throw new Error('uninspectable PDF font selection')
   font=true
  }else if(op==='Tj'||op==="'"){if(operands.length!==1)throw new Error('invalid PDF text operands');shown(operands[0])}
  else if(op==='"'){if(operands.length!==3)throw new Error('invalid PDF text operands');numeric(operands.slice(0,2),2);shown(operands[2])}
  else if(op==='TJ'){
   if(!inText||!font||operands.length!==1)throw new Error('invalid PDF text operands')
   for(const value of array(operands[0]))if(typeof value!=='number')shown(value)
  }else if(Object.hasOwn(numbers,op)){if(!inText)throw new Error('invalid PDF text state');numeric(operands,numbers[op]!)}
  else if(op==='T*'){if(!inText||operands.length)throw new Error('invalid PDF text state')}
  else if(Object.hasOwn(graphics,op))numeric(operands,graphics[op]!)
  else if(op==='q'){if(inText||operands.length||++saves>64)throw new Error('unsupported PDF graphics state')}
  else if(op==='Q'){if(inText||operands.length||!saves--)throw new Error('invalid PDF graphics state');font=false}
  else throw new Error('unsupported PDF content operator: '+op)
  operands=[]
 }
 if(operands.length||inText||saves)throw new Error('truncated PDF content')
 return {text:out,glyphs}
}
/** Accepted documents have a fully inspected classic object graph: catalog,
 * page tree, standard Type1 fonts, optional text Info, and raw/Flate text streams.
 * Whitelists are contextual; nothing unsupported is silently skipped. */
export function pdfText(bytes:Uint8Array):string[]{
 const file=latin(bytes),{objects,trailer}=pdfEnvelope(file),used=new Set<string>(),pages=new Set<string>(),out=[file],textRuns:string[]=[],glyphRuns:string[]=[];let total=0
 function resolve(value:PdfValue|undefined):PdfValue|undefined{
  if(!isRef(value))return value
  const object=objects.get(value.key);if(!object||object.stream!==undefined)throw new Error('invalid PDF dictionary reference')
  used.add(value.key);if(isRef(object.value))throw new Error('unsupported chained PDF reference')
  return object.value
 }
 function typed(dict:PdfDict,type:string){if(!isName(dict.get('Type'),type))throw new Error('unsupported PDF object type')}
 function resources(value:PdfValue|undefined):Set<string>{
  if(value===undefined)return new Set()
  const dict=dictionary(resolve(value));keys(dict,['Font','ProcSet'])
  if(dict.has('ProcSet'))for(const proc of array(resolve(dict.get('ProcSet'))))if(!isName(proc)||!['PDF','Text'].includes(proc.value))throw new Error('unsupported PDF resource procedure')
  const fonts=new Set<string>()
  if(dict.has('Font'))for(const [name,value]of dictionary(resolve(dict.get('Font')))){
   const font=dictionary(resolve(value));keys(font,['Type','Subtype','BaseFont','Encoding']);typed(font,'Font')
   if(!isName(font.get('Subtype'),'Type1')||!isName(font.get('BaseFont'))||!standardFont.test((font.get('BaseFont') as {value:string}).value))throw new Error('unsupported PDF base font')
   const encoding=font.get('Encoding');if(encoding!==undefined&&(!isName(encoding)||!['StandardEncoding','WinAnsiEncoding'].includes(encoding.value)))throw new Error('unsupported PDF font encoding')
   fonts.add(name)
  }
  return fonts
 }
 function stream(value:PdfValue,fonts:Set<string>){
  if(!isRef(value))throw new Error('unsupported direct PDF content stream')
  const object=objects.get(value.key);if(!object||object.stream===undefined)throw new Error('missing PDF content stream')
  used.add(value.key);const dict=dictionary(object.value);keys(dict,['Length','Filter','DecodeParms'])
  if(isRef(dict.get('Length')))resolve(dict.get('Length'))
  if(dict.has('DecodeParms')&&dict.get('DecodeParms')!==null)throw new Error('unsupported PDF decode parameters')
  let decoded:Uint8Array=Buffer.from(object.stream,'latin1')
  const filter=dict.get('Filter'),filters=filter===undefined?[]:Array.isArray(filter)?filter:[filter]
  if(filter!==undefined&&(!filters.length||filters.length>4))throw new Error('unsupported PDF filter chain')
  for(const f of filters){
   if(!isName(f)||!['FlateDecode','Fl'].includes(f.value))throw new Error('unsupported PDF stream filter')
   const inflated=inflateSync(decoded,{maxOutputLength:limit,info:true}) as unknown as {buffer:Uint8Array;engine:{bytesWritten:number}}
   if(inflated.engine.bytesWritten!==decoded.length)throw new Error('uninspectable trailing PDF compressed data')
   decoded=inflated.buffer;total+=decoded.length
   if(total>limit)throw new Error('decoded PDF exceeds inspection limit')
  }
  if(!filters.length)total+=decoded.length
  if(total>limit)throw new Error('decoded PDF exceeds inspection limit')
  const text=latin(decoded),content=contentText(text,fonts)
  out.push(text,...content.text,...content.glyphs);textRuns.push(...content.text);glyphRuns.push(...content.glyphs)
 }
 function pageTree(value:PdfValue|undefined,parent:string|undefined,inheritedFonts:Set<string>,inheritedBox:boolean,depth=0):number{
  if(!isRef(value)||pages.has(value.key)||depth>64)throw new Error('invalid PDF page tree')
  pages.add(value.key);const dict=dictionary(resolve(value)),type=dict.get('Type')
  if(!isName(type)||!['Pages','Page'].includes(type.value))throw new Error('unsupported PDF page type')
  keys(dict,type.value==='Pages'?['Type','Parent','Kids','Count','Resources','MediaBox']:['Type','Parent','Resources','MediaBox','Contents'])
  const actualParent=dict.get('Parent')
  if(parent===undefined?actualParent!==undefined:!isRef(actualParent)||actualParent.key!==parent)throw new Error('invalid PDF page parent')
  const fonts=dict.has('Resources')?resources(dict.get('Resources')):inheritedFonts
  if(dict.has('MediaBox'))numeric(array(dict.get('MediaBox')),4)
  const box=inheritedBox||dict.has('MediaBox')
  if(type.value==='Pages'){
   let count=0;for(const kid of array(dict.get('Kids')))count+=pageTree(kid,value.key,fonts,box,depth+1)
   if(integer(dict.get('Count'))!==count)throw new Error('invalid PDF page count')
   return count
  }
  if(!box)throw new Error('missing PDF media box')
  const contents=dict.get('Contents')
  if(contents!==undefined)for(const part of Array.isArray(contents)?contents:[contents])stream(part,fonts)
  return 1
 }
 const catalog=dictionary(resolve(trailer.get('Root')));keys(catalog,['Type','Pages']);typed(catalog,'Catalog')
 pageTree(catalog.get('Pages'),undefined,new Set(),false)
 if(trailer.has('Info')){
  const info=dictionary(resolve(trailer.get('Info')));keys(info,['Title','Author','Subject','Keywords','Creator','Producer','CreationDate','ModDate'])
  for(const value of info.values()){if(!isString(value))throw new Error('unsupported PDF metadata');out.push(value.value)}
 }
 if(used.size!==objects.size)throw new Error('uninspectable unreferenced PDF objects')
 for(const object of objects.values())out.push(...valueText(object.value))
 out.push(...valueText(trailer),textRuns.join(''),textRuns.join(' '),glyphRuns.join(''),glyphRuns.join(' '))
 // StandardEncoding has curly quote glyphs at the ASCII quote positions. Scan
 // both forms, including identities split across text operators or streams.
 const quotes=[...textRuns,...glyphRuns,textRuns.join(''),textRuns.join(' '),glyphRuns.join(''),glyphRuns.join(' ')]
 out.push(...quotes.map(s=>s.replaceAll("'",'’').replaceAll('`','‘')))
 return out
}
