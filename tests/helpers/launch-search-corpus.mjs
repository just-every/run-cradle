import assert from 'node:assert/strict'

export const searchTypes = ['Campaign', 'Decision', 'Deliverable', 'Milestone', 'Risk']
export const searchId = n => String(n).padStart(26, '0')
const title = n => n % 7 === 0 ? 'Common docking Café 東京' : 'Common harbor shipping'
const archived = n => n <= 30 || n % 11 === 0

/** Synthetic mixed corpus; expected results never read the FTS table or query SQL. */
export async function installSearchCorpus(db, actor, count = 300) {
  const rows = [], campaigns = new Map()
  for (let n = 1; n <= count; n++) {
    const campaign = { id: searchId(n), code: `CODE${n}`, name: title(n), summary: 'Window readiness', archived: archived(n) }
    campaigns.set(campaign.id, campaign)
    rows.push({ id: campaign.id, recordType: 'Campaign', campaignId: campaign.id, name: campaign.name })
    for (const recordType of searchTypes.filter(type => type !== 'Campaign')) {
      rows.push({ id: searchId(n), recordType, campaignId: searchId((n * 37) % count + 1), name: title(n) })
    }
  }
  // Reverse insertion order deliberately disagrees with ID order, including ties
  // in names and the same ID appearing in every entity table.
  for (let n = count; n > 0; n -= 50) {
    const batch = []
    for (let k = n; k > Math.max(0, n - 50); k--) {
      const c = campaigns.get(searchId(k))
      batch.push(db.prepare(`INSERT INTO campaigns(id,created_at,updated_at,version,code,name,owner_id,start_date,launch_date,objective,status_summary,phase,status,health,health_updated_at,budget_minor,spend_minor,archived_at)
        VALUES(?,1,1,1,?,?,?,'2026-01-01','2026-10-01','unsearchableobjective',?,'Planning','On track',70,1,0,0,?)`).bind(c.id, c.code, c.name, actor, c.summary, c.archived ? 1 : null))
    }
    await db.batch(batch)
  }
  for (let offset = rows.length; offset > 0; offset -= 100) {
    const batch = rows.slice(Math.max(0, offset - 100), offset).reverse().filter(row => row.recordType !== 'Campaign').map(row => {
      const common = [row.id, row.campaignId, actor, row.name]
      if (row.recordType === 'Deliverable') return db.prepare("INSERT INTO deliverables(id,created_at,updated_at,version,campaign_id,owner_id,title,state) VALUES(?,1,1,1,?,?,?,'Open')").bind(...common)
      if (row.recordType === 'Risk') return db.prepare("INSERT INTO risks(id,created_at,updated_at,version,campaign_id,owner_id,title,severity,signal,mitigation,state) VALUES(?,1,1,1,?,?,?,'Low','unsearchablesignal','','Watching')").bind(...common)
      if (row.recordType === 'Milestone') return db.prepare("INSERT INTO milestones(id,created_at,updated_at,version,campaign_id,owner_id,title,type,status,start_date) VALUES(?,1,1,1,?,?,?,'Launch','Not started','2026-09-01')").bind(...common)
      return db.prepare("INSERT INTO decisions(id,created_at,updated_at,version,campaign_id,requester_id,title,priority,due_at,recommendation,impact,state) VALUES(?,1,1,1,?,?,?,'Normal',1,'','','Unresolved')").bind(...common)
    })
    if (batch.length) await db.batch(batch)
  }
  await db.prepare('INSERT INTO comments(id,created_at,updated_at,version,campaign_id,author_id,body) VALUES(?,1,1,1,?,?,?)')
    .bind(searchId(1), searchId(31), actor, 'unsearchablecomment').run()
  return { rows, campaigns }
}

const words = value => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
export function expectedSearch(corpus, query, includeArchived) {
  const tokens = words(query)
  if (!tokens.length) return []
  return searchTypes.flatMap(recordType => corpus.rows.filter(row => {
    const c = corpus.campaigns.get(row.campaignId)
    if (!c || row.recordType !== recordType || (!includeArchived && c.archived)) return false
    const haystack = words(row.recordType === 'Campaign' ? `${c.name} ${c.code} ${c.summary}` : row.name)
    return tokens.every(token => haystack.some(word => word.startsWith(token)))
  }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).slice(0, 20).map(row => {
    const c = corpus.campaigns.get(row.campaignId)
    return { id: row.id, recordType, campaignCode: c.code, name: recordType === 'Campaign' ? c.name : row.name, code: c.code }
  }))
}

export async function assertSearch(repository, corpus, query, includeArchived = false) {
  const expected = expectedSearch(corpus, query, includeArchived)
  assert.deepEqual(await repository.search(query, includeArchived), expected, `${JSON.stringify(query)} archived=${includeArchived}`)
  return expected
}
