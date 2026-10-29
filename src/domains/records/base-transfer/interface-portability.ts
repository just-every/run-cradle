import {z} from 'zod'
import {idSchema} from '../validators'
import {definitionSchema,type InterfaceInput} from '../interfaces/contracts'
import {ImportInputError} from './input-error'
import type {PortableBase} from './json-format'
import type {ImportIdentities} from './contracts'

const content={name:definitionSchema.shape.name,pages:definitionSchema.shape.pages,audience:definitionSchema.shape.audience}
export const portableInterfaceVersionSchema=z.object({version:z.number().int().positive(),...content}).strict()
export const portableInterfaceSchema=z.object({id:idSchema,version:z.number().int().positive(),...content,versions:z.array(portableInterfaceVersionSchema).min(1).max(1000)}).strict()
export type PortableInterface=z.infer<typeof portableInterfaceSchema>
export const interfaceParts=(definition:Pick<InterfaceInput,'pages'>)=>definition.pages.flatMap(page=>[page.id,...page.sections.flatMap(section=>[section.id,...section.components.map(component=>component.id)])])
export const interfaceComponents=(definition:Pick<InterfaceInput,'pages'>)=>definition.pages.flatMap(page=>page.sections.flatMap(section=>section.components))
export const portableInterfaceParts=(item:PortableInterface)=>[...new Set([item,...item.versions].flatMap(interfaceParts))]
export const interfaceAuthorityReset='Returned interfaces are owner-only until their audience is explicitly published again.'

export function validatePortableInterfaces(base:PortableBase['base'],unique:(id:string,kind:string)=>void){
 const views=new Map(base.views.map(view=>[view.id,view])),forms=new Set(base.forms.map(form=>form.id))
 for(const item of base.interfaces??[]){
  unique(item.id,'interface');for(const id of portableInterfaceParts(item))unique(id,'interface layout')
  const versions=new Set<number>()
  for(const version of item.versions){if(versions.has(version.version)||version.version>item.version)throw new ImportInputError(`${item.name}: interface versions must be distinct and no newer than the current publication`);versions.add(version.version)}
  const current=item.versions.find(version=>version.version===item.version)
  if(!current||JSON.stringify({name:current.name,pages:current.pages,audience:current.audience})!==JSON.stringify({name:item.name,pages:item.pages,audience:item.audience}))throw new ImportInputError(`${item.name}: current interface publication must equal its retained version`)
  for(const version of [item,...item.versions]){
   const checked=definitionSchema.safeParse({appId:base.id,name:version.name,pages:version.pages,audience:version.audience});if(!checked.success)throw new ImportInputError(`${item.name}: invalid interface layout or audience`)
   for(const component of interfaceComponents(version)){
    if(component.kind==='view'&&views.get(component.viewId)?.visibility!=='app')throw new ImportInputError(`${item.name}: interface references an unavailable shared view`)
    if(component.kind==='form'&&!forms.has(component.formId))throw new ImportInputError(`${item.name}: interface references an unavailable authenticated form`)
   }
  }
 }
}
export function remapPortableInterface(item:PortableInterface,ids:ImportIdentities):PortableInterface{
 const part=(id:string)=>{const mapped=ids.interfaceParts?.[id];if(!mapped)throw new ImportInputError('Missing interface layout identity');return mapped}
 const remap=(value:Pick<PortableInterface,'name'|'pages'|'audience'>)=>({name:value.name,audience:{roles:['owner' as const],people:[]},pages:value.pages.map(page=>({...page,id:part(page.id),sections:page.sections.map(section=>({...section,id:part(section.id),components:section.components.map(component=>({...component,id:part(component.id),...(component.kind==='view'?{viewId:ids.views![component.viewId]!}:component.kind==='form'?{formId:ids.forms![component.formId]!}:{})}))}))}))})
 return {id:ids.interfaces![item.id]!,version:item.version,...remap(item),versions:item.versions.map(version=>({version:version.version,...remap(version)}))}
}
