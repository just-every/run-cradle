import { AuthorityError } from './errors'
export const readBoundedJson=async(request:Request,maximum=4096):Promise<unknown>=>{
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new AuthorityError('validation','Content-Type must be application/json.',400)
 const reader=request.body?.getReader();if(!reader)throw new AuthorityError('validation','JSON body is required.',400)
 const chunks:Uint8Array[]=[];let size=0
 try{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>maximum){await reader.cancel();throw new AuthorityError('validation','Request is too large.',413)}chunks.push(item.value)}}finally{reader.releaseLock()}
 const bytes=new Uint8Array(size);let position=0;for(const chunk of chunks){bytes.set(chunk,position);position+=chunk.length}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown}catch{throw new AuthorityError('validation','Request must contain valid JSON.',400)}
}
