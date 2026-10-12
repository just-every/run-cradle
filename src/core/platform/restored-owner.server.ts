import {createUlid} from '../shared/ids'
import type {Policy} from '../../domains/authority/contracts'

type Restore={pending:number;source_owner_id:string|null;current_owner_id:string|null}
type Membership={app_id:string;policy_id:string;legacy:number;version:number;rules_json:string;policy_version:number}
/** Explicit fresh Base admission transfers the archived owner's exact scopes once. */
export async function restoreOwner(db:D1Database,baseOperatorId:string,ownerId:string){
 const restore=await db.prepare('SELECT pending,source_owner_id,current_owner_id FROM cradle_restore WHERE singleton=1').first<Restore>()
 if(!restore?.pending)return
 if(restore.current_owner_id!==ownerId)throw new Error('Fresh restored-owner admission is required.')
 const source=restore.source_owner_id
 const owner=await db.prepare(`SELECT o.version FROM oa_operators o JOIN cradle_base_operators m ON m.base_id=o.id
  JOIN authority_principals p ON p.id=m.principal_id WHERE o.id=? AND o.status='active' AND o.role='owner' AND p.id=? AND p.state='active' AND p.initial_owner=1`)
  .bind(baseOperatorId,ownerId).first<{version:number}>()
 if(!owner)throw new Error('Current Base owner is required.')
 const scoped=source?await db.prepare(`SELECT m.app_id,m.policy_id,m.legacy,m.version,p.rules_json,p.version AS policy_version
  FROM authority_memberships m JOIN authority_policies p ON p.id=m.policy_id
  WHERE m.principal_id=? AND m.cradle_restore_active=1 AND p.app_id=m.app_id ORDER BY m.app_id`).bind(source).all<Membership>():{results:[]}
 const statements:D1PreparedStatement[]=[]
 // This predicate is rechecked inside the atomic ownership transfer.
 const current=`EXISTS(SELECT 1 FROM cradle_restore r JOIN oa_operators o ON o.id=?
  JOIN cradle_base_operators m ON m.base_id=o.id JOIN authority_principals p ON p.id=m.principal_id
  WHERE r.singleton=1 AND r.pending=1 AND r.current_owner_id=? AND o.version=? AND o.status='active'
  AND o.role='owner' AND p.id=r.current_owner_id AND p.state='active' AND p.initial_owner=1)`
 const identity=[baseOperatorId,ownerId,owner.version]
 statements.push(db.prepare(`SELECT CASE WHEN ${current} THEN 1 ELSE json_extract('owner changed','$') END`).bind(...identity))
 for(const membership of scoped.results){
  const rules=JSON.parse(membership.rules_json) as Policy['rules']
  const transferred=rules.map(rule=>({...rule,principals:rule.principals.map(principal=>principal.kind==='human'&&principal.id===source?{...principal,id:ownerId}:principal)}))
  const id=createUlid(),now=Date.now()
  statements.push(db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM authority_memberships m JOIN authority_policies p ON p.id=m.policy_id
   WHERE m.principal_id=? AND m.cradle_restore_active=1 AND m.app_id=? AND m.policy_id=? AND m.version=? AND p.version=? AND p.rules_json=?) THEN 1 ELSE json_extract('scope changed','$') END`)
   .bind(source,membership.app_id,membership.policy_id,membership.version,membership.policy_version,membership.rules_json))
  statements.push(db.prepare(`INSERT INTO authority_policies(id,app_id,name,rules_json,version,created_at,updated_at) VALUES(?,?,'Restored owner scope',?,1,?,?)`)
   .bind(id,membership.app_id,JSON.stringify(transferred),now,now))
  statements.push(db.prepare(`INSERT INTO authority_memberships(principal_id,app_id,policy_id,legacy,state,version) VALUES(?,?,?,?,'active',1)
   ON CONFLICT(principal_id,app_id) DO UPDATE SET policy_id=excluded.policy_id,legacy=excluded.legacy,state='active',version=version+1`).bind(ownerId,membership.app_id,id,membership.legacy))
 }
 if(source){
  // Current schema control moves; business actor/record ownership and old policies remain history.
  statements.push(db.prepare('UPDATE manual_record_bases SET owner_id=?,version=version+1 WHERE owner_id=?').bind(ownerId,source))
  statements.push(db.prepare('INSERT INTO cradle_restore_owner_admissions(id,source_owner_id,owner_id,base_operator_id,created_at) VALUES(?,?,?,?,?)')
   .bind(createUlid(),source,ownerId,baseOperatorId,Date.now()))
 }
 statements.push(db.prepare(`SELECT CASE WHEN ${current} THEN 1 ELSE json_extract('owner changed','$') END`).bind(...identity))
 statements.push(db.prepare('UPDATE cradle_restore SET pending=0 WHERE singleton=1 AND pending=1 AND current_owner_id=?').bind(ownerId))
 await db.batch(statements)
}
