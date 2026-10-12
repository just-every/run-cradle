import { ImportInputError } from './input-error'
import { cellCharacters,limit } from './format'
export const SOURCE_LIMITS={csvImportBytes:10*1024*1024,csvImportRows:10000,tables:20,fields:80,cellCharacters:100000} as const
export type CsvRows={headers:string[];rows:{cells:string[];line:number}[]}
/** Strict RFC4180 state machine; CRLF counts as one physical line, even within quotes. */
export function parseBaseCsv(bytes:Uint8Array,filename:string,maxColumns=SOURCE_LIMITS.fields as number):CsvRows {
 limit('csvImportBytes',SOURCE_LIMITS.csvImportBytes,bytes.byteLength,filename,1)
 let text:string
 try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{throw new ImportInputError(`${filename} LINE ${invalidUtf8Line(bytes)}: Invalid UTF-8`)}
 const rows:{cells:string[];line:number}[]=[],cells:string[]=[];let cell='',line=1,startLine=1,state:'start'|'plain'|'quoted'|'closed'='start'
 const fail=(message:string):never=>{throw new ImportInputError(`${filename} LINE ${line}: ${message}`)}
 const pushCell=()=>{limit('cellCharacters',SOURCE_LIMITS.cellCharacters,cellCharacters(cell),filename,startLine);cells.push(cell);cell='';state='start'}
 const pushRow=()=>{pushCell();rows.push({cells:cells.splice(0),line:startLine});limit('csvImportRows',SOURCE_LIMITS.csvImportRows,rows.length-1,filename,startLine)}
 for(let i=0;i<text.length;i++){
  const c=text[i],newline=c==='\r'||c==='\n',crlf=c==='\r'&&text[i+1]==='\n'
  if(state==='quoted'){
   if(c==='"'){if(text[i+1]==='"'){cell+='"';i++}else state='closed'}
   else {cell+=c;if(newline){if(crlf){cell+='\n';i++}line++}}
   continue
  }
  if(newline){pushRow();if(crlf)i++;line++;startLine=line;continue}
  if(c===','){pushCell();continue}
  if(state==='closed')fail('Unexpected character after closing quote')
  if(c==='"'){if(state!=='start')fail('Unexpected quote');state='quoted';continue}
  cell+=c;state='plain'
 }
 if(state==='quoted')fail('Unterminated quote')
 if(cell!==''||cells.length||state!=='start')pushRow()
 if(!rows.length)fail('Missing header row')
 const headers=rows.shift()!.cells
 limit(maxColumns===SOURCE_LIMITS.fields?'fields':'csvColumns',maxColumns,headers.length,filename,1)
 if(headers.some(h=>!h.trim()))throw new ImportInputError(`${filename} LINE 1: Empty header`)
 if(new Set(headers).size!==headers.length)throw new ImportInputError(`${filename} LINE 1: Duplicate header`)
 for(const row of rows)if(row.cells.length!==headers.length)throw new ImportInputError(`${filename} LINE ${row.line}: Ragged row: expected ${headers.length} fields, received ${row.cells.length}`)
 return {headers,rows}
}
/** Inner link list uses CSV quoting too. Whitespace is identity, never a delimiter decoration. */
export function parseLinkCell(raw:string):string[] {
 if(raw==='')return []
 const refs:string[]=[];let value='',quoted=false,closed=false,start=true
 for(let i=0;i<raw.length;i++){
  const c=raw[i]
  if(quoted){if(c==='"'){if(raw[i+1]==='"'){value+='"';i++}else{quoted=false;closed=true}}else value+=c;continue}
  if(c===','){refs.push(value);value='';closed=false;start=true;continue}
  if(closed)throw new ImportInputError('Unexpected character after quoted link reference')
  if(c==='"'){if(!start)throw new ImportInputError('Unexpected quote in link reference');quoted=true;start=false;continue}
  if(c==='\r'||c==='\n')throw new ImportInputError('Quote embedded newlines in link references')
  value+=c;start=false
 }
 if(quoted)throw new ImportInputError('Unterminated quoted link reference')
 refs.push(value);return refs
}

function invalidUtf8Line(bytes:Uint8Array):number {
 let line=1
 for(let i=0;i<bytes.length;i++){
  const c=bytes[i]
  if(c===13){line++;if(bytes[i+1]===10)i++;continue}if(c===10){line++;continue}if(c<128)continue
  const width=c>=0xc2&&c<=0xdf?2:c>=0xe0&&c<=0xef?3:c>=0xf0&&c<=0xf4?4:0
  if(!width||i+width>bytes.length)return line
  for(let j=1;j<width;j++)if(bytes[i+j]<0x80||bytes[i+j]>0xbf)return line
  if(c===0xe0&&bytes[i+1]<0xa0||c===0xed&&bytes[i+1]>0x9f||c===0xf0&&bytes[i+1]<0x90||c===0xf4&&bytes[i+1]>0x8f)return line
  i+=width-1
 }return line
}
