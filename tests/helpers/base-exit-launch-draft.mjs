import {createUlid} from '../../src/core/shared/ids.ts'
import {newField} from '../../src/ui/records/schema/templates.ts'

// Historical manual Launch schema, retained independently for native D1 exits.
// The product now opens the included Launch base instead of creating duplicates.
export function launchExitDraft(){
 const appId=createUlid()
 const table=(label,fields)=>({id:createUlid(),label,fields})
 const select=(label,options)=>({...newField(label,'select'),options:options.map(label=>({id:createUlid(),label}))})
 const campaigns=table('Campaigns',[newField('Campaign'),newField('Launch date','date'),select('Status',['Planning','In progress','Ready','Blocked'])])
 const link=()=>({...newField('Campaign','relation'),relation:{ownerAppId:appId,entityId:campaigns.id,cardinality:'one',onDelete:'restrict'}})
 const campaign=link()
 const lookup={...newField('Campaign name','computed'),readOnly:true,resultType:'text',expression:{kind:'rollup',relationFieldId:campaign.id,valueFieldId:campaigns.fields[0].id,aggregate:'lookup'}}
 return {appId,name:'Launch readiness',tables:[
  campaigns,
  table('Deliverables',[newField('Deliverable'),newField('Due date','date'),newField('Complete','boolean'),campaign,lookup]),
  table('Risks',[newField('Risk'),select('Severity',['Low','Medium','High','Critical']),newField('Mitigation'),newField('Resolved','boolean'),link()]),
 ]}
}
