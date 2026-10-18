import type { Platform } from '../../platform'
import type { lensDefinitionSchema } from '../../shared/schemas'
import { createLensRepository } from './repository'
import { previewLens } from '../../../apps/launch/lenses.server'
import { lensDefinition } from '../../../apps/launch/contracts'
type LensDefinition=import('zod').output<typeof lensDefinitionSchema>
export const createLensService=(platform:Platform)=>{
 const repository=createLensRepository(platform.database)
 return{
  list:()=>repository.list(),find:(id:string)=>repository.find(id),
  async preview(definition:LensDefinition,cursor?:string){
   const page=await previewLens(platform.bindings.DB,lensDefinition.parse(definition),new Date().toISOString(),cursor?Number(cursor):0)
   return{...page,items:page.items.map(row=>({id:String(row.id),title:String(row.name??row.title),subtitle:String(row.campaignId??row.code??''),meta:String(row.status??row.state??'')+(row.overdue?' · Overdue':''),...(typeof row.overdue==='boolean'?{overdue:row.overdue}:{})}))}
  },
 }
}
