import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {makePart,ContentVerifier,ArchiveVerifier} from '../../scripts/base-cli/modules/portability/format.mjs'
import {bindings,ownedData} from './rer-data-fixture.mjs'
/** Re-sign a deliberately altered archive's content and whole-archive digests, so a
 * refusal can only come from the deeper check the caller is proving. */
export function rebind(records){
 const content=new ContentVerifier(records[0]),archive=new ArchiveVerifier(records[0])
 for(const part of records.filter(r=>r.kind==='part')){archive.add(part);for(const item of part.items)content.add(item)}
 Object.assign(records.at(-1),{contentHash:content.digest(),archiveHash:archive.digest()})
}
const save=(root,name,records)=>writeFile(join(root,name),records.map(record=>JSON.stringify(record)).join('\n')+'\n',{mode:0o600})
export async function archiveIntegrity(source,target,first,empty){
 for(const kind of ['row','object']){
  const changed=structuredClone(first),item=changed.filter(r=>r.kind==='part').flatMap(r=>r.items).find(item=>item.kind===kind&&(kind==='object'?item.key==='archive/records.bin':item.table==='campaigns'))
  assert.ok(item)
  if(kind==='row')item.row.name=item.row.name.replace(/^./,item.row.name[0]==='X'?'Y':'X')
  else {const bytes=Buffer.from(item.data,'base64');bytes[0]^=1;item.data=bytes.toString('base64')}
  await save(target.source,kind+'-changed.rer',changed)
  await assert.rejects(target.rer(['import','--input',kind+'-changed.rer','--yes','--non-interactive']),error=>error.exitCode===1&&error.errorCode==='transfer_failed'&&error.message.includes('part_checksum'))
  assert.deepEqual(await ownedData(target.source,first[0].tables),empty,kind+' integrity rejection leaves target empty')
 }
 // Consistently re-hash the transport while changing a file: the original
 // write-time digest in the retained evidence row must still refuse the bytes.
 const forged=structuredClone(first),part=forged.find(r=>r.kind==='part'&&r.items.some(item=>item.kind==='object'&&item.key==='archive/records.bin')),item=part.items.find(item=>item.kind==='object'&&item.key==='archive/records.bin')
 const bytes=Buffer.from(item.data,'base64');bytes[0]^=1;item.data=bytes.toString('base64')
 forged[0].objects.find(object=>object.key===item.key).sha256=createHash('sha256').update(bytes).digest('hex')
 Object.assign(part,await makePart(part.index,part.items));rebind(forged)
 await save(target.source,'forged-file.rer',forged)
 await assert.rejects(target.rer(['import','--input','forged-file.rer','--yes','--non-interactive']),error=>error.exitCode===4&&error.errorCode==='restore_refused'&&error.message.includes('stored_file_checksum')&&error.errorLocation==='archive-file')
 assert.deepEqual(await ownedData(target.source,first[0].tables),empty,'Write-time checksum rejection leaves target empty')
 await bindings(source.source,async({FILES})=>{const file=await FILES.get('archive/records.bin'),original=new Uint8Array(await file.arrayBuffer());const damaged=original.slice();damaged[0]^=1;await FILES.put('archive/records.bin',damaged);})
 await assert.rejects(source.rer(['export','--output','exports/corrupt-source.rer','--non-interactive']),error=>error.exitCode===4&&error.errorCode==='restore_refused'&&error.message.includes('stored_file_checksum')&&error.errorLocation==='archive-file')
 await bindings(source.source,async({FILES})=>{await FILES.put('archive/records.bin',new Uint8Array([0,1,2,255,13,10]),{httpMetadata:{contentType:'application/octet-stream'},customMetadata:{source:'records'}})})
}
