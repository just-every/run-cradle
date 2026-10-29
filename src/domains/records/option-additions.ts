import type { EntitySchema, Field } from './contracts'
import { canonical } from '../admission/canonical'

const selectLookup=(field:Field)=>field.type==='computed'&&field.expression?.kind==='rollup'&&field.expression.aggregate==='lookup'&&
 (field.resultType==='select'||field.resultType==='array'&&field.resultElementType==='select')

/** Appending choices never changes an existing identity, label or stored value. */
export function preservesSelectOptions(before:Field,after:Field){
 const sameLookup=selectLookup(before)&&selectLookup(after)&&before.resultType===after.resultType&&before.resultElementType===after.resultElementType&&canonical(before.expression)===canonical(after.expression)
 return (['select','multi_select'].includes(before.type)||sameLookup)&&before.type===after.type&&
  !!before.options&&!!after.options&&after.options.length>=before.options.length&&
  before.options.every((option,index)=>canonical(option)===canonical(after.options![index]))
}

/** Carry an appended choice through the lookup graph before compiling the release. */
export function refreshAppendedLookupOptions(prior:readonly EntitySchema[],schemas:readonly EntitySchema[]){
 const key=(table:EntitySchema,field:Field)=>table.appId+':'+table.id+':'+field.id
 const appended=new Set<string>()
 for(const table of schemas)for(const field of table.fields){
  const before=prior.find(schema=>schema.appId===table.appId&&schema.id===table.id)?.fields.find(candidate=>candidate.id===field.id)
  if(before&&['select','multi_select'].includes(field.type)&&preservesSelectOptions(before,field)&&field.options!.length>before.options!.length)appended.add(key(table,field))
 }
 let pending=schemas.flatMap(table=>table.fields.filter(selectLookup).map(field=>({table,field})))
 while(appended.size&&pending.length){
  const remaining:typeof pending=[]
  for(const {table,field} of pending){
   const expression=field.expression!
   if(expression.kind!=='rollup')continue
   const relation=table.fields.find(candidate=>candidate.id===expression.relationFieldId)?.relation
   const target=schemas.find(schema=>schema.appId===relation?.ownerAppId&&schema.id===relation.entityId)
   const source=target?.fields.find(candidate=>candidate.id===expression.valueFieldId)
   if(!target||!source||!appended.has(key(target,source))){remaining.push({table,field});continue}
   field.options=structuredClone(source.options)
   appended.add(key(table,field))
  }
  if(remaining.length===pending.length)break
  pending=remaining
 }
}
