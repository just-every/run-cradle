import type {InspectionBudget} from './inspection-budget.server'
import {PdfSyntax,dictionary,integer,isRef,keys} from './pdf-syntax.server'
import type {PdfValue} from './pdf-syntax.server'
export type PdfObject={value:PdfValue;stream?:string}
/** Every byte outside comments/whitespace belongs to one indexed object or the
 * one classic xref/trailer. No recovery, incremental revision or unindexed data. */
export function pdfEnvelope(file:string,budget:InspectionBudget){
 const header=/^%PDF-1\.[0-7](?:\r\n|\r|\n)/.exec(file)
 if(!header)throw new Error('unsupported PDF version')
 const ending=/startxref[\x00\t\n\f\r ]+(\d+)[\x00\t\n\f\r ]+%%EOF[\x00\t\n\f\r ]*$/.exec(file)
 if(!ending)throw new Error('corrupt PDF trailer')
 const offset=Number(ending[1])
 if(!Number.isSafeInteger(offset)||offset<header[0].length||offset>=ending.index)throw new Error('invalid PDF xref offset')
 const xref=new PdfSyntax(file,budget,offset);xref.word('xref')
 const indexed=new Map<string,number>(),ids=new Set<number>(),offsets=new Set<number>();let largest=0
 while(!xref.hasWord('trailer')){
  const start=integer(xref.number()),count=integer(xref.number())
  if(!count||start+count>100000)throw new Error('PDF object inspection limit')
  for(let i=0;i<count;i++){
   const id=start+i,at=integer(xref.number()),generation=integer(xref.number()),state=xref.word()
   if(ids.has(id)||generation>65535||state!=='f'&&state!=='n'||id===0&&state!=='f')throw new Error('ambiguous PDF xref entry')
   ids.add(id);largest=Math.max(largest,id)
   if(state==='f')continue
   if(at<header[0].length||at>=offset||offsets.has(at))throw new Error('invalid PDF object offset')
   offsets.add(at);indexed.set(`${id} ${generation}`,at)
  }
 }
 xref.word('trailer');const trailer=dictionary(xref.value());keys(trailer,['Size','Root','Info'])
 if(integer(trailer.get('Size'))!==largest+1||ids.size!==largest+1||!ids.has(0)||!isRef(trailer.get('Root')))throw new Error('corrupt PDF root or size')
 xref.word('startxref');if(integer(xref.number())!==offset||!/^[\x00\t\n\f\r ]+%%EOF[\x00\t\n\f\r ]*$/.test(file.slice(xref.at)))throw new Error('corrupt PDF ending')
 const ordered=[...indexed].sort((a,b)=>a[1]-b[1]),bounds=new Map<string,{start:number;end:number}>()
 ordered.forEach(([key,start],i)=>bounds.set(key,{start,end:ordered[i+1]?.[1]??offset}))
 if(!new PdfSyntax(file,budget,header[0].length,ordered[0]?.[1]??offset).done())throw new Error('unindexed PDF content')
 function reader(key:string){
  const span=bounds.get(key);if(!span)throw new Error('missing PDF reference')
  const parser=new PdfSyntax(file,budget,span.start,span.end)
  const id=integer(parser.number()),generation=integer(parser.number());parser.word('obj')
  if(`${id} ${generation}`!==key)throw new Error('corrupt PDF object identity')
  return parser
 }
 function streamLength(value:PdfValue|undefined){
  if(!isRef(value))return integer(value)
  const parser=reader(value.key),length=integer(parser.value());parser.word('endobj')
  if(!parser.done())throw new Error('ambiguous PDF stream length')
  return length
 }
 const objects=new Map<string,PdfObject>()
 for(const [key]of ordered){
  const parser=reader(key),value=parser.value();let stream:string|undefined
  if(parser.hasWord('stream')){
   const dict=dictionary(value),length=streamLength(dict.get('Length'));parser.word('stream')
   const newline=/^(?:\r\n|\n|\r)/.exec(file.slice(parser.at,parser.at+2))
   if(!newline)throw new Error('unsupported PDF stream delimiter')
   parser.at+=newline[0].length
   if(length>parser.end-parser.at)throw new Error('corrupt PDF stream length')
   stream=file.slice(parser.at,parser.at+length);parser.at+=length
   const endline=/^(?:\r\n|\n|\r)/.exec(file.slice(parser.at,parser.at+2));if(endline)parser.at+=endline[0].length
   // Do not skip bytes at this boundary: Length must cover the exact payload.
   if(!file.startsWith('endstream',parser.at))throw new Error('corrupt PDF stream boundary')
   parser.word('endstream')
  }
  parser.word('endobj');if(!parser.done())throw new Error('unindexed or ambiguous PDF object content')
  objects.set(key,{value,...stream===undefined?{}:{stream}})
 }
 return {objects,trailer}
}
