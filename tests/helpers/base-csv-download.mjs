import assert from 'node:assert/strict'
/** Independent ZIP32 STORE reader, including streamed entries with data descriptors. */
export function csvDownloadEntries(bytes){
 const data=Buffer.from(bytes),entries=[],decoder=new TextDecoder('utf-8',{fatal:true})
 const crc=body=>{let sum=0xffffffff;for(const byte of body){sum^=byte;for(let bit=0;bit<8;bit++)sum=(sum>>>1)^((sum&1)?0xedb88320:0)}return (sum^0xffffffff)>>>0}
 assert.ok(data.length>=22)
 let end=-1
 for(let at=data.length-22;at>=Math.max(0,data.length-65557);at--)if(data.readUInt32LE(at)===0x06054b50&&at+22+data.readUInt16LE(at+20)===data.length){end=at;break}
 assert.ok(end>=0,'ZIP end directory exists');assert.equal(data.readUInt16LE(end+4),0);assert.equal(data.readUInt16LE(end+6),0)
 const count=data.readUInt16LE(end+10),directory=data.readUInt32LE(end+16),size=data.readUInt32LE(end+12)
 assert.equal(data.readUInt16LE(end+8),count);assert.equal(directory+size,end)
 let at=directory,expectedOffset=0
 for(let index=0;index<count;index++){
  assert.equal(data.readUInt32LE(at),0x02014b50)
  const flags=data.readUInt16LE(at+8),length=data.readUInt16LE(at+28),extra=data.readUInt16LE(at+30),comment=data.readUInt16LE(at+32),local=data.readUInt32LE(at+42),size=data.readUInt32LE(at+24),checksum=data.readUInt32LE(at+16),name=decoder.decode(data.subarray(at+46,at+46+length))
  assert.equal(flags&~0x808,0);assert.equal(data.readUInt16LE(at+10),0);assert.equal(data.readUInt32LE(at+20),size);assert.equal(local,expectedOffset);assert.doesNotMatch(name,/[\\/]|^\.\./)
  assert.equal(data.readUInt32LE(local),0x04034b50);assert.equal(data.readUInt16LE(local+6),flags);assert.equal(data.readUInt16LE(local+8),0)
  const localLength=data.readUInt16LE(local+26),localExtra=data.readUInt16LE(local+28),start=local+30+localLength+localExtra
  assert.equal(decoder.decode(data.subarray(local+30,local+30+localLength)),name)
  const body=data.subarray(start,start+size);assert.equal(body.length,size);assert.equal(crc(body),checksum)
  expectedOffset=start+size
  if(flags&8){assert.equal(data.readUInt32LE(expectedOffset),0x08074b50);assert.equal(data.readUInt32LE(expectedOffset+4),checksum);assert.equal(data.readUInt32LE(expectedOffset+8),size);assert.equal(data.readUInt32LE(expectedOffset+12),size);expectedOffset+=16}
  else{assert.equal(data.readUInt32LE(local+14),checksum);assert.equal(data.readUInt32LE(local+18),size);assert.equal(data.readUInt32LE(local+22),size)}
  entries.push({name,bytes:body});at+=46+length+extra+comment
 }
 assert.equal(expectedOffset,directory);assert.equal(at,end);assert.equal(new Set(entries.map(entry=>entry.name)).size,entries.length)
 return entries
}
