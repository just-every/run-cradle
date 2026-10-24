import {registerTable,identifier,trustedPredicate,textReplacement} from '../admission/sql.server'
import type {Effects} from './changes.server'
import {AuthorityError} from '../authority/errors'

/** External subjects are meaningful only within their issuer. Retire copies in
 * this person's own audit custody, without touching another actor's same token.
 * Facts, command identities, actions and timestamps remain for accountability. */
export async function anonymizeAuditSubjects(db:D1Database,change:Effects,person:{id:string},label:string){
 const base='IN (SELECT base_id FROM cradle_base_operators WHERE principal_id=?)'
 const subjects=(await db.prepare(`SELECT subject value FROM oa_external_identities WHERE operator_id ${base} UNION SELECT external_id value FROM company_scim_users WHERE operator_id ${base}`).bind(person.id,person.id).all<{value:string|null}>()).results.map(row=>row.value).filter((value):value is string=>!!value)
 const needles=[...new Set(subjects)]
 if(!needles.length)return
 if(needles.some(value=>label.includes(value)))throw new AuthorityError('version_conflict','Anonymous audit identity would retain an external subject; resolve the replacement-label conflict before erasure.',409)
 const contains=(column:string)=>`CASE WHEN json_valid(${column}) THEN EXISTS(SELECT 1 FROM json_tree(${column}) WHERE atom=?) ELSE 0 END`
 const stores=[
  {table:'command_admissions',key:'command_id',columns:['result_json','access_json'],where:`actor_id=? OR ${contains('result_json')}`,values:[person.id,person.id]},
  {table:'admission_audit',key:'id',columns:['subject_json','changes_json','source_ids_json','personal_refs_json'],where:`actor_id=? OR ${contains('subject_json')} OR ${contains('changes_json')} OR ${contains('personal_refs_json')}`,values:[person.id,person.id,person.id,person.id]},
 ]
 for(const store of stores){
  const rows=(await db.prepare(`SELECT ${[store.key,...store.columns].map(identifier).join(',')} FROM ${identifier(store.table)} WHERE ${store.where}`).bind(...store.values).all<Record<string,string|null>>()).results
  for(const row of rows)for(const column of store.columns){
   const original=row[column]
   if(original===null||original===undefined||!needles.some(value=>original.includes(value)||original.includes(JSON.stringify(value).slice(1,-1))))continue
   // Check the combined final representation before any mutation. In particular,
   // anonymizing keys must never silently collapse two distinct JSON properties.
   const expression=textReplacement(column,needles,label)
   const invalid=`EXISTS(SELECT 1 FROM (SELECT ${identifier(column)} original,${expression.sql} redacted FROM ${identifier(store.table)} WHERE ${identifier(store.key)}=?) WHERE json_valid(original) AND (NOT json_valid(redacted) OR EXISTS(SELECT 1 FROM json_tree(redacted) WHERE typeof(key)='text' GROUP BY parent,key HAVING count(*)>1)))`
   const values=[...expression.values,row[store.key]!]
   if(await db.prepare(`SELECT 1 WHERE ${invalid}`).bind(...values).first())throw new AuthorityError('version_conflict','Audit anonymization would collide JSON keys; resolve the affected audit custody before erasure.',409)
   change.guards.push(trustedPredicate(`NOT (${invalid})`,values),trustedPredicate(`(SELECT ${identifier(column)} FROM ${identifier(store.table)} WHERE ${identifier(store.key)}=?) IS ?`,[row[store.key]!,original]))
   // Runs after generic name/email rewrites. The immutable row identity, rather
   // than its old JSON bytes, selects the same retained fact at that point.
   change.mutations.push({kind:'replaceText',table:registerTable(store.table,[column]),column,needles,replacement:label,where:trustedPredicate(`${identifier(store.key)}=?`,[row[store.key]!]),expectedRows:1})
  }
 }
}
