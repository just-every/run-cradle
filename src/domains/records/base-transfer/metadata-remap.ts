import type { CellValue, Ref } from '../../../contracts/primitives'
import type { Field, RuleCondition, ValidationRule } from '../contracts'
import { ImportInputError } from './input-error'

export const personPortabilityNote='Person IDs refer to people in this installation. Import preserves those IDs and requires each referenced person to exist; it never creates people, accounts or memberships.'
type TypedField=Pick<Field,'type'|'resultType'|'resultElementType'>
/** Remap only identities belonging to this base; person IDs are installation identities. */
export function remapFieldValue(field:TypedField,value:CellValue,map:Map<string,string>):CellValue {
 if(value===null)return null
 const type=field.type==='computed'?field.resultType:field.type
 const id=(source:string)=>{const target=map.get(source);if(!target)throw new ImportInputError(`Missing portable identity ${source}`);return target}
 if(type==='array'&&field.resultElementType==='select')return (value as (string|null)[]).map(value=>value===null?null:id(value))
 if(type==='select')return id(String(value))
 if(type==='multi_select')return (value as string[]).map(id)
 if(type==='relation'){
  const ref=(v:Ref):Ref=>({appId:id(v.appId),entityId:id(v.entityId),recordId:id(v.recordId)})
  return Array.isArray(value)?(value as Ref[]).map(ref):ref(value as Ref)
 }
 return structuredClone(value)
}
export function remapValidationRules(rules:ValidationRule[],fields:Pick<Field,'id'|'type'|'resultType'|'resultElementType'>[],map:Map<string,string>):ValidationRule[]{
 const condition=(c:RuleCondition):RuleCondition=>remapRuleCondition(c,fields,map)
 return rules.map(rule=>{const id=map.get(rule.id);if(!id)throw new ImportInputError('Missing validation rule identity');return {...rule,id,when:condition(rule.when),require:condition(rule.require)}})
}
export function remapRuleCondition(c:RuleCondition,fields:Pick<Field,'id'|'type'|'resultType'|'resultElementType'>[],map:Map<string,string>):RuleCondition {
 const condition=(c:RuleCondition):RuleCondition=>{
  if(c.kind!=='condition')return {...c,conditions:c.conditions.map(condition)}
  const field=fields.find(f=>f.id===c.fieldId),fieldId=map.get(c.fieldId)
  if(!field||!fieldId)throw new ImportInputError('Validation rule references an unmapped field')
  return {...c,fieldId,...(c.value!==undefined?{value:remapFieldValue(field,c.value,map)}:{})}
 }
 return condition(c)
}
