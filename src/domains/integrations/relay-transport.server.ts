import type { TrustedTransport, WireRequest, WireResponse } from '../../../vendor/base/modules/integrations/core/types.ts'
import { validateDestination } from '../../../vendor/base/modules/integrations/core/destination.ts'

export type RelayWire=WireRequest & {method?:'GET'|'POST'|'PUT'|'DELETE'|'HEAD';bodyEncoding?:'base64'}
export type RelayResponse=WireResponse & {bodyEncoding?:'base64'}

/** Worker fetch reaches one operator-configured relay; public DNS is pinned there. */
export class RelayTransport implements TrustedTransport {
 private endpoint:string
 constructor(endpoint:string,private secret:string) {
  const url=validateDestination(endpoint)
  if(url.search||url.hash||url.pathname!=='/v1/deliver'||secret.length<32)throw new Error('Egress relay configuration invalid')
  this.endpoint=url.href
 }
 async send(wire:RelayWire):Promise<RelayResponse> {
  validateDestination(wire.url)
  if((wire.bodyEncoding==='base64'?atob(wire.body).length:new TextEncoder().encode(wire.body).length)>1048576)throw new Error('Egress request limit exceeded')
  const signal=AbortSignal.timeout(15000)
  // Workers supports manual redirects. Reject every non-2xx acknowledgement
  // below so the relay credential is never forwarded to another location.
  const response=await fetch(this.endpoint,{method:'POST',redirect:'manual',signal,
   headers:{authorization:`Bearer ${this.secret}`,'content-type':'application/json'},body:JSON.stringify(wire)})
  if(!response.ok){await response.body?.cancel();throw new Error('Egress relay refused delivery')}
  const reader=response.body?.getReader();if(!reader)throw new Error('Egress relay response missing')
  const chunks:Uint8Array[]=[],limit=wire.bodyEncoding==='base64'?1500000:400000;let size=0
  try {for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>limit)throw new Error('Egress relay response limit exceeded');chunks.push(part.value)}}
  finally {await reader.cancel();reader.releaseLock()}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  const result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as RelayResponse
  if(!Number.isInteger(result.status)||result.status<100||result.status>599||result.status>=300&&result.status<400||
   !result.headers||typeof result.headers!=='object'||Array.isArray(result.headers)||Object.values(result.headers).some(value=>typeof value!=='string')||
   typeof result.body!=='string'||new TextEncoder().encode(result.body).length>(wire.bodyEncoding==='base64'?1400000:65536)||result.bodyEncoding!==wire.bodyEncoding)throw new Error('Egress relay response invalid')
  return result
 }
}
