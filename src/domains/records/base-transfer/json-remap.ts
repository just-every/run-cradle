import { ImportInputError } from './input-error'
import { validateJsonCoordinates } from './json-coordinates'
import type { Expr,Filter } from '../contracts'
import type { PortableBase,PortableField } from './json-format'
import type { ImportIdentities } from './contracts'
import { nativePortableField } from './json-validation'
export function jsonIdentityMap(snapshot:PortableBase,ids:ImportIdentities):Map<string,string>{validateJsonCoordinates(snapshot,ids);const map=new Map<string,string>([[snapshot.base.id,ids.appId]])
 const put=(source:string,target:string|undefined)=>{if(!target)throw new ImportInputError('JSON identity mapping must be complete and bijective');map.set(source,target)}
 for(const table of snapshot.base.tables){const identity=ids.tables[table.id];if(!identity)throw new ImportInputError('Missing JSON table identity');put(table.id,identity.entityId);for(const field of table.fields){put(field.id,identity.fields[field.id]);if(field.type==='select')for(const option of field.options!)put(option.id,identity.options[field.id]?.[option.label])}for(const record of table.records)put(record.id,identity.records[record.id]);for(const inverse of table.incomingRelations)put(inverse.id,ids.incomingRelations?.[inverse.id]!)}
 for(const view of snapshot.base.views)put(view.id,ids.views?.[view.id]!);for(const form of snapshot.base.forms)put(form.id,ids.forms?.[form.id]!)
 if([...map.values()].some(value=>!value||!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(value))||new Set(map.values()).size!==map.size)throw new ImportInputError('JSON identity mapping must be complete and bijective')
 return map
}
export function remapPortableField(field:PortableField,appId:string,map:Map<string,string>,table:PortableBase['base']['tables'][number],tables:PortableBase['base']['tables']){
 const native=nativePortableField(field,appId);native.id=map.get(field.id)!
 if(native.options)native.options=native.options.map(o=>({id:map.get(o.id)!,label:o.label}))
 if(native.relation)native.relation.entityId=map.get(native.relation.entityId)!
 if(native.expression)native.expression=remapExpression(native.expression,table,tables,map)
 return native
}
function remapExpression(expr:Expr,table:PortableBase['base']['tables'][number],tables:PortableBase['base']['tables'],map:Map<string,string>):Expr {
 if(expr.kind==='literal')return expr
 if(expr.kind==='field')return {...expr,fieldId:map.get(expr.fieldId)!}
 if(expr.kind==='call')return {...expr,args:expr.args.map(arg=>remapExpression(arg,table,tables,map))}
 const relation=table.fields.find(f=>f.id===expr.relationFieldId)!.relation!,target=tables.find(t=>t.id===relation.tableId)!
 return {...expr,relationFieldId:map.get(expr.relationFieldId)!,valueFieldId:map.get(expr.valueFieldId)!,...(expr.filter?{filter:remapFilter(expr.filter,target,map)}:{})}
}
export function remapFilter(filter:Filter,table:PortableBase['base']['tables'][number],map:Map<string,string>):Filter {if(filter.kind!=='condition')return {...filter,conditions:filter.conditions.map(c=>remapFilter(c,table,map))};const field=table.fields.find(f=>f.id===filter.fieldId)!,value=filter.value;let remapped=value;if(value!==undefined&&value!==null){if(field.type==='select'||field.resultType==='select')remapped=Array.isArray(value)?value.map(v=>map.get(String(v))??v) as typeof value:map.get(String(value))??value;else if(field.type==='relation'){const ref=(v:unknown)=>{if(!v||typeof v!=='object'||!('recordId'in v)||!('appId'in v)||!('entityId'in v))throw new ImportInputError('Invalid relation filter value');return {appId:map.get(String(v.appId))!,entityId:map.get(String(v.entityId))!,recordId:map.get(String(v.recordId))!}};remapped=Array.isArray(value)?value.map(ref):ref(value)}}return {...filter,fieldId:map.get(filter.fieldId)!,...(value===undefined?{}:{value:remapped})}}
