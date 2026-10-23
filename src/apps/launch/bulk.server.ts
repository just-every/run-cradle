import { AdmissionError } from '../../domains/admission/errors'
import type { CommandInput,Json } from '../../contracts/primitives'
import type { RequestContext } from '../../domains/authority/ports'
import { eq,registerTable,trustedPredicate } from '../../domains/admission/sql.server'
import { createUlid } from '../../core/shared/ids'
import { tables,type LaunchRow } from './storage.server'
import { emptyChange,load,operator,versionGuard,recordChange,plan,fail,type LaunchContext } from './domain.server'
import { prepareCampaign,campaignSidecars } from './campaigns.server'
import { prepareRecord } from './records.server'
import type { LaunchKind } from './descriptors.server'
import { loadTarget } from './target-authority.server'
const bulkTable=registerTable('launch_bulk',['id','created_at','actor_id','expires_at','undone_at','snapshot_json'])
type Snapshot={kind:LaunchKind;row:LaunchRow;tags:string[];customFields:Record<string,unknown>;afterVersion:number}
export async function prepareBulk(context:LaunchContext,ctx:RequestContext,input:CommandInput<Record<string,unknown>>,operation:'apply'|'undo'){
 const set=emptyChange(),now=Date.parse(ctx.now)
 if(operation==='undo'){
  const bulk=await context.db.prepare('SELECT * FROM launch_bulk WHERE id=?').bind(String(input.input.bulkId)).first<{id:string;expires_at:number;undone_at:number|null;snapshot_json:string}>();if(!bulk||bulk.undone_at||bulk.expires_at<=now)fail('Bulk undo has expired or was already used')
  set.guards.push(trustedPredicate('EXISTS(SELECT 1 FROM launch_bulk WHERE id=? AND undone_at IS NULL AND expires_at>?)',[bulk!.id,now]));const snapshots=JSON.parse(bulk!.snapshot_json) as Snapshot[]
  for(const snap of snapshots){const current=await load(context.db,snap.kind,snap.row.id);if(current.version!==snap.afterVersion)(()=>{throw new AdmissionError('version_conflict',`${snap.kind} ${current.id} has current version ${current.version}; undo would overwrite a later change`,current.version)})();set.guards.push(trustedPredicate(`EXISTS(SELECT 1 FROM ${tables[snap.kind].tableId} WHERE id=? AND version=?)`,[current.id,current.version]));if(snap.row.owner_id)await operator(context.db,set,snap.row.owner_id);if(snap.kind==='decision'&&snap.row.assignee_id)await operator(context.db,set,snap.row.assignee_id);const restored={...snap.row,version:current.version+1,updated_at:now};set.mutations.push({kind:'update',table:tables[snap.kind],set:Object.fromEntries(Object.entries(restored).filter(([key])=>tables[snap.kind].writableColumnIds.includes(key))),where:eq(tables[snap.kind],'id',current.id),expectedRows:1});if(snap.kind==='campaign')await campaignSidecars(context,set,current.id,{tags:snap.tags,customFields:snap.customFields},now,ctx);recordChange(set,ctx,snap.kind,current,restored,`${snap.kind}.bulk-undone`)}
  set.mutations.push({kind:'update',table:bulkTable,set:{undone_at:now},where:eq(bulkTable,'id',bulk!.id),expectedRows:1});set.events=[{name:'bulk.updated',version:1,subject:null,payload:{ids:snapshots.map(s=>s.row.id)},causeRunIds:[]}];return plan(context,ctx,input,'launch.bulk.undo',set,{bulkId:bulk!.id,restored:snapshots.length},snapshots[0]!.kind)
 }
 const kind=({Campaign:'campaign',Risk:'risk',Milestone:'milestone',Decision:'decision'} as Record<string,LaunchKind>)[String(input.input.recordType)]!,ids=input.input.ids as string[],change=input.input.change as Record<string,unknown>;if(!ids.length||ids.length>500||new Set(ids).size!==ids.length)fail('Select 1–500 unique records')
 const snapshots:Snapshot[]=[]
 // A rejected bulk change names the first record that fails, then changes nothing.
 const named=async<T>(row:LaunchRow,prepare:()=>Promise<T>)=>{try{return await prepare()}catch(error){if(error instanceof AdmissionError&&error.code!=='version_conflict')throw new AdmissionError(error.code,`${row.name??row.title??row.id}${row.code?` (${row.code})`:''}: ${error.message}`);throw error}}
 for(const id of ids){const row=await loadTarget(context,ctx,input,'launch.bulk.apply',kind,id);versionGuard(set,kind,row,input.expected);const tags=kind==='campaign'?(await context.db.prepare('SELECT tag FROM campaign_tags WHERE campaign_id=?').bind(id).all<{tag:string}>()).results.map(t=>t.tag):[],customFields=kind==='campaign'?Object.fromEntries((await context.db.prepare('SELECT field_id,value_json FROM launch_custom_values WHERE campaign_id=?').bind(id).all<{field_id:string;value_json:string}>()).results.map(v=>[v.field_id,JSON.parse(v.value_json)])):{}
  snapshots.push({kind,row,tags,customFields,afterVersion:row.version+1});let changes:Record<string,unknown>={};let action='patch'
  if(change.kind==='field')changes[String(change.field)]=change.value
  else if(change.kind==='tag-add'||change.kind==='tag-remove'){if(kind!=='campaign')fail('Tags belong to campaigns');changes.tags=change.kind==='tag-add'?[...new Set([...tags,String(change.value)])]:tags.filter(t=>t!==change.value)}
  else if(change.kind==='custom-field'){if(kind!=='campaign')fail('Custom fields belong to campaigns');changes.customFields={[String(change.fieldId)]:change.value};if(!(String(change.fieldId)in customFields))customFields[String(change.fieldId)]=null}
  else{if(kind!=='campaign')fail('Archive and restore target campaigns');action=String(change.kind)}
  const command={...input,input:{id,changes}},p=await named(row,()=>kind==='campaign'?prepareCampaign(context,ctx,command,action):prepareRecord(context,ctx,command,kind,'patch'));set.guards.push(...p.guards);set.mutations.push(...p.mutations);set.audit.push(...p.audit);set.changed.push(...p.changed??[])
 }
 const id=createUlid();set.mutations.push({kind:'insert',table:bulkTable,row:{id,created_at:now,actor_id:ctx.principal.id,expires_at:now+3600000,undone_at:null,snapshot_json:JSON.stringify(snapshots)}});set.audit.push({action:'launch.bulk.apply',subject:null,changes:[],sourceIds:[],personalContentRefs:[]});set.events.push({name:'bulk.updated',version:1,subject:null,payload:{ids},causeRunIds:[]});return plan(context,ctx,input,'launch.bulk.apply',set,{bulkId:id,count:ids.length,undoExpiresAt:new Date(now+3600000).toISOString()},kind)
}
