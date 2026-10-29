import { and, trustedPredicate } from '../admission/sql.server'
import { canonical } from '../admission/canonical'
import { bindExpression } from '../admission/batch.server'
import { AdmissionError } from '../admission/errors'
import type { SqlPredicate } from '../admission/ports'

/** Compile a guard snapshot, reserving bindings for an enclosing mutation. */
export function guardQuery(guards:readonly SqlPredicate[],reservedBindings=0) {
 const unique=[...new Map(guards.map(guard=>[canonical({sql:guard.sql,values:guard.values}),guard])).values()]
 const combined=and(...unique)
 let sql=`SELECT 1 WHERE ${combined.sql}`,values=combined.values
 if(values.length>100-reservedBindings||new TextEncoder().encode(sql).byteLength>100000){
  if(values.some(value=>value instanceof Uint8Array))throw new AdmissionError('capacity_limit','This preview fence exceeds D1 binary binding capacity.')
  // Per-record guards share their SQL template. Evaluate each template over its
  // exact bound rows instead of repeating it hundreds of times in a large AND.
  const groups=new Map<string,SqlPredicate[]>()
  for(const guard of unique){const group=groups.get(guard.sql)??[];group.push(guard);groups.set(guard.sql,group)}
  const parts=[...groups].map(([expression],index)=>`NOT EXISTS(SELECT 1 FROM json_each(json_extract(payload,'$[${index}]')) AS guard_row WHERE (${bindExpression(expression,i=>`json_extract(guard_row.value,'$[${i}]')`)}) IS NOT TRUE)`)
  sql=`SELECT 1 FROM (SELECT ? AS payload) WHERE ${and(...parts.map(part=>trustedPredicate(part))).sql}`
  values=[canonical([...groups.values()].map(group=>group.map(guard=>guard.values)))]
 }
 if(new TextEncoder().encode(sql).byteLength>100000||values.some(value=>typeof value==='string'&&new TextEncoder().encode(value).byteLength>1900000))throw new AdmissionError('capacity_limit','This preview fence exceeds D1 statement or value capacity.')
 return {sql,values}
}
/** Evaluate all guards in one SQLite snapshot, within D1 statement and binding limits. */
export async function assertGuards(db:D1Database,guards:readonly SqlPredicate[]) {
 const {sql,values}=guardQuery(guards)
 if(!await db.prepare(sql).bind(...values).first())throw new AdmissionError('version_conflict','This preview is stale: data, schema or authority changed. Prepare a new preview.')
}
