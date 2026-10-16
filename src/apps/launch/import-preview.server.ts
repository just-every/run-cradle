import type { RequestContext } from '../../domains/authority/ports'
import type { ImportPrepared } from '../../domains/portability/import.server'
import type { CellValue } from '../../contracts/primitives'
import { canonicalHash } from '../../domains/admission/canonical'
import { launchColumns,launchFieldIds } from './descriptors.server'
import { campaignFields,deliverableFields,milestoneFields,LAUNCH_APP_ID,launchEntities } from './contracts'
import { mappedFields,fail,type LaunchContext } from './domain.server'
import { parseImportRow } from './import-row-errors'
import type { LaunchRow } from './storage.server'
/** Read one source snapshot for preview; commit still prepares current guarded domain mutations. */
export async function prepareLegacyImportPreview(context:LaunchContext,ctx:RequestContext,kind:'campaign'|'deliverable'|'milestone',entries:{values:Record<string,string>;id:string}[]):Promise<({prepared:ImportPrepared}|{error:string})[]>{
 const scope=await context.policy.scope(ctx,{appId:LAUNCH_APP_ID,entityId:launchEntities[kind],purpose:'read'}),campaignScope=kind==='campaign'?scope:await context.policy.scope(ctx,{appId:LAUNCH_APP_ID,entityId:launchEntities.campaign,purpose:'read'});if(Object.values(launchFieldIds[kind]).some(id=>!scope.readableFieldIds.includes(id)))fail('Import preview requires authorized standard fields')
 const input=entries.map(entry=>({...entry,values:Object.fromEntries(Object.entries(entry.values).map(([key,value])=>[Object.entries(launchFieldIds[kind]).find(([,id])=>id===key)?.[0]??key,value]))})),codes=[...new Set(input.map(entry=>(entry.values.code??entry.values.campaignCode??'').trim().toLowerCase()))]
 const [people,campaigns,definitions]=await Promise.all([context.db.prepare('SELECT id,name,email FROM operators WHERE active=1').all<{id:string;name:string;email:string}>(),context.db.prepare(`SELECT * FROM campaigns WHERE lower(code) IN (SELECT value FROM json_each(?)) AND (${campaignScope.rowPredicate.sql})`).bind(JSON.stringify(codes),...campaignScope.rowPredicate.values).all<LaunchRow>(),context.db.prepare('SELECT id,type,options_json FROM launch_custom_fields').all<{id:string;type:string;options_json:string}>()])
 const byCode=new Map(campaigns.results.map(row=>[String(row.code).toLowerCase(),row])),campaignIds=campaigns.results.map(row=>row.id),table=kind==='deliverable'?'deliverables':'milestones',children=kind==='campaign'?[]:(await context.db.prepare(`SELECT * FROM ${table} WHERE campaign_id IN (SELECT value FROM json_each(?)) AND (${scope.rowPredicate.sql})`).bind(JSON.stringify(campaignIds),...scope.rowPredicate.values).all<LaunchRow>()).results
 const childMap=new Map<string,LaunchRow[]>();for(const row of children){const key=row.campaign_id+'\u0000'+row.title;childMap.set(key,[...(childMap.get(key)??[]),row])}
 const tags=kind==='campaign'?(await context.db.prepare('SELECT campaign_id,tag FROM campaign_tags WHERE campaign_id IN (SELECT value FROM json_each(?)) ORDER BY tag').bind(JSON.stringify(campaignIds)).all<{campaign_id:string;tag:string}>()).results:[],values=kind==='campaign'?(await context.db.prepare('SELECT campaign_id,field_id,value_json FROM launch_custom_values WHERE campaign_id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(campaignIds)).all<{campaign_id:string;field_id:string;value_json:string}>()).results:[]
 const output:({prepared:ImportPrepared}|{error:string})[]=[]
 for(const entry of input){try{
  const fields=entry.values,code=(fields.code??fields.campaignCode??'').trim();if(!code)fail('CSV merge key requires campaign code');const campaign=byCode.get(code.toLowerCase());if(kind!=='campaign'&&!campaign)fail('Referenced campaign must already exist');if(kind!=='campaign'&&!fields.title?.trim())fail('CSV merge key requires title')
  const matches=kind==='campaign'?(campaign?[campaign]:[]):childMap.get(campaign!.id+'\u0000'+fields.title!.trim())??[];if(matches.length>1)fail('Merge key matches more than one existing record');const before=matches[0],normalized:Record<string,unknown>={}
  for(const[name,text]of Object.entries(fields)){if(name==='campaignCode'||!text.trim())continue
   if(!Object.hasOwn(launchColumns[kind],name)&&name!=='tags'){
    const fieldId=name.startsWith('custom:')?name.slice(7):name,definition=kind==='campaign'?definitions.results.find(d=>d.id===fieldId):null;if(!definition)fail(`Unknown CSV field ${name}`)
    let value:unknown=text.trim();if(definition!.type==='boolean'){if(!['true','false'].includes(text.trim()))fail('Custom boolean expects true or false');value=text.trim()==='true'}else if(definition!.type==='multi_select')value=text.split('|').map(v=>v.trim()).filter(Boolean)
    if(definition!.type==='number'&&!Number.isFinite(Number(value)))fail('Invalid custom number');if(definition!.type==='date'&&(!/^\d{4}-\d\d-\d\d$/.test(String(value))||new Date(String(value)).toISOString().slice(0,10)!==value))fail('Invalid custom date');if(definition!.type==='url'&&!/^https?:\/\//.test(String(value)))fail('Invalid custom URL');if(['select','multi_select'].includes(definition!.type)&&(Array.isArray(value)?value:[value]).some(v=>!JSON.parse(definition!.options_json).includes(v)))fail('Unknown custom field option')
    normalized.customFields={...(normalized.customFields as object??{}),[fieldId]:value};continue
   }
   if(['state','status'].includes(name)&&kind!=='campaign')fail('Import cannot inject lifecycle outcomes')
   if(['health','budgetMinor','spendMinor'].includes(name))normalized[name]=Number(text)
   else if(name==='ownerId'){const matches=people.results.filter(p=>p.id===text.trim()||p.email.toLowerCase()===text.trim().toLowerCase()||p.name===text.trim());if(matches.length!==1)fail(`Owner ${text} does not identify one current operator`);normalized[name]=matches[0]!.id}
   else if(name==='tags')normalized.tags=text.split('|').map(v=>v.trim()).filter(Boolean)
   else normalized[name]=text.trim()
  }
  if(kind!=='campaign')normalized.campaignId=campaign!.id
  const defaults=kind==='campaign'?{objective:'',statusSummary:'',phase:'Planning',status:'On track',budgetMinor:0,spendMinor:0,tags:[],customFields:{}}:kind==='milestone'?{type:'Launch',status:'Not started',endDate:null,conflictReason:null}:{dueDate:null},prior=before?mappedFields(kind,before):{},merged:Record<string,unknown>={...defaults,...prior,...normalized}
  ;parseImportRow<unknown>(kind==='campaign'?campaignFields:kind==='deliverable'?deliverableFields:milestoneFields,merged)
  if(!people.results.some(p=>p.id===merged.ownerId))fail('Owner is not current')
  if(kind==='campaign'&&(String(merged.launchDate)<String(merged.startDate)||!['Planning','Build','Production','Review','Launch prep'].includes(String(merged.phase))||!['On track','Watch','At risk','Blocked'].includes(String(merged.status))))fail('Invalid campaign dates, phase or status')
  if(kind==='milestone'&&merged.endDate&&String(merged.endDate)<String(merged.startDate))fail('endDate must not precede startDate')
  const oldTags=tags.filter(t=>t.campaign_id===before?.id).map(t=>t.tag),oldCustom=Object.fromEntries(values.filter(v=>v.campaign_id===before?.id).map(v=>[v.field_id,JSON.parse(v.value_json)])),changed=!before||Object.entries(normalized).some(([key,value])=>JSON.stringify(key==='tags'?oldTags:key==='customFields'?Object.fromEntries(Object.keys(value as object).map(id=>[id,oldCustom[id]??null])):prior[key])!==JSON.stringify(value))
  const shown=(name:string,value:unknown):CellValue=>value==null?null:name==='ownerId'?people.results.find(p=>p.id===value)?.name??String(value):Array.isArray(value)?value.join(' | '):String(value)
  const changes=before?Object.entries(normalized).flatMap(([key,value])=>key==='customFields'?Object.entries(value as Record<string,unknown>).filter(([id,next])=>JSON.stringify(oldCustom[id]??null)!==JSON.stringify(next)).map(([id,next])=>({field:'custom:'+id,before:shown(id,oldCustom[id]),after:shown(id,next)})):key==='campaignId'?[]:JSON.stringify(key==='tags'?oldTags:prior[key])!==JSON.stringify(value)?[{field:key,before:shown(key,key==='tags'?oldTags:prior[key]),after:shown(key,value)}]:[]):[]
  output.push({prepared:{row:{changes,id:before?.id??entry.id,key:kind==='campaign'?code.toLowerCase():code.toLowerCase()+'\u0000'+fields.title!.trim(),values:fields,before:Object.fromEntries(Object.entries(prior).map(([key,value])=>[key,value==null?null:String(value)])),fingerprint:await canonicalHash(before??null),operation:!before?'create':changed?'update':'unchanged'},change:{guards:[],mutations:[],audit:[],next:null}}})
 }catch(error){output.push({error:error instanceof Error?error.message:'Invalid row'})}}
 return output
}
