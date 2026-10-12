import type { CommandInput } from '../../contracts/primitives'
import type { RequestContext } from '../../domains/authority/ports'
import { eq,trustedPredicate } from '../../domains/admission/sql.server'
import { createUlid } from '../../core/shared/ids'
import { customFieldDefinition } from './contracts'
import { tables } from './storage.server'
import { emptyChange,load,versionGuard,plan,capacity,fail,toWire,recordChange,type LaunchContext } from './domain.server'
export async function prepareCustomField(context:LaunchContext,ctx:RequestContext,input:CommandInput<Record<string,unknown>>,operation:string){
 const id=String(input.input.id??createUlid()),set=emptyChange(),before=input.input.id?await load(context.db,'customField',id):null;if(before)versionGuard(set,'customField',before,input.expected)
 if(operation==='delete'){const count=await context.db.prepare('SELECT COUNT(*) AS n FROM launch_custom_values WHERE field_id=?').bind(id).first<{n:number}>();if(input.input.confirmedAffectedCount!==count!.n)fail(`Confirm deletion of ${count!.n} campaign values`);set.guards.push(trustedPredicate('(SELECT COUNT(*) FROM launch_custom_values WHERE field_id=?)=?',[id,count!.n]));set.mutations.push({kind:'delete',table:tables.customField,where:eq(tables.customField,'id',id),expectedRows:1});recordChange(set,ctx,'customField',before,null,'custom-field.deleted');return plan(context,ctx,input,'launch.custom-field.delete',set,{deletedId:id,affected:count!.n},'customField')}
 const field=customFieldDefinition.parse(input.input.field);if(before&&field.type!==before.type)fail('A custom-field type change requires an explicit value migration');if(!before)await capacity(context.db,set,'customField');if(field.type==='select'||field.type==='multi_select'){if(!field.options?.length||new Set(field.options).size!==field.options.length)fail('Select fields require unique options')}
 if(before&&(field.type==='select'||field.type==='multi_select')){
  const values=await context.db.prepare('SELECT campaign_id,value_json FROM launch_custom_values WHERE field_id=?').bind(id).all<{campaign_id:string;value_json:string}>()
  for(const value of values.results){const current=JSON.parse(value.value_json);if((Array.isArray(current)?current:[current]).some(option=>option!==null&&!field.options!.includes(option)))fail('Removing an option used by a campaign requires an explicit value migration')}
  set.guards.push(trustedPredicate('(SELECT COUNT(*) FROM launch_custom_values WHERE field_id=?)=?',[id,values.results.length]))
  for(const value of values.results)set.guards.push(trustedPredicate('EXISTS(SELECT 1 FROM launch_custom_values WHERE field_id=? AND campaign_id=? AND value_json=?)',[id,value.campaign_id,value.value_json]))
 }
 const now=Date.parse(ctx.now),row={id,created_at:before?.created_at??now,updated_at:now,version:(before?.version??0)+1,name:field.name,type:field.type,options_json:JSON.stringify(field.options??[])};set.mutations.push(before?{kind:'update',table:tables.customField,set:row,where:eq(tables.customField,'id',id),expectedRows:1}:{kind:'insert',table:tables.customField,row});recordChange(set,ctx,'customField',before,row,'custom-field.saved');return plan(context,ctx,input,'launch.custom-field.save',set,toWire(row),'customField')
}
