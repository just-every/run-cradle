import type { Policy } from '../../authority/contracts'
import type { SqlMutation, SqlPredicate } from '../../admission/ports'
import { canonical } from '../../admission/canonical'
import { trustedPredicate } from '../../admission/sql.server'
import type { StoredPreview } from './release.server'
import { policies, ownerRules } from './authority.server'
import { roleRules } from './role-policy'
import type { BaseRole } from './base-role'
/** Extend full-base role policies while preserving deliberately restricted fields and denies. */
export async function prepareRoleSchemaUpdates(db:D1Database,detail:StoredPreview,now:string){
 const rows=await db.prepare("SELECT m.principal_id,m.version AS membership_version,p.id,p.version,p.rules_json,r.role FROM authority_memberships m JOIN authority_policies p ON p.id=m.policy_id AND p.app_id=m.app_id LEFT JOIN manual_base_roles r ON r.app_id=m.app_id AND r.principal_id=m.principal_id AND r.policy_id=m.policy_id WHERE m.app_id=? AND m.state='active' AND (r.role IS NOT NULL OR m.principal_id=?)").bind(detail.appId,detail.baseOwnerId??detail.policyOwnerId??'').all<{principal_id:string;membership_version:number;id:string;version:number;rules_json:string;role:BaseRole|null}>()
 const mutations:SqlMutation[]=[],guards:SqlPredicate[]=[],rulesByPrincipal:Record<string,string>={}
 for(const row of rows.results){
  if(row.id===detail.policy?.id)continue
  const current=JSON.parse(row.rules_json) as Policy['rules']
  const rules=current.map(rule=>{
   const next=detail.schemas.find(s=>s.id===rule.entityId),old=detail.prior.find(s=>s.id===rule.entityId)
   if(!next||!old)return rule
   const owned=rule.effect==='allow'&&rule.principals.length===1&&rule.principals[0]!.id===row.principal_id
   const added=next.fields.filter(f=>!old.fields.some(p=>p.id===f.id))
   const fullRead=owned&&old.fields.every(f=>rule.readableFields.includes(f.id)),fullWrite=owned&&old.fields.filter(f=>f.type!=='computed').every(f=>rule.writableFields.includes(f.id))
   return {...rule,readableFields:[...rule.readableFields.filter(id=>next.fields.some(f=>f.id===id)),...(fullRead?added.map(f=>f.id):[])],writableFields:[...rule.writableFields.filter(id=>next.fields.some(f=>f.id===id)),...(fullWrite?added.filter(f=>f.type!=='computed').map(f=>f.id):[])]}
  })
  const addedTables=detail.schemas.filter(s=>!detail.prior.some(p=>p.id===s.id))
  rules.push(...(row.role?roleRules(row.principal_id,row.role,addedTables):ownerRules(row.principal_id,addedTables)).filter(rule=>addedTables.some(s=>s.id===rule.entityId)))
  rulesByPrincipal[row.principal_id]=canonical(rules)
  guards.push(trustedPredicate("EXISTS(SELECT 1 FROM authority_memberships WHERE app_id=? AND principal_id=? AND state='active' AND version=? AND policy_id=?)",[detail.appId,row.principal_id,row.membership_version,row.id]))
  if(canonical(rules)!==row.rules_json)mutations.push({kind:'update',table:policies,set:{rules_json:canonical(rules),version:row.version+1,updated_at:Date.parse(now)},where:trustedPredicate('id=? AND version=?',[row.id,row.version]),expectedRows:1})
 }
 return {mutations,guards,rulesByPrincipal}
}
