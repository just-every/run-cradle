import type {EntitySchema,Expr,Field,Filter,Form,RuleCondition,View} from '../contracts'

export type FieldReference={appId:string;entityId:string;fieldId:string}
export const conditionFields=(condition?:Filter|RuleCondition):string[]=>!condition?[]:condition.kind==='condition'?[condition.fieldId]:condition.conditions.flatMap(conditionFields)
export function calculationReferences(expression:Expr|undefined,schema:EntitySchema):FieldReference[]{
 if(!expression||expression.kind==='literal')return []
 const local=(fieldId:string)=>({appId:schema.appId,entityId:schema.id,fieldId})
 if(expression.kind==='field')return [local(expression.fieldId)]
 if(expression.kind==='call')return expression.args.flatMap(argument=>calculationReferences(argument,schema))
 const relation=schema.fields.find(field=>field.id===expression.relationFieldId)?.relation
 return [local(expression.relationFieldId),...(relation?[expression.valueFieldId,...conditionFields(expression.filter),...(expression.sort??[]).map(sort=>sort.fieldId)].map(fieldId=>({appId:relation.ownerAppId,entityId:relation.entityId,fieldId})):[])]
}
export function viewReferences(view:View){
 const sensitive=[...conditionFields(view.filter),...Object.entries(view.layout).flatMap(([name,id])=>name==='titleFieldId'||!id?[]:[id]),...(view.summaries??[]).map(summary=>summary.fieldId),...(view.formatting??[]).flatMap(rule=>[...conditionFields(rule.filter),...(rule.fieldId?[rule.fieldId]:[])]),...(view.timelineBaseline?[view.timelineBaseline.startFieldId,...(view.timelineBaseline.endFieldId?[view.timelineBaseline.endFieldId]:[])]:[])]
 return {all:[...new Set([...view.fields,...view.sort.map(sort=>sort.fieldId),...view.groupBy,...Object.values(view.layout).filter((id):id is string=>!!id),...sensitive])],sensitive:[...new Set(sensitive)]}
}
export const formReferences=(form:Form)=>[...new Set(form.fields.flatMap(field=>[field.fieldId,...conditionFields(field.showWhen)]))]
export const physicalField=(field:Field)=>({type:field.type,relation:field.relation??null,options:field.options??null,resultType:field.resultType??null,resultElementType:field.resultElementType??null})
