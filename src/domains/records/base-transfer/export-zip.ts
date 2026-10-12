/** Small deterministic STORE ZIP writer. No compression workers or external runtime. */
export function zipFiles(files:{name:string;bytes:Uint8Array}[]):Uint8Array {
 const chunks:Uint8Array[]=[],directory:Uint8Array[]=[],names=new Set<string>();let offset=0,directorySize=0
 const header=(size:number)=>{const bytes=new Uint8Array(size);return {bytes,view:new DataView(bytes.buffer)}}
 for(const file of files){if(!file.name||/[\\/\x00]/.test(file.name)||names.has(file.name))throw new Error('ZIP entries require safe unique filenames');names.add(file.name);const name=new TextEncoder().encode(file.name),crc=crc32(file.bytes),local=header(30+name.length),central=header(46+name.length)
  local.view.setUint32(0,0x04034b50,true);local.view.setUint16(4,20,true);local.view.setUint16(6,0x800,true);local.view.setUint32(14,crc,true);local.view.setUint32(18,file.bytes.length,true);local.view.setUint32(22,file.bytes.length,true);local.view.setUint16(26,name.length,true);local.bytes.set(name,30)
  central.view.setUint32(0,0x02014b50,true);central.view.setUint16(4,20,true);central.view.setUint16(6,20,true);central.view.setUint16(8,0x800,true);central.view.setUint32(16,crc,true);central.view.setUint32(20,file.bytes.length,true);central.view.setUint32(24,file.bytes.length,true);central.view.setUint16(28,name.length,true);central.view.setUint32(42,offset,true);central.bytes.set(name,46)
  chunks.push(local.bytes,file.bytes);directory.push(central.bytes);offset+=local.bytes.length+file.bytes.length;directorySize+=central.bytes.length
 }
 const end=header(22);end.view.setUint32(0,0x06054b50,true);end.view.setUint16(8,files.length,true);end.view.setUint16(10,files.length,true);end.view.setUint32(12,directorySize,true);end.view.setUint32(16,offset,true)
 const result=new Uint8Array(offset+directorySize+22);let at=0;for(const bytes of [...chunks,...directory,end.bytes]){result.set(bytes,at);at+=bytes.length}return result
}
function crc32(bytes:Uint8Array):number {let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^(crc&1?0xedb88320:0)}return (crc^0xffffffff)>>>0}
