import { z } from 'zod'
import type { StoreReference } from '../../contracts/primitives'
import { storeProviders, storeLinkAllowed } from './store-reference-links'

export const storeDigestSchema=z.object({algorithm:z.enum(['sha256','sha1','md5','quickxor','dropbox-content-hash']),value:z.string().min(1).max(512)}).strict()
/** Public capture content contains no connection binding or preview/sharing state. */
export const portableStoreSchema=z.object({kind:z.literal('store'),schema:z.literal(1),provider:z.enum(storeProviders),account:z.string().min(1).max(512).nullable(),itemId:z.string().min(1).max(512),name:z.string().min(1).max(500),type:z.string().max(255),size:z.number().int().min(0).nullable(),modified:z.iso.datetime().nullable(),digest:storeDigestSchema.nullable(),link:z.string().max(2048).nullable(),attachedBy:z.string().min(1).max(500),attachedAt:z.iso.datetime()}).strict().refine(r=>r.link===null||safePortableLink(r.provider,r.link),'Store link must be a permanent provider link')
export type PortableStoreReference=z.infer<typeof portableStoreSchema>
export const portableStoresSchema=z.array(portableStoreSchema).max(10000)
function safePortableLink(provider:StoreReference['provider'],link:string){if(!storeLinkAllowed(provider,link))return false;const url=new URL(link);return ![...url.searchParams.keys()].some(key=>/token|signature|credential|expires|x-amz-|x-goog-|^sig$|^se$|^sp$|^sv$/i.test(key))}
export function canonicalStoreJson(value:unknown):string {if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonicalStoreJson).join(',')+']';return '{'+Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,v])=>JSON.stringify(key)+':'+canonicalStoreJson(v)).join(',')+'}'}
export function returnStoreReferences(value:unknown):{reference:StoreReference}[]{const parsed=portableStoresSchema.safeParse(typeof value==='string'?JSON.parse(value):value);if(!parsed.success)throw new Error('Expected a valid array of portable store references');return parsed.data.map(portable=>({reference:{provider:portable.provider,itemId:portable.itemId,name:portable.name,mediaType:portable.type,size:portable.size,modifiedAt:portable.modified,link:portable.link??'',connectionId:null,attachedBy:portable.attachedBy,portable,resolution:'unresolved'}}))}
export function exportStoreReference(reference:StoreReference,anonymousLabel?:string):PortableStoreReference {
 if(!reference.portable&&!reference.attachedAt)throw new Error('Store reference has no captured attachment instant. Reattach this file from its store before exporting.')
 if(!reference.portable&&reference.digest===undefined&&reference.provider!=='chest'&&!reference.mediaType.startsWith('application/vnd.google-apps.'))throw new Error('Store reference has no captured digest metadata. Reattach this file from its store before exporting.')
 const value=reference.portable??{kind:'store',schema:1,provider:reference.provider,account:reference.account??null,itemId:reference.itemId,name:reference.name,type:reference.mediaType,size:reference.size,modified:reference.modifiedAt,digest:reference.digest??null,link:reference.link||null,attachedBy:reference.attachedBy,attachedAt:reference.attachedAt!}
 return portableStoreSchema.parse(anonymousLabel?{...value,attachedBy:anonymousLabel}:value)
}
