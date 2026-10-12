import { registerTable } from '../../domains/admission/sql.server'
import { launchColumns, launchTables, type LaunchKind } from './descriptors.server'
const common=['id','created_at','updated_at','version']
const extra:Record<LaunchKind,string[]>={campaign:['health_updated_at','health_set_by_id','archived_at'],deliverable:['completed_at','completed_by_id'],milestone:[],risk:['resolved_at','resolved_by_id','escalated_at','escalated_by_id','escalation_reason'],decision:['outcome_at','outcome_by_id'],lens:['conditions_json','sort_json','fields_json','created_by_id','shipped_key'],automation:['trigger_type','trigger_config_json','actions_json','definition_version','shipped_key'],customField:['options_json'],readiness:['notification_id','acknowledged_at']}
export const tables=Object.fromEntries(Object.entries(launchColumns).map(([k,c])=>[k,registerTable(launchTables[k as LaunchKind],[...common,...Object.values(c),...extra[k as LaunchKind]])])) as Record<LaunchKind,ReturnType<typeof registerTable>>
export const activityTable=registerTable('activity_entries',[...common,'campaign_id','subject_id','actor_id','type','field_name','previous_value','next_value','message','automation_run_id'])
export const tagTable=registerTable('campaign_tags',[...common,'campaign_id','tag'])
export const customValueTable=registerTable('launch_custom_values',['id','field_id','campaign_id','value_json'])
export const dependencyTable=registerTable('milestone_dependencies',[...common,'milestone_id','predecessor_id'])
export type LaunchRow=Record<string,string|number|null>&{id:string;version:number;created_at:number;updated_at:number}
export const toWire=(row:LaunchRow)=>Object.fromEntries(Object.entries(row).filter(([k])=>!k.startsWith('launch_')).map(([k,v])=>[k.replace(/_([a-z])/g,(_,c:string)=>c.toUpperCase()),typeof v==='number'&&(k.endsWith('_at')||k==='due_at')?new Date(v).toISOString():v]))
