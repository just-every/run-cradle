import type { EntitySchema, RuleCondition } from '../contracts'
import type { BasePreview } from './contracts'
import { AdmissionError } from '../../admission/errors'
import { trustedPredicate } from '../../admission/sql.server'
import { assertGuards } from '../fence.server'

/** A base carries references to installation people, never people or account creation instructions. */
export async function portablePersonGuards(db:D1Database,preview:BasePreview,schemas:EntitySchema[]){
 const people=new Set<string>()
 for(const table of schemas){
  const fields=new Set(table.fields.filter(f=>f.type==='person').map(f=>f.id))
  for(const field of table.fields)if(fields.has(field.id)&&field.defaultValue!==undefined&&field.defaultValue!==null)people.add(String(field.defaultValue))
  const rule=(c:RuleCondition):void=>{if(c.kind!=='condition')c.conditions.forEach(rule);else if(fields.has(c.fieldId)&&c.value!==undefined&&c.value!==null)people.add(String(c.value))}
  for(const r of table.validationRules??[]){rule(r.when);rule(r.require)}
  for(const row of preview.records)if(row.entityId===table.id)for(const id of fields){const value=row.fields[id];if(value!==undefined&&value!==null)people.add(String(value))}
 }
 const guards=[]
 for(const id of people){if(!await db.prepare('SELECT 1 FROM operators WHERE id=? AND active=1').bind(id).first())throw new AdmissionError('validation',`Referenced person ${id} is unavailable in this installation. Base import preserves installation person IDs and never creates people or memberships.`);guards.push(trustedPredicate('EXISTS(SELECT 1 FROM operators WHERE id=? AND active=1)',[id]))}
 await assertGuards(db,guards)
 return guards
}
