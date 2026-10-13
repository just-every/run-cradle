import {createHash} from 'node:crypto';
import {PortabilityError} from '@runeditrun/rer/modules/portability';

/** Private execution envelopes are configuration-bound and never installation data.
 * Verify retained uploads against their write-time digest, not a new digest of
 * possibly corrupted storage. Base independently verifies the archive transport.
 */
export function installationBucket(db,bucket){
 const omitted=key=>key.startsWith('execution/');
 return new Proxy(bucket,{
  get(target,property){
   if(property==='list')return async options=>{
    const page=await target.list(options);
    return {...page,objects:page.objects.filter(object=>!omitted(object.key))};
   };
   if(property==='get')return async(key,...args)=>{
    if(omitted(key))throw new PortabilityError('private_execution_payload',409);
    const object=await target.get(key,...args);
    const expected=await db.prepare("SELECT id,sha256,bytes FROM evidence_files WHERE object_key=? AND state='available'").bind(key).first();
    if(expected){
     if(!object)throw new PortabilityError('stored_file_missing:'+expected.id,409);
     const full=args.length?await target.get(key):object;
     if(!full||full.etag!==object.etag)throw new PortabilityError('stored_file_checksum:'+expected.id,409);
     const bytes=new Uint8Array(await full.arrayBuffer());
     if(bytes.length!==expected.bytes||createHash('sha256').update(bytes).digest('hex')!==expected.sha256)throw new PortabilityError('stored_file_checksum:'+expected.id,409);
     if(full!==object)return object;
     // Preserve R2 metadata while giving the verified bytes back to the stream reader.
     return new Proxy(object,{get(value,property){if(property==='body')return new ReadableStream({start(controller){controller.enqueue(bytes);controller.close();}});if(property==='arrayBuffer')return async()=>bytes.buffer;const item=Reflect.get(value,property,value);return typeof item==='function'?item.bind(value):item;}});
    }
    return object;
   };
   const value=Reflect.get(target,property,target);
   return typeof value==='function'?value.bind(target):value;
  },
 });
}
