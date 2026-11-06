import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'

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
