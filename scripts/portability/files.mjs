import {open,mkdir,link,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname} from 'node:path';
import {Readable} from 'node:stream';
import {randomUUID} from 'node:crypto';
import {readArchive} from '@runeditrun/rer/modules/portability';

export async function* archiveRecords(path){
 const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{yield* readArchive(Readable.toWeb(file.createReadStream({autoClose:false})));}
 finally{await file.close();}
}
export function receipt(manifest,closing,transient){
 return {contentHash:closing.contentHash,archiveHash:closing.archiveHash,tables:manifest.tables.map(({name,count})=>({name,count})),objects:manifest.objects.length,payloads:manifest.payloads.length,
 exclusions:{tables:manifest.excludedTables,columns:manifest.excludedColumns,configuration:true,transient},requiredConfiguration:manifest.requiredConfiguration};
}
export async function exportFile(service,path,transient){
 let id,temp,file;
 try{
  await mkdir(dirname(path),{recursive:true,mode:0o700});temp=path+'.'+randomUUID()+'.partial';file=await open(temp,'wx',0o600);
  id=await service.exports.create();while((await service.exports.advance(id,{maxParts:16})).phase==='building'){}
  const reader=(await service.exports.download(id)).getReader();
  try{for(;;){const {done,value}=await reader.read();if(done)break;let offset=0;while(offset<value.length)offset+=(await file.write(value,offset)).bytesWritten;}}
  finally{await reader.cancel();reader.releaseLock();}
  await file.sync();await file.close();file=undefined;
  let manifest,closing;for await(const record of archiveRecords(temp)){if(record.kind==='manifest')manifest=record;if(record.kind==='closing')closing=record;}
  await link(temp,path);return receipt(manifest,closing,transient);
 }finally{
  await file?.close();if(temp)await unlink(temp).catch(error=>{if(error.code!=='ENOENT')throw error;});if(id)await service.exports.abort(id);
 }
}
export async function importFile(service,path,transient){
 let id,manifest,closing,complete=false;
 try{
  for await(const record of archiveRecords(path)){
   if(record.kind==='manifest'){manifest=record;id=await service.imports.create(manifest);}
   else if(record.kind==='part')await service.imports.uploadPart(id,record.index,record);
   else closing=record;
  }
  // Version 2 archives bind every byte; finalize compares the closing archive digest.
  await service.imports.finalize(id,{contentHash:closing.contentHash,archiveHash:closing.archiveHash});complete=true;return receipt(manifest,closing,transient);
 }finally{if(id&&!complete)await service.imports.abort(id);}
}
