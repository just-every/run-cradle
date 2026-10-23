/** ZIP32 STORE entries with data descriptors: only the central directory is retained. */
export type StreamEntry={name:string;body:AsyncIterable<Uint8Array>}
const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let bit=0;bit<8;bit++)c=(c>>>1)^(c&1?0xedb88320:0);return c>>>0})
const header=(size:number)=>{const bytes=new Uint8Array(size);return {bytes,view:new DataView(bytes.buffer)}}
export async function* streamZip(entries:AsyncIterable<StreamEntry>):AsyncGenerator<Uint8Array>{
 const directory:Uint8Array[]=[],names=new Set<string>();let offset=0,directorySize=0
 for await(const entry of entries){
  if(!entry.name||/[\\\x00]/.test(entry.name)||entry.name.startsWith('/')||entry.name.split('/').some(p=>!p||p==='..')||names.has(entry.name))throw Error('ZIP entries require safe unique names')
  names.add(entry.name);if(names.size>65535)throw Error('ZIP32 entry limit exceeded')
  const name=new TextEncoder().encode(entry.name),local=header(30+name.length),start=offset
  local.view.setUint32(0,0x04034b50,true);local.view.setUint16(4,20,true);local.view.setUint16(6,0x808,true);local.view.setUint16(26,name.length,true);local.bytes.set(name,30);yield local.bytes;offset+=local.bytes.length
  let crc=0xffffffff,size=0
  for await(const bytes of entry.body){size+=bytes.length;offset+=bytes.length;if(size>0xffffffff||offset>0xffffffff)throw Error('ZIP32 size limit exceeded');for(const byte of bytes)crc=(crc>>>8)^crcTable[(crc^byte)&255]!;yield bytes}
  crc=(crc^0xffffffff)>>>0
  const descriptor=header(16);descriptor.view.setUint32(0,0x08074b50,true);descriptor.view.setUint32(4,crc,true);descriptor.view.setUint32(8,size,true);descriptor.view.setUint32(12,size,true);yield descriptor.bytes;offset+=16
  const central=header(46+name.length);central.view.setUint32(0,0x02014b50,true);central.view.setUint16(4,20,true);central.view.setUint16(6,20,true);central.view.setUint16(8,0x808,true);central.view.setUint32(16,crc,true);central.view.setUint32(20,size,true);central.view.setUint32(24,size,true);central.view.setUint16(28,name.length,true);central.view.setUint32(42,start,true);central.bytes.set(name,46);directory.push(central.bytes);directorySize+=central.bytes.length
 }
 for(const bytes of directory)yield bytes
 const end=header(22);end.view.setUint32(0,0x06054b50,true);end.view.setUint16(8,directory.length,true);end.view.setUint16(10,directory.length,true);end.view.setUint32(12,directorySize,true);end.view.setUint32(16,offset,true);yield end.bytes
}
export function byteStream(iterator:AsyncIterator<Uint8Array>):ReadableStream<Uint8Array>{
 return new ReadableStream({async pull(controller){try{const next=await iterator.next();if(next.done)controller.close();else controller.enqueue(next.value)}catch(error){controller.error(error);await iterator.return?.()}},async cancel(){await iterator.return?.()}})
}
