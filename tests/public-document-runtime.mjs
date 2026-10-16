import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { contract } from './contract.mjs'
import { launchBaseAuthorityRuntime } from './helpers/launch-base-authority-runtime.mjs'
import { seedConfig } from '../src/ext/config.ts'

contract('HOME-003 AUTH-BASE-001', 'Actual emitted public SSR survives unavailable workspace names and recovers persisted renames', async () => {
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
          assert.ok(html.includes(route === '/' ? `<title>${seedConfig.workspaceName} · ` : `<p class="cr-eyebrow">${seedConfig.workspaceName}</p>`), 'Configured public name is present before hydration')
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
        assert.ok(html.includes(route === '/' ? '<title>Recovered public rename · ' : '<p class="cr-eyebrow">Recovered public rename</p>'), route + ': ' + html.match(/<(?:title|p class="cr-eyebrow")[^>]*>[^<]*<\/(?:title|p)>/g)?.join(' '))
        receipt.checks.push({ route, configured, recoveredRename: true, status: response.status })
      }
    }
    // Mail remains a readiness failure at the installed home. Sign-in is the
    // deliberate recovery door and must explain how to repair that failure.
    await h.reconfigure({ MAIL_FROM: undefined })
    const unavailableHome = await h.request('/')
    assert.equal(unavailableHome.status, 503)
    const error = await unavailableHome.json()
    assert.equal(error.error.code, 'unconfigured')
    assert.ok(error.error.missing.includes('MAIL_FROM'))
    receipt.checks.push({ route: '/', configured: false, status: unavailableHome.status, unconfigured: true })

    const signin = await h.request('/signin')
    assert.equal(signin.status, 200, 'Sign-in remains available to explain missing hosted mail')
    assert.match(signin.headers.get('content-type'), /^text\/html/)
    const guidance = await signin.text()
    assert.ok(guidance.includes('<p class="cr-eyebrow">Recovered public rename</p>'), 'The recovery door retains the persisted public identity')
    assert.match(guidance, /role="status"/)
    assert.doesNotMatch(guidance, /<input\b[^>]*type="email"|<form[^>]*action="\/auth\/magic-link"/, 'Unconfigured mail cannot offer an unusable email sign-in form')
    assert.doesNotMatch(guidance, /unavailable_workspace|SQLITE|SELECT name|PRIVATE-QUERY-ERROR-SENTINEL/)
    receipt.checks.push({ route: '/signin', configured: false, status: signin.status, actionableMailSetup: true, emailForm: false })

    await h.reconfigure({ MAIL_FROM: 'synthetic@example.test' })
    for (const route of ['/', '/signin']) {
      const response = await h.request(route)
      assert.equal(response.status, 200, 'Repairing the sender restores public readiness')
      const html = await response.text()
      assert.ok(html.includes('Recovered public rename'), 'Mail repair retains the persisted rename')
      if (route === '/signin') assert.match(html, /<form[^>]*action="\/auth\/magic-link"/, 'Configured mail restores the actual sign-in form')
      receipt.checks.push({ route, configured: true, status: response.status, recoveredMail: true, recoveredRename: true })
    }
    if (process.env.CRADLE_PUBLIC_EVIDENCE) {
      await mkdir(process.env.CRADLE_PUBLIC_EVIDENCE, { recursive: true })
      await writeFile(path.join(process.env.CRADLE_PUBLIC_EVIDENCE, 'public-ssr.json'), JSON.stringify(receipt, null, 2) + '\n')
    }
  } finally { await h.close() }
})

const hrefsIn = fragment => [...fragment.matchAll(/<a\b[^>]*?\shref="([^"]*)"/g)].map(match => match[1])
const element = (html, open, close) => html.slice(html.search(open)).split(close)[0]

contract('DOCS-001', 'Every published docs page on the emitted Worker shares the site header and footer', async () => {
  const source = JSON.parse(await readFile('rer-project.json', 'utf8')).sourceRepository
  assert.equal(JSON.parse(await readFile('package.json', 'utf8')).repository.url, source, 'the docs build reads the same public repository as the site chrome')
  const slugs = JSON.parse(await readFile('docs/site.json', 'utf8')).sections.flatMap(section => section.pages.map(page => ({ slug: page.slug, source: page.source })))
  const h = await launchBaseAuthorityRuntime()
  try {
    const page = async route => {
      const response = await h.request(route)
      return { status: response.status, type: response.headers.get('content-type') ?? '', html: await response.text() }
    }
    const origin = new URL(h.origin).origin
    for (const entry of slugs) {
      const route = entry.slug ? `/docs/${entry.slug}` : '/docs'
      const docs = await page(route)
      assert.equal(docs.status, 200, route)
      assert.match(docs.type, /^text\/html/, route)
      const docsHeader = element(docs.html, /<header\b/, '</header>')
      assert.deepEqual(hrefsIn(docsHeader), ['/', '/docs', source, '/signin'], `${route} links home, to the docs, the source and sign-in`)
      assert.match(docsHeader, /<a\b[^>]*aria-current="page"[^>]*href="\/docs"|<a\b[^>]*href="\/docs"[^>]*aria-current="page"/, `${route} marks Docs as current`)
      assert.ok(hrefsIn(element(docs.html, /<footer\b/, '</footer>')).includes(`${source}/blob/main/LICENSE`), `${route} shares the footer`)
      assert.ok(hrefsIn(docs.html).includes(`${source}/edit/main/${entry.source}`), `${route} links to its source`)
      for (const [, reference] of docs.html.matchAll(/<(?:script|img|link|iframe)\b[^>]*?\s(?:src|href)="([^"]*)"/g)) {
        assert.ok(!/^(?:[a-z]+:)?\/\//i.test(reference) || reference.startsWith(origin), `${route} loads ${reference} from another origin`)
      }
    }
    for (const route of ['/docs/no-such-page', '/docs/install/extra']) assert.equal((await page(route)).status, 404, `${route} is a genuine 404`)
  } finally { await h.close() }
})
