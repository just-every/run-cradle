import { registerTable } from '../../domains/admission/sql.server'
import { existingDescriptor } from '../../domains/records/descriptors.server'
import type { Field, EntitySchema } from '../../domains/records/contracts'
import { LAUNCH_APP_ID, launchEntities } from './contracts'

export const launchColumns = {
 campaign:{code:'code',name:'name',ownerId:'owner_id',startDate:'start_date',launchDate:'launch_date',objective:'objective',statusSummary:'status_summary',phase:'phase',status:'status',health:'health',budgetMinor:'budget_minor',spendMinor:'spend_minor'},
 deliverable:{campaignId:'campaign_id',title:'title',ownerId:'owner_id',dueDate:'due_date',state:'state'},
 milestone:{campaignId:'campaign_id',title:'title',ownerId:'owner_id',type:'type',status:'status',startDate:'start_date',endDate:'end_date',conflictReason:'conflict_reason'},
 risk:{campaignId:'campaign_id',title:'title',ownerId:'owner_id',severity:'severity',dueDate:'due_date',signal:'signal',mitigation:'mitigation',state:'state',resolutionNote:'resolution_note'},
 decision:{campaignId:'campaign_id',riskId:'risk_id',supersedesId:'supersedes_id',title:'title',requesterId:'requester_id',assigneeId:'assignee_id',priority:'priority',dueAt:'due_at',recommendation:'recommendation',impact:'impact',state:'state',rationale:'rationale'},
 lens:{name:'name',description:'description',recordType:'record_type',display:'display'},
 automation:{name:'name',enabled:'enabled'},
 customField:{name:'name',type:'type'},
 readiness:{milestoneId:'milestone_id',ownerId:'owner_id',state:'state'},
} as const
export type LaunchKind=keyof typeof launchColumns
export const launchTables:Record<LaunchKind,string>={campaign:'campaigns',deliverable:'deliverables',milestone:'milestones',risk:'risks',decision:'decisions',lens:'lenses',automation:'automations',customField:'launch_custom_fields',readiness:'launch_readiness'}
const epoch='2026-09-27T00:00:00.000Z'
export const launchFieldIds=Object.fromEntries(Object.entries(launchColumns).map(([kind,columns],n)=>[kind,Object.fromEntries(Object.keys(columns).map((key,i)=>[key,String(7100+n*100+i).padStart(26,'0')]))])) as Record<LaunchKind,Record<string,string>>
launchFieldIds.campaign.tags='00000000000000000000007990'
export const launchDescriptors=Object.entries(launchColumns).map(([kind,value])=>{
 const k=kind as LaunchKind
 const fields:Field[]=Object.entries(value).map(([name])=>({id:launchFieldIds[k][name]!,label:name,type:name.endsWith('Date')?'date':name==='enabled'?'boolean':['health','budgetMinor','spendMinor'].includes(name)?'number':'text',required:false,unique:name==='code'}))
 const schema:EntitySchema={id:launchEntities[k],appId:LAUNCH_APP_ID,label:kind,version:1,createdAt:epoch,updatedAt:epoch,physicalRevision:'launch-retained-v1',fields,lifecycle:{states:['active','archived'],initial:'active',transitions:[]}}
 const descriptor=existingDescriptor(schema,{table:launchTables[k],id:'id',version:'version',createdAt:'launch_created_iso',updatedAt:'launch_updated_iso',lifecycle:'launch_lifecycle',schemaVersion:'launch_schema_version',fields:Object.fromEntries(Object.entries(value).map(([name,column])=>[launchFieldIds[k][name]!,{column}]))})
 if(k==='campaign'){const tags:Field={id:launchFieldIds.campaign.tags!,label:'tags',type:'multi_select',required:false,unique:false,readOnly:true};schema.fields.push(tags);descriptor.fields=new Map([...descriptor.fields,[tags.id,{field:tags,column:'id',join:{table:registerTable('launch_campaign_tag_projection',['id','record_id','value','position']),valueColumn:'value'}}]])}
 descriptor.writePolicy={create:false,patch:false,delete:false,transitions:[],protectedFieldIds:fields.map(f=>f.id)}
 return descriptor
})
