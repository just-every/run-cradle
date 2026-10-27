import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
const id='[0-9A-HJKMNP-TV-Z]{26}'
const permitted=[new RegExp(`^/api/v1/forms/${id}$`),new RegExp(`^/api/v1/apps/${id}/entities/${id}/records/${id}$`),new RegExp(`^/api/v1/sources/${id}(?:/content)?(?:\\?version=[1-9][0-9]{0,15})?$`)]
permitted.push(new RegExp(`^/api/v1/comments\\?appId=${id}&entityId=${id}&recordId=${id}&q=&limit=30$`))
/** A separate, finite read surface; no arbitrary internal request forwarding. */
export const loadVersionedDocumentData=createServerFn({method:'GET'}).validator((value:unknown)=>{
 if(!Array.isArray(value)||value.length<1||value.length>3||!value.every(path=>typeof path==='string'&&permitted.some(pattern=>pattern.test(path))))throw notFound()
 return value as string[]
}).handler(async({data})=>{const {loadDocumentResources}=await import('./document.server');return loadDocumentResources(data)})
