import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { contract } from './contract.mjs'
import { launchBaseAuthorityRuntime } from './helpers/launch-base-authority-runtime.mjs'
import { seedConfig } from '../src/ext/config.ts'

contract('HOME-002 AUTH-BASE-001', 'Actual emitted public SSR survives unavailable workspace names and recovers persisted renames', async () => {
  const h = await launchBaseAuthorityRuntime()
  const receipt = { environment: 'Actual emitted Worker, fresh native D1; synthetic fixtures only', checks: [] }
  try {
    const owner = await h.bootstrap()
    assert.equal((await h.request('/app', { headers: { cookie: owner.cookie } })).status, 200)
    for (const configured of [true]) {
      await h.reconfigure({ MAIL_FROM: configured ? 'synthetic@example.test' : undefined })
      const db = h.db
      await db.prepare('ALTER TABLE workspace RENAME TO unavailable_workspace').run()
      try {
        for (const route of ['/', '/signin']) {
          const response = await h.request(route)
          assert.equal(response.status, 200, `${route} loads while public name is unavailable`)
          const html = await response.text()
          assert.ok(html.includes(route === '/' ? `>Sign in to ${seedConfig.workspaceName}</a>` : `<p class="cr-eyebrow">${seedConfig.workspaceName}</p>`), 'Configured public name is present before hydration')
          assert.doesNotMatch(html, /unavailable_workspace|SQLITE|SELECT name|Protected campaign|synthetic-launch-authority-test-signing-key|PRIVATE-QUERY-ERROR-SENTINEL/)
          if (route === '/signin') {
            assert.equal(html.includes('Send sign-in link'), configured, 'Server-rendered controls retain configured mail capability')
            assert.equal(html.includes('Magic-link sign-in is not configured'), !configured)
          }
          receipt.checks.push({ route, configured, unavailable: true, status: response.status, publicIdentity: true })
        }
      } finally { await db.prepare('ALTER TABLE unavailable_workspace RENAME TO workspace').run() }
      await db.prepare("UPDATE workspace SET name=? WHERE id='workspace'").bind('Recovered public rename').run()
      assert.equal((await db.prepare("SELECT name FROM workspace WHERE id='workspace'").first()).name, 'Recovered public rename')
      for (const route of ['/', '/signin']) {
        const response = await h.request(route)
        assert.equal(response.status, 200)
        const html = await response.text()
        assert.ok(html.includes(route === '/' ? '>Sign in to Recovered public rename</a>' : '<p class="cr-eyebrow">Recovered public rename</p>'), route + ': ' + html.match(/<(?:a class="lp-go"|p class="cr-eyebrow")[^>]*>[^<]*<\/(?:a|p)>/g)?.join(' '))
        receipt.checks.push({ route, configured, recoveredRename: true, status: response.status })
      }
    }
    // Hosted mail is part of installation readiness. A missing sender remains
    // an explicit configuration failure, distinct from an unavailable name read.
    await h.reconfigure({ MAIL_FROM: undefined })
    for (const route of ['/', '/signin']) {
      const response = await h.request(route)
      assert.equal(response.status, 503)
      const error = await response.json()
      assert.equal(error.error.code, 'unconfigured')
      assert.ok(error.error.missing.includes('MAIL_FROM'))
      receipt.checks.push({ route, configured: false, status: response.status, unconfigured: true })
    }
    if (process.env.CRADLE_PUBLIC_EVIDENCE) {
      await mkdir(process.env.CRADLE_PUBLIC_EVIDENCE, { recursive: true })
      await writeFile(path.join(process.env.CRADLE_PUBLIC_EVIDENCE, 'public-ssr.json'), JSON.stringify(receipt, null, 2) + '\n')
    }
  } finally { await h.close() }
})
