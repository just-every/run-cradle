import { legacyImportStagingRules,STAGING_ENTITY } from '../evidence/staging.server'
import { channelLegacySurface,CHANNEL_FIELDS } from '../channels/setup.server'
import { LAUNCH_APP_ID } from '../../apps/launch/contracts'
import { legacyLaunchSurface } from '../../apps/launch/legacy-policy.server'
import type { Policy } from './contracts'
import { canonicalJson } from './grants.server'
import { policyRuleSchema } from './validators'
/** Explicit setup invocation only. The caller supplies reviewed exact legacy launch mappings. */
export const initializeLegacyAuthority=async(db:D1Database,input:{initialOwnerId:string;launchAppId:string;policies:Policy[];memberships:{memberId:string;policyId:string}[]})=>{
 const owner=await db.prepare('SELECT id FROM operators WHERE id=? AND active=1').bind(input.initialOwnerId).first();if(!owner)throw new Error('INITIAL_OWNER_ID must name an existing active operator.')
 if(input.launchAppId!==LAUNCH_APP_ID)throw new Error('Legacy initialization requires the retained launch app.')
 const active=await db.prepare('SELECT id FROM operators WHERE active=1').all<{id:string}>(),activeIds=new Set(active.results.map(row=>row.id))
 for(const policy of input.policies){
  if(policy.appId!==LAUNCH_APP_ID)throw new Error('Legacy initialization cannot expose another app.')
  policyRuleSchema.array().parse(policy.rules)
  for(const rule of policy.rules){
   if(rule.entityId===STAGING_ENTITY){
    const shape=(value:Policy['rules'][number])=>canonicalJson({...value,id:'',principals:[]})
    const allowed=legacyImportStagingRules(rule.principals[0]?.id??'',rule.id,rule.id)
    if(rule.principals.length!==1||rule.principals[0]!.kind!=='human'||!activeIds.has(rule.principals[0]!.id)||!allowed.some(expected=>shape(expected)===shape(rule)))throw new Error('Legacy import staging must use exact source-owned CSV rights.')
    continue
   }
   const channelSurface=channelLegacySurface(rule.entityId),surface=legacyLaunchSurface(rule.entityId)??channelSurface
   if(!surface||rule.actions.some(action=>!surface.actions.includes(action))||rule.readableFields.some(field=>!surface.fields.includes(field))||rule.writableFields.some(field=>!surface.fields.includes(field))||rule.purposes?.some(purpose=>!(surface.purposes as readonly string[]).includes(purpose)))throw new Error('Legacy policy exceeds the exact retained launch surface.')
   if(channelSurface?.personal&&(rule.rows.kind!=='condition'||rule.rows.fieldId!==CHANNEL_FIELDS.owner||rule.rows.op!=='eq'||rule.principals.some(principal=>rule.rows.kind!=='condition'||rule.rows.value!==principal.id)))throw new Error('Legacy private channel rows must belong to the exact human operator.')
   if(rule.principals.some(principal=>principal.kind!=='human'||!activeIds.has(principal.id)))throw new Error('Legacy policy requires an existing active human operator.')
  }
 }
 for(const membership of input.memberships){
  const policy=input.policies.find(policy=>policy.id===membership.policyId)
  if(!activeIds.has(membership.memberId)||!policy||policy.rules.some(rule=>rule.principals.some(principal=>principal.id!==membership.memberId)))throw new Error('Legacy membership must use its own exact human launch policy.')
 }

 const statements=[db.prepare(`INSERT OR IGNORE INTO authority_principals(id,kind,human_id,state,created_at,updated_at) SELECT id,'human',id,CASE WHEN active=1 THEN 'active' ELSE 'removed' END,created_at,updated_at FROM operators`),db.prepare('UPDATE authority_principals SET initial_owner=1 WHERE id=? AND NOT EXISTS(SELECT 1 FROM authority_principals WHERE initial_owner=1 AND id<>?)').bind(input.initialOwnerId,input.initialOwnerId)]
 // Each membership is immediately preceded by its own policy insertion. D1
 // executes this ordered batch in one transaction: changes() proves this call
 // installed the mapping, even if another prepared call committed first.
 for(const p of input.policies){
  const install=()=>db.prepare('INSERT INTO authority_policies(id,app_id,name,rules_json,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(p.id,p.appId,p.name,canonicalJson(p.rules),p.version,Date.parse(p.createdAt),Date.parse(p.updatedAt))
  const memberships=input.memberships.filter(m=>m.policyId===p.id)
  if(!memberships.length)statements.push(install())
  for(const m of memberships){
   statements.push(install())
   statements.push(db.prepare(`INSERT INTO authority_memberships(principal_id,app_id,policy_id,legacy,state,version) SELECT ?,?,?,1,'active',1 WHERE changes()=1 AND EXISTS(SELECT 1 FROM operators o JOIN authority_principals p ON p.id=o.id WHERE o.id=? AND o.active=1 AND p.state='active') ON CONFLICT(principal_id,app_id) DO NOTHING`).bind(m.memberId,input.launchAppId,m.policyId,m.memberId))
  }
 }
 await db.batch(statements)
}
