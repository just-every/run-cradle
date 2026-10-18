import { presentationFields as filterFields } from './view-presentation'
import type { EntitySchema, Filter, Form, View } from './contracts'

function pruneFilter(filter:Filter,keep:(id:string)=>boolean):Filter|null {
 if(filter.kind==='condition')return keep(filter.fieldId)?filter:null
 const conditions=filter.conditions.flatMap(item=>{const kept=pruneFilter(item,keep);return kept?[kept]:[]})
 return filter.conditions.length&&!conditions.length?null:{...filter,conditions}
}

/** Schema absence is distinct from policy denial. Retained fields still need authorization. */
export function currentSchemaView<T extends Pick<View,'fields'|'filter'|'sort'|'groupBy'|'layout'|'display'|'summaries'|'formatting'|'timelineZoom'|'timelineBaseline'>>(view:T,schema:EntitySchema):T {
 const ids=new Set(schema.fields.map(f=>f.id)),keep=(id:string)=>ids.has(id),layout={...view.layout}
 for(const key of ['startFieldId','endFieldId','boardFieldId','coverFieldId','dependencyFieldId'] as const)if(layout[key]&&!keep(layout[key]!))delete layout[key]
 if(!keep(layout.titleFieldId))layout.titleFieldId=schema.primaryFieldId??schema.fields[0]!.id
 const needsGrid=view.display==='board'&&!layout.boardFieldId||['calendar','timeline','agenda'].includes(view.display)&&!layout.startFieldId
 const result = {...view,...(view.summaries?{summaries:view.summaries.filter(item=>keep(item.fieldId))}:{}),...(view.formatting?{formatting:view.formatting.filter(rule=>(!rule.fieldId||keep(rule.fieldId))&&filterFields(rule.filter).every(keep))}:{}),fields:view.fields.filter(keep),filter:pruneFilter(view.filter,keep)??{kind:'all',conditions:[]},sort:view.sort.filter(s=>keep(s.fieldId)),groupBy:view.groupBy.filter(keep),layout,display:needsGrid?'grid':view.display}
 if(result.display!=='timeline'){delete result.timelineZoom;delete result.timelineBaseline;delete result.layout.dependencyFieldId}
 if(result.timelineBaseline&&(result.timelineBaseline.startFieldId!==layout.startFieldId||result.timelineBaseline.endFieldId!==layout.endFieldId))delete result.timelineBaseline
 return result
}

export function currentSchemaForm<T extends Pick<Form,'fields'>>(form:T,schema:EntitySchema):T {
 const ids=new Set(schema.fields.map(f=>f.id))
 return {...form,fields:form.fields.filter(f=>ids.has(f.fieldId))}
}
