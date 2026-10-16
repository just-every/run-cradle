import { sampleData } from '../core/features/sample-data/data'

/** Sample colleagues use normal member projections, without issuing credentials. */
export async function seedMembers(db: D1Database, now: Date, ownerId: string) {
  const membership = await db.prepare(`SELECT p.rules_json FROM authority_memberships m JOIN authority_policies p ON p.id=m.policy_id
    WHERE m.principal_id=? AND m.app_id='00000000000000000000000700'`).bind(ownerId).first<{rules_json:string}>()
  if (!membership) throw new Error('Demo owner Launch policy is missing')
  for (const member of sampleData.operators) {
    const rules = JSON.parse(membership.rules_json).map((rule: Record<string,unknown>) => ({...rule,principals:[{kind:'human',id:member.id}]}))
    await db.batch([
      db.prepare('INSERT OR IGNORE INTO operators(id,created_at,updated_at,version,name,email,active) VALUES(?,?,?,1,?,?,1)')
        .bind(member.id,now.getTime(),now.getTime(),member.name,member.email),
      db.prepare("INSERT OR IGNORE INTO oa_operators(id,email,display_name,role,status,version,created_at) VALUES(?,?,?,'member','active',1,?)")
        .bind(member.id,member.email,member.name,now.getTime()),
      db.prepare("INSERT OR IGNORE INTO authority_policies(id,app_id,name,rules_json,created_at,updated_at,version) VALUES(?,'00000000000000000000000700',?,?,?, ?,1)")
        .bind(member.id,member.name,JSON.stringify(rules),now.getTime(),now.getTime()),
      db.prepare("INSERT OR IGNORE INTO authority_memberships(principal_id,app_id,policy_id,legacy,state,version) VALUES(?,'00000000000000000000000700',?,1,'active',1)")
        .bind(member.id,member.id),
    ])
  }
  const shift = Date.parse(now.toISOString().slice(0,10)) - Date.parse(sampleData.workspace.updatedAt.slice(0,10))
  const sources = {campaigns:sampleData.campaigns,deliverables:sampleData.deliverables,milestones:sampleData.milestones,risks:sampleData.risks,decisions:sampleData.decisions}
  const rows = (await db.prepare('SELECT table_name,record_id,original_json FROM launch_sample_records').all<{table_name:string;record_id:string;original_json:string}>()).results
  for (const row of rows) {
    const table = row.table_name as keyof typeof sources
    if (!Object.hasOwn(sources,table)) throw new Error('Unexpected demo sample table')
    const original = JSON.parse(row.original_json)
    const sample = sources[table].find(item => 'code' in item ? original.code.startsWith(`SAMPLE-${item.code}-`) : original.title===item.title) as Record<string,unknown>|undefined
    if (!sample) throw new Error('Demo sample provenance is missing')
    const changes:Record<string,string|number> = {}
    for (const key of ['ownerId','requesterId','assigneeId','completedById']) {
      if (sampleData.operators.some(member=>member.id===sample[key])) changes[key.replace(/[A-Z]/g,c=>'_'+c.toLowerCase())] = String(sample[key])
    }
    for (const key of ['startDate','launchDate','dueDate','endDate','dueAt','completedAt']) {
      const column = key.replace(/[A-Z]/g,c=>'_'+c.toLowerCase())
      if (typeof sample[key] !== 'string' || !(column in original)) continue
      const shifted = new Date(Date.parse(sample[key])+shift)
      changes[column] = key.endsWith('At') ? shifted.getTime() : shifted.toISOString().slice(0,10)
    }
    Object.assign(original,changes)
    const columns=Object.keys(changes)
    if (!columns.length) continue
    await db.batch([
      db.prepare(`UPDATE ${table} SET ${columns.map(column=>column+'=?').join(',')} WHERE id=?`).bind(...Object.values(changes),row.record_id),
      db.prepare('UPDATE launch_sample_records SET original_json=? WHERE table_name=? AND record_id=?').bind(JSON.stringify(original),table,row.record_id),
    ])
  }
}
