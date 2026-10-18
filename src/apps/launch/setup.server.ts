import { connectionManagementActions } from '../../domains/authority/connection-management'
import { legacyImportStagingRules } from '../../domains/evidence/staging.server'
import { channelLegacyPolicyRules } from '../../domains/channels/setup.server'
import { launchDescriptors } from './descriptors.server'
import { LAUNCH_APP_ID } from './contracts'
import { legacyLaunchSurface } from './legacy-policy.server'
import { createUlid } from '../../core/shared/ids'

/** Setup is explicit and idempotent. It never installs example campaigns or grants. */
export async function prepareLaunchSetup(db:D1Database,ownerId:string,now=Date.now()):Promise<D1PreparedStatement[]> {
 const operator=await db.prepare('SELECT id FROM operators WHERE id=? AND active=1').bind(ownerId).first()
 if(!operator)throw new Error('Launch setup requires the configured active operator')
 const statements:D1PreparedStatement[]=[]
 for(const descriptor of launchDescriptors){const s=descriptor.schema;statements.push(db.prepare('INSERT OR IGNORE INTO record_schemas(id,app_id,version,physical_revision,schema_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(s.id,s.appId,s.version,s.physicalRevision,JSON.stringify(s),s.createdAt,s.updatedAt))}
 // Only the explicitly supplied first-install owner is bootstrapped here.
 // An operator row is not evidence of legacy launch rights: invitations can be
 // scoped to another app. Existing installations use initializeLegacyAuthority
 // with their reviewed exact mappings. A schema/policy marks initialization even
 // if a membership was subsequently deleted, so repeat setup cannot undo removal.
 const initialized=await db.prepare('SELECT 1 FROM record_schemas WHERE app_id=? UNION ALL SELECT 1 FROM authority_policies WHERE app_id=? LIMIT 1').bind(LAUNCH_APP_ID,LAUNCH_APP_ID).first()
 const alreadyScoped=await db.prepare('SELECT 1 FROM authority_memberships WHERE principal_id=? LIMIT 1').bind(ownerId).first()
 if(!initialized&&!alreadyScoped){
  const policyId=createUlid()
  const rules:import('../../domains/authority/contracts').Policy['rules']=launchDescriptors.map((d)=>({id:createUlid(),principals:[{kind:'human',id:ownerId}],entityId:d.schema.id,rows:{kind:'all',conditions:[]},readableFields:d.schema.fields.map(f=>f.id),writableFields:d.schema.fields.map(f=>f.id),actions:[...legacyLaunchSurface(d.schema.id)!.actions,...connectionManagementActions],effect:'allow',purposes:legacyLaunchSurface(d.schema.id)!.purposes}));rules.push(...channelLegacyPolicyRules(ownerId),...legacyImportStagingRules(ownerId,createUlid(),createUlid()))
  statements.push(db.prepare("INSERT INTO authority_policies(id,app_id,name,rules_json,created_at,updated_at,version) SELECT ?,?,'Legacy launch operator',?,?,?,1 WHERE NOT EXISTS(SELECT 1 FROM authority_memberships WHERE principal_id=?) AND NOT EXISTS(SELECT 1 FROM authority_policies WHERE app_id=?)").bind(policyId,LAUNCH_APP_ID,JSON.stringify(rules),now,now,ownerId,LAUNCH_APP_ID))
  statements.push(db.prepare("INSERT OR IGNORE INTO authority_memberships(principal_id,app_id,policy_id,legacy,state,version) SELECT ?,?,?,1,'active',1 WHERE changes()=1 AND EXISTS(SELECT 1 FROM authority_policies WHERE id=?) AND EXISTS(SELECT 1 FROM operators o JOIN authority_principals p ON p.id=o.id WHERE o.id=? AND o.active=1 AND p.state='active')").bind(ownerId,LAUNCH_APP_ID,policyId,policyId,ownerId))
 }
 const lenses=[{key:'risks',name:'Risks Lens',recordType:'Risk',conditions:[{field:'severity',operator:'one of',value:['High','Critical']},{field:'state',operator:'not equals',value:'Resolved'},{field:'campaignLaunchDate',operator:'within the next N days',value:'30'}],sort:{field:'severity',direction:'desc'},fields:['severity','state','owner','dueDate','signal','mitigation','campaign'],display:'Cards'},{key:'timeline',name:'Timeline Lens',recordType:'Milestone',conditions:[],sort:{field:'startDate',direction:'asc'},fields:['title','startDate','endDate','campaign'],display:'Timeline'}]
 for(const l of lenses)statements.push(db.prepare('INSERT OR IGNORE INTO lenses(id,created_at,updated_at,version,name,description,record_type,conditions_json,sort_json,fields_json,display,created_by_id,shipped_key) VALUES(?,?,?,1,?,?,?,?,?,?,?,?,?)').bind(createUlid(),now,now,l.name,'',l.recordType,JSON.stringify(l.conditions),JSON.stringify(l.sort),JSON.stringify(l.fields),l.display,ownerId,l.key))
 const automations=[{key:'critical-risk',name:'Critical risk escalation',trigger:'event',config:{event:'risk.updated'},actions:[{command:'escalate-risk'}],enabled:1},{key:'launch-readiness',name:'Launch readiness',trigger:'schedule',config:{hour:8,leadDays:5},actions:[{command:'readiness'}],enabled:1},{key:'campaign-brief',name:'Campaign brief',trigger:'event',config:{events:['campaign.created','campaign.updated']},actions:[{command:'request-ai-analysis'}],enabled:1},{key:'weekly-digest',name:'Weekly portfolio digest',trigger:'schedule',config:{weekday:1,hour:9},actions:[{command:'digest'}],enabled:0}]
 for(const a of automations){
  const legacy={ 'critical-risk':{config:{event:'risk.updated.v1'},actions:['escalate-risk']},'launch-readiness':{config:{hour:8,leadDays:5},actions:['notify-operator']},'campaign-brief':{config:{event:'campaign.updated.v1'},actions:['request-ai-analysis']},'weekly-digest':{config:{weekday:'Monday',hour:9},actions:['send-email']} }[a.key]!
  const candidates=await db.prepare('SELECT id,trigger_config_json,actions_json FROM automations WHERE shipped_key IS NULL AND name=? AND trigger_type=? AND definition_version=1').bind(a.name,a.trigger).all<{id:string;trigger_config_json:string;actions_json:string}>()
  const matches=candidates.results.filter(row=>JSON.stringify(JSON.parse(row.trigger_config_json))===JSON.stringify(legacy.config)&&JSON.stringify(JSON.parse(row.actions_json))===JSON.stringify(legacy.actions))
  if(matches.length===1)statements.push(db.prepare('UPDATE automations SET shipped_key=?,trigger_config_json=?,actions_json=? WHERE id=? AND shipped_key IS NULL AND NOT EXISTS(SELECT 1 FROM automations WHERE shipped_key=?)').bind(a.key,JSON.stringify(a.config),JSON.stringify(a.actions),matches[0]!.id,a.key))
 }
 for(const a of automations)statements.push(db.prepare('INSERT OR IGNORE INTO automations(id,created_at,updated_at,version,name,trigger_type,trigger_config_json,actions_json,enabled,definition_version,shipped_key) VALUES(?,?,?,1,?,?,?,?,?,1,?)').bind(createUlid(),now,now,a.name,a.trigger,JSON.stringify(a.config),JSON.stringify(a.actions),a.enabled,a.key))
 return statements
}
