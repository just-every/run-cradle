import assert from 'node:assert/strict'
import { execFile, execFileSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { sitePreview } from '../../node_modules/@runeditrun/rer/cli/site-preview.mjs'

const execute = promisify(execFile)
const root = fileURLToPath(new URL('../../', import.meta.url))
const cli = path.join(root, 'node_modules/@runeditrun/rer/bin/rer.mjs')
const links = html => [...html.matchAll(/<a\b[^>]*?\shref="([^"]*)"/g)].map(match => match[1])
const element = (html, tag) => html.slice(html.search(new RegExp(`<${tag}\\b`))).split(`</${tag}>`)[0]

/** Build a disposable source tree through the pinned CLI, then read only emitted files over HTTP. */
export async function staticSiteJourney({ inspect = async () => {} } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'cradle-static-site-'))
  const receipt = { command: 'rer build --site', pages: [], builds: [] }
  let server
  try {
    // Copy tracked inputs, including local edits, without any installation state or secrets.
    const { stdout } = await execute('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 4 * 1024 * 1024 })
    for (const name of stdout.split('\0').filter(Boolean)) {
      const target = path.join(directory, name)
      await mkdir(path.dirname(target), { recursive: true })
      await cp(path.join(root, name), target)
    }
    await symlink(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'dir')
    const build = async () => {
      try {
        const result = await execute(process.execPath, [cli, 'build', '--site'], {
          cwd: directory, timeout: 120_000, maxBuffer: 8 * 1024 * 1024,
          env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
        })
        return { exit: 0, output: result.stdout + result.stderr }
      } catch (error) {
        assert.equal(typeof error.code, 'number', `The build must exit normally: ${error.message}`)
        return { exit: error.code, output: error.stdout + error.stderr }
      }
    }

    const manifest = JSON.parse(await readFile(path.join(directory, 'docs/site.json'), 'utf8'))
    const entries = manifest.sections.flatMap(section => section.pages)
    assert.ok(entries.length > 0, 'The published navigation must contain pages')
    for (const [index, entry] of entries.entries()) {
      entry.marker = `synthetic-cradle-static-document-${index}`
      const file = path.join(directory, entry.source)
      await writeFile(file, `${await readFile(file, 'utf8')}\n\n${entry.marker}\n`)
    }
    const source = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8')).repository.url.replace(/\.git$/, '')
    const entry = entries[0]
    const input = path.join(directory, entry.source)
    const original = await readFile(input, 'utf8')
    // Each defect is built separately, so one refusal cannot conceal the other.
    for (const [kind, href, diagnostic] of [
      ['missing target', './synthetic-cradle-missing.md', /synthetic-cradle-missing\.md.*does not exist/],
      ['missing heading', '#synthetic-cradle-missing-heading', /#synthetic-cradle-missing-heading.*no such heading/],
    ]) {
      try {
        await writeFile(input, `${original}\n\n[Build refusal control](${href})\n`)
        const result = await build()
        assert.notEqual(result.exit, 0, `${kind}: the real build must refuse the broken link`)
        assert.ok(result.output.includes(entry.source), `${kind}: the diagnostic names the source page`)
        assert.match(result.output, diagnostic, `${kind}: the diagnostic names the actual defect`)
        receipt.builds.push({ kind, exit: result.exit, source: entry.source, href, diagnostic: result.output.match(diagnostic)[0] })
      } finally { await writeFile(input, original) }
    }
    const control = await build()
    assert.equal(control.exit, 0, `Restored inputs must build successfully:\n${control.output}`)
    receipt.builds.push({ kind: 'restored control', exit: control.exit })

    server = await sitePreview(path.join(directory, 'dist/site'), { ports: [0] })
    const landing = await fetch(server.url)
    assert.equal(landing.status, 200, 'The built landing is public')
    const home = await landing.text()
    const footerLinks = links(element(home, 'footer'))
    for (const entry of entries) {
      const route = entry.slug ? `/docs/${entry.slug}` : '/docs'
      const response = await fetch(server.url + route, { redirect: 'manual' })
      assert.equal(response.status, 200, `${route} is served without a session or redirect`)
      assert.match(response.headers.get('content-type'), /^text\/html/, route)
      const html = await response.text()
      const header = element(html, 'header'), footer = element(html, 'footer')
      assert.match(header, /class="site-header\b/, `${route} has the shared header`)
      assert.deepEqual(links(header), ['/', '/docs', '/contract', source], `${route} has the static site's navigation`)
      assert.match(header, /<a\b[^>]*aria-current="page"[^>]*href="\/docs"|<a\b[^>]*href="\/docs"[^>]*aria-current="page"/, `${route} marks Docs current`)
      assert.match(footer, /class="site-footer\b/, `${route} has the shared footer`)
      assert.deepEqual(links(footer), ['/', ...footerLinks.map(href => href.startsWith('#') ? '/' + href : href)], `${route} shares the landing footer and its working section targets`)
      assert.ok(links(html).includes(`${source}/edit/main/${entry.source}`), `${route} links the editable Markdown source`)
      assert.ok(element(html, 'main').includes(entry.marker), `${route} renders its own Markdown source`)
      assert.doesNotMatch(html, /href="\/(?:signin|app)(?:[/?#"])/, `${route} has no installed sign-in or workspace link`)
      for (const label of ['Sign in', 'Open workspace']) assert.ok(![header, footer].some(chrome => chrome.includes(`>${label}<`)), `${route} omits ${label}`)
      for (const page of entries) {
        const href = page.slug ? `/docs/${page.slug}` : '/docs'
        assert.ok(links(html).includes(href), `${route} includes the published navigation target ${href}`)
      }
      receipt.pages.push({ route, status: response.status, source: entry.source, sharedChrome: true, docsCurrent: true, editableSource: true, installedLinks: false })
    }
    await inspect(server.url, entries)
    return receipt
  } finally {
    try { await server?.close() } finally { await rm(directory, { recursive: true, force: true }) }
  }
}

// Serve the deployable artifact, with no application server or SPA fallback.
export async function serveStaticSite() {
  execFileSync('pnpm', ['exec', 'rer', 'build', '--site'], {
    encoding: 'utf8', timeout: 180_000, maxBuffer: 16 * 1024 * 1024,
  })
  const root = await realpath('dist/site')
  const html = await readFile(path.join(root, 'index.html'))
  const requests = []
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }
  const server = createServer(async (request, response) => {
    const row = { method: request.method, path: new URL(request.url, 'http://localhost').pathname }
    requests.push(row)
    try {
      const relative = decodeURIComponent(row.path).replace(/^\/+/, '')
      const candidate = path.resolve(root, relative)
      assert.ok(candidate === root || candidate.startsWith(root + path.sep))
      let file
      for (const name of [candidate, path.join(candidate, 'index.html'), candidate + '.html']) {
        if ((await stat(name).catch(() => null))?.isFile()) { file = await realpath(name); break }
      }
      assert.ok(file?.startsWith(root + path.sep), 'Only emitted files may be served')
      const bytes = await readFile(file)
      row.status = 200
      row.file = path.relative(root, file)
      row.sha256 = createHash('sha256').update(bytes).digest('hex')
      response.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
      response.end(bytes)
    } catch {
      row.status = 404
      response.writeHead(404, { 'content-type': 'text/plain' })
      response.end('Not found')
    }
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    build: { command: 'pnpm exec rer build --site', htmlSha256: createHash('sha256').update(html).digest('hex') },
    requests,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  }
}
