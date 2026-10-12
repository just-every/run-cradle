import test from 'node:test'
import assert from 'node:assert/strict'
import { environment } from './launch-support.mjs'
import { installSearchCorpus, assertSearch, searchId, searchTypes } from './helpers/launch-search-corpus.mjs'

test('[VIEW-005 SEARCH-001] mixed search preserves prefix, archive, deterministic type/ID limits and current records', async () => {
  const e = await environment()
  try {
    const corpus = await installSearchCorpus(e.db, e.actor), repository = e.r.createSearchRepository({ $client: e.db })
    for (const query of ['common', 'COM', 'comm* dock', 'harb shi', 'CODE', 'window', 'cafe', '東京', 'dock_%', 'common-har', 'arbor', 'unsearchableobjective', 'unsearchablesignal', 'unsearchablecomment', '" OR common', '***']) {
      await assertSearch(repository, corpus, query)
      await assertSearch(repository, corpus, query, true)
    }
    assert.equal((await assertSearch(repository, corpus, 'common')).length, 100)
    const c = corpus.campaigns.get(searchId(31))
    c.name = 'Freshly renamed'; c.code = 'CHANGED31'; c.summary = 'Newsummary'
    await e.db.prepare('UPDATE campaigns SET name=?,code=?,status_summary=?,updated_at=2 WHERE id=?').bind(c.name, c.code, c.summary, c.id).run()
    for (const [recordType, table] of [['Deliverable', 'deliverables'], ['Risk', 'risks'], ['Milestone', 'milestones'], ['Decision', 'decisions']]) {
      const row = corpus.rows.find(row => row.recordType === recordType && row.id === searchId(31))
      row.name = 'Freshly renamed'; row.campaignId = c.id
      await e.db.prepare(`UPDATE ${table} SET title=?,campaign_id=?,updated_at=2 WHERE id=?`).bind(row.name, row.campaignId, row.id).run()
    }
    await assertSearch(repository, corpus, 'fresh')
    await assertSearch(repository, corpus, 'common')
    await assertSearch(repository, corpus, 'chang')
    for (const value of [true, false]) {
      c.archived = value
      await e.db.prepare('UPDATE campaigns SET archived_at=? WHERE id=?').bind(value ? 2 : null, c.id).run()
      await assertSearch(repository, corpus, 'fresh')
      await assertSearch(repository, corpus, 'fresh', true)
    }
    // Child deletion and campaign cascades must remove the current search rows.
    for (const [recordType, table] of [['Deliverable', 'deliverables'], ['Risk', 'risks'], ['Milestone', 'milestones'], ['Decision', 'decisions']]) {
      await e.db.prepare(`DELETE FROM ${table} WHERE id=?`).bind(searchId(32)).run()
      corpus.rows = corpus.rows.filter(row => row.recordType !== recordType || row.id !== searchId(32))
    }
    await e.db.prepare('DELETE FROM campaigns WHERE id=?').bind(c.id).run()
    corpus.campaigns.delete(c.id)
    corpus.rows = corpus.rows.filter(row => row.campaignId !== c.id)
    await assertSearch(repository, corpus, 'fresh', true)
    await assertSearch(repository, corpus, 'common')
    await assertSearch(repository, corpus, 'common', true)
    assert.deepEqual((await e.db.prepare('SELECT record_type,count(*) AS n FROM launch_search GROUP BY record_type ORDER BY record_type').all()).results.map(row => row.record_type), searchTypes)
  } finally { await e.close() }
})

test('[SEARCH-001] hydration reads are bounded after selecting twenty matches per type', async () => {
  const e = await environment()
  try {
    const corpus = await installSearchCorpus(e.db, e.actor)
    let meta
    const client = { prepare: sql => ({ bind: (...args) => ({ all: async () => {
      const result = await e.db.prepare(sql).bind(...args).all(); meta = result.meta; return result
    } }) }) }
    const rows = await assertSearch(e.r.createSearchRepository({ $client: client }), corpus, 'common', true)
    // The previous query hydrated every match (five entity joins), exceeding this
    // linear identity-scan plus bounded-hydration budget on the same corpus.
    const budget = corpus.rows.length * 3 + rows.length * 8
    assert.ok(meta.rows_read <= budget, `Native D1 read ${meta.rows_read} rows; identity/hydration budget ${budget}`)
    console.log('Mixed native search:', JSON.stringify({ records: corpus.rows.length, results: rows.length, rowsRead: meta.rows_read, durationMs: meta.duration, budget }))
  } finally { await e.close() }
})
