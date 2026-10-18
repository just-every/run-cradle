import type { EntitySchema, Filter, Form, View } from './contracts'

function pruneFilter(filter:Filter,keep:(id:string)=>boolean):Filter|null {
 if(filter.kind==='condition')return keep(filter.fieldId)?filter:null
 const conditions=filter.conditions.flatMap(item=>{const kept=pruneFilter(item,keep);return kept?[kept]:[]})
 return filter.conditions.length&&!conditions.length?null:{...filter,conditions}
}

/** Schema absence is distinct from policy denial. Retained fields still need authorization. */
export function currentSchemaView<T extends Pick<View,'fields'|'filter'|'sort'|'groupBy'|'layout'|'display'>>(view:T,schema:EntitySchema):T {
 const ids=new Set(schema.fields.map(f=>f.id)),keep=(id:string)=>ids.has(id),layout={...view.layout}
 for(const key of ['startFieldId','endFieldId','boardFieldId','coverFieldId'] as const)if(layout[key]&&!keep(layout[key]!))delete layout[key]
 if(!keep(layout.titleFieldId))layout.titleFieldId=schema.primaryFieldId??schema.fields[0]!.id
 const needsGrid=view.display==='board'&&!layout.boardFieldId||['calendar','timeline','agenda'].includes(view.display)&&!layout.startFieldId||view.display==='timeline'&&!layout.endFieldId
 return {...view,fields:view.fields.filter(keep),filter:pruneFilter(view.filter,keep)??{kind:'all',conditions:[]},sort:view.sort.filter(s=>keep(s.fieldId)),groupBy:view.groupBy.filter(keep),layout,display:needsGrid?'grid':view.display}
}

export function currentSchemaForm<T extends Pick<Form,'fields'>>(form:T,schema:EntitySchema):T {
 const ids=new Set(schema.fields.map(f=>f.id))
 return {...form,fields:form.fields.filter(f=>ids.has(f.fieldId))}
}
