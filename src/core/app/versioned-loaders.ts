import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import { LAUNCH_APP_ID, launchEntities } from '../../apps/launch/contracts'
const id='[0-9A-HJKMNP-TV-Z]{26}'
const permitted=[new RegExp(`^/api/v1/forms/${id}$`),new RegExp(`^/api/v1/apps/${id}/entities/${id}/records/${id}$`),new RegExp(`^/api/v1/sources/${id}(?:/content)?(?:\\?version=[1-9][0-9]{0,15})?$`)]
permitted.push(new RegExp(`^/api/v1/comments\\?appId=${id}&entityId=${id}&recordId=${id}&q=&limit=30$`))
/** A separate, finite read surface; no arbitrary internal request forwarding. */
export const loadVersionedDocumentData=createServerFn({method:'GET'}).validator((value:unknown)=>{
 if(!Array.isArray(value)||value.length<1||value.length>3||!value.every(path=>typeof path==='string'&&permitted.some(pattern=>pattern.test(path))))throw notFound()
 return value as string[]
}).handler(async({data})=>{
 const paths=new Set(data)
 // A Launch campaign document renders its schema and first thread page together. These
 // dependencies derive only from the validated record path, never caller URLs.
 for(const path of data){
  const record=new RegExp(`^/api/v1/apps/(${id})/entities/(${id})/records/(${id})$`).exec(path)
  if(!record||record[1]!==LAUNCH_APP_ID||record[2]!==launchEntities.campaign)continue
  const [,appId,entityId,recordId]=record
  paths.add(`/api/v1/apps/${appId}/entities/${entityId}`)
  paths.add(`/api/v1/comments?${new URLSearchParams({appId:appId!,entityId:entityId!,recordId:recordId!,q:'',limit:'30'})}`)
 }
 const {loadDocumentResources}=await import('./document.server');return loadDocumentResources([...paths])
})
