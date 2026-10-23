import type { CommandInput } from '../../contracts/primitives'
import type { RequestContext } from '../../domains/authority/ports'
import { prepareRecord } from './records.server'
import { emptyChange,load,versionGuard,fail,plan,type LaunchContext } from './domain.server'
export async function prepareSupersede(context:LaunchContext,ctx:RequestContext,input:CommandInput<Record<string,unknown>>){
 const before=await load(context.db,'decision',String(input.input.id)),set=emptyChange();versionGuard(set,'decision',before,input.expected);if(!['Approved','Rejected','Cancelled'].includes(String(before.state)))fail('Only a terminal decision can be superseded')
 const fields=input.input.fields as Record<string,unknown>;if(fields.campaignId!==before.campaign_id)fail('Superseding decision must belong to the same campaign');const p=await prepareRecord(context,ctx,{...input,input:{fields:{...fields,supersedesId:before.id}}},'decision','create');set.guards.push(...p.guards);set.mutations.push(...p.mutations);set.audit.push(...p.audit);set.events.push(...p.events);set.changed.push(...p.changed??[]);set.access.push(...p.accessSubjects??[]);return plan(context,ctx,input,'launch.decision.supersede',set,p.committedResult,'decision')
}
