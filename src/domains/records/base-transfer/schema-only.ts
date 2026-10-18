import type { PortableBase } from './json-format'
import { validatePortableBase } from './json-validation'

/** Explicit schema-only projection. Every record-bound definition change is reported for review. */
export function schemaOnlyBase(source:PortableBase):{snapshot:PortableBase;omissions:string[]}{
 const snapshot=structuredClone(source),omissions:string[]=[]
 const referencesRecord=(value:unknown):boolean=>{
  if(!value||typeof value!=='object')return false
  if('recordId'in value)return true
  return Object.values(value).some(referencesRecord)
 }
 for(const table of snapshot.base.tables){
  if(table.records.length)omissions.push(`${table.label}: exclude ${table.records.length} records and their values and links.`)
  table.records=[]
  for(const field of table.fields){
   if(referencesRecord(field.defaultValue)){delete field.defaultValue;omissions.push(`${table.label} · ${field.label}: clear the default linked record.`)}
   const clearExpressionFilter=(expression:NonNullable<typeof field.expression>):void=>{
    if(expression.kind==='call')expression.args.forEach(clearExpressionFilter)
    if(expression.kind==='rollup'&&referencesRecord(expression.filter)){delete expression.filter;omissions.push(`${table.label} · ${field.label}: clear the calculation filter that references excluded records.`)}
   }
   if(field.expression)clearExpressionFilter(field.expression)
  }
  if(table.validationRules)table.validationRules=table.validationRules.filter(rule=>{
   if(!referencesRecord(rule.when)&&!referencesRecord(rule.require))return true
   omissions.push(`${table.label} · ${rule.name}: exclude the validation rule that references excluded records.`);return false
  })
 }
 for(const view of snapshot.base.views)if(view.timelineBaseline){delete view.timelineBaseline;omissions.push(`${view.name}: exclude the timeline baseline that references excluded records.`)}
 for(const view of snapshot.base.views)if(referencesRecord(view.filter)){
  view.filter={kind:'all',conditions:[]};omissions.push(`${snapshot.base.tables.find(table=>table.id===view.tableId)!.label} · ${view.name}: clear the saved view filter that references excluded records.`)
 }
 for(const form of snapshot.base.forms)for(const field of form.fields)if(referencesRecord(field.showWhen)){
  delete field.showWhen;omissions.push(`${form.title} · ${field.label}: clear the visibility condition that references excluded records.`)
 }
 return {snapshot:validatePortableBase(snapshot),omissions}
}
