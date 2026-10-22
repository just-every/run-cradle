import {inflateRawSync} from 'node:zlib'
import {ImportInputError} from '../base-transfer/input-error'
import {crc32} from '../base-transfer/export-zip'
export const workbookLimits={bytes:10485760,expandedBytes:20971520,entries:256,sheets:20,rows:10000,columns:80,ratio:100}
export function reject(message:string):never{throw new ImportInputError(message)}
export function bound(name:keyof typeof workbookLimits,current:number){if(current>workbookLimits[name])reject(`Workbook ${name} limit ${workbookLimits[name]}; current ${current}. Split the workbook before importing.`)}
export function unzipWorkbook(bytes:Uint8Array,filename:string){
 bound('bytes',bytes.length)
 if(/\.xlsm$/i.test(filename))reject('Macro-enabled workbooks are not supported. Save a macro-free .xlsx copy.')
 if(bytes[0]===0xd0&&bytes[1]===0xcf)reject('Encrypted or legacy Excel workbooks are not supported. Save an unencrypted .xlsx copy.')
 if(!/\.xlsx$/i.test(filename))reject('Choose an unencrypted .xlsx workbook.')
 if(bytes.length<22)reject('Malformed workbook ZIP. Save a fresh .xlsx copy.');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),decoder=new TextDecoder('utf-8',{fatal:true}),u16=(at:number)=>view.getUint16(at,true),u32=(at:number)=>view.getUint32(at,true)
 let end=-1;for(let at=bytes.length-22;at>=Math.max(0,bytes.length-65557);at--)if(u32(at)===0x06054b50&&at+22+u16(at+20)===bytes.length){end=at;break}
 if(end<0)reject('Malformed .xlsx ZIP directory. Re-save the workbook.')
 if(u16(end+4)||u16(end+6)||u16(end+8)!==u16(end+10))reject('Multi-volume workbooks are not supported.')
 const count=u16(end+10),size=u32(end+12),offset=u32(end+16);bound('entries',count)
 if(offset+size!==end)reject('Malformed workbook directory bounds.')
 const files=new Map<string,Uint8Array>();let at=offset,total=0
 try{for(let i=0;i<count;i++){
  if(u32(at)!==0x02014b50)reject('Malformed workbook entry.')
  const flags=u16(at+8),method=u16(at+10),crc=u32(at+16),compressed=u32(at+20),expanded=u32(at+24),nameLength=u16(at+28),extra=u16(at+30),comment=u16(at+32),local=u32(at+42),name=decoder.decode(bytes.subarray(at+46,at+46+nameLength));at+=46+nameLength+extra+comment
  if(flags&1||flags&64)reject('Encrypted workbooks are not supported. Remove the workbook password and save .xlsx.')
  if(![0,8].includes(method)||name.startsWith('/')||name.split('/').some(part=>part==='..')||/[\\\x00]/.test(name)||files.has(name))reject('Unsupported or unsafe workbook ZIP entry.')
  if(/vbaProject|\.bin$|macroEnabled/i.test(name))reject('Macro-enabled workbooks are not supported. Save a macro-free .xlsx copy.')
  total+=expanded;bound('expandedBytes',total);bound('ratio',expanded/Math.max(1,compressed))
  if(local+30>offset||u32(local)!==0x04034b50||u16(local+8)!==method||u16(local+6)!==flags||decoder.decode(bytes.subarray(local+30,local+30+u16(local+26)))!==name)reject('Malformed workbook local entry.')
  const start=local+30+u16(local+26)+u16(local+28);if(start+compressed>offset)reject('Workbook entry exceeds archive bounds.')
  const data=bytes.subarray(start,start+compressed),result=method===0?data:new Uint8Array(inflateRawSync(data,{maxOutputLength:Math.min(expanded+1,workbookLimits.expandedBytes)}))
  if(result.length!==expanded||crc32(result)!==crc)reject('Workbook entry checksum or size is invalid. Re-save the workbook.')
  files.set(name,result)
 }if(at!==end)reject('Malformed workbook directory length.')}catch(error){if(error instanceof ImportInputError)throw error;reject('Malformed .xlsx ZIP. Re-save an unencrypted workbook.')}
 return files
}
