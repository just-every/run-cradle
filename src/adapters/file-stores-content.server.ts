import type {CredentialPort} from './contracts'
import type {FileStoreProvider} from '../domains/connections/oauth.server'
/** Read bytes only on an explicit keep-copy request. Provider redirects carry no authorization header. */
export async function readStoreContent(provider:FileStoreProvider,credentials:CredentialPort,connectionId:string,jobId:string,itemId:string){
 const token=(await credentials.resolve(connectionId,'readback',{jobId})).token,headers=new Headers({authorization:`Bearer ${token}`}),id=encodeURIComponent(itemId)
 const target=provider==='google-drive'?`https://www.googleapis.com/drive/v3/files/${id}?alt=media`:provider==='onedrive'?`https://graph.microsoft.com/v1.0/me/drive/items/${id}/content`:provider==='box'?`https://api.box.com/2.0/files/${id}/content`:'https://content.dropboxapi.com/2/files/download'
 if(provider==='dropbox')headers.set('Dropbox-API-Arg',JSON.stringify({path:`id:${itemId.replace(/^id:/,'')}`}))
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000)
 try{
  let response=await fetch(target,{method:provider==='dropbox'?'POST':'GET',headers,redirect:'manual',signal:controller.signal})
  if([301,302,303,307,308].includes(response.status)){
   const location=response.headers.get('location');await response.body?.cancel();if(!location)throw new Error('File store omitted its download location')
   const url=new URL(location),host=url.hostname.toLowerCase(),allowed=provider==='onedrive'?host.endsWith('.sharepoint.com')||host.endsWith('.files.1drv.com')||host.endsWith('.1drv.com'):provider==='box'?host.endsWith('.boxcloud.com'):false
   if(url.protocol!=='https:'||url.username||url.password||!allowed)throw new Error('File store returned an unapproved download location')
   response=await fetch(url,{redirect:'manual',signal:controller.signal})
  }
  if(response.status!==200){await response.body?.cancel();throw new Error(`File store content was refused (HTTP ${response.status}); reconnect the attacher's store if content consent is missing.`)}
  const reader=response.body?.getReader(),chunks:Uint8Array[]=[],cap=10*1024*1024;let length=0
  if(reader)for(;;){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>cap){await reader.cancel();throw new Error('Copied attachment exceeds the 10 MiB attachment limit')}chunks.push(part.value)}
  if(!length)throw new Error('The file store returned an empty file')
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}return bytes
 }finally{clearTimeout(timer)}
}
