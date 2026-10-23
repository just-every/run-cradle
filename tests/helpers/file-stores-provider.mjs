import assert from 'node:assert/strict'
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const files = [['synthetic-cradle-plan.png', 'image/png', 2048], ['synthetic-cradle-notes.pdf', 'application/pdf', 4096], ['synthetic-cradle-budget.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 8192]]
export const storeScopes = { 'google-drive': ['https://www.googleapis.com/auth/drive.metadata.readonly'], onedrive: ['Files.Read', 'offline_access'], dropbox: ['files.metadata.read', 'files.content.read'], box: ['root_readonly'] }
const reads = new Set(['/2/files/list_folder', '/2/files/list_folder/continue', '/2/files/search_v2', '/2/files/get_thumbnail_v2','/revoke','/2/auth/token/revoke'])
/** Synthetic provider edge for the four stores. Records every request so a journey can prove nothing was written or shared. */
export function fileStoresProvider() {
  const seen = [], writes = [],denied=new Set()
  let thumbnailObserver
  const image = async () => {await thumbnailObserver?.();return new Response(png, { headers: { 'content-type': 'image/png' } })}
  const named = (prefix, i) => `${prefix}-${i}`
  return {
    seen, writes, png,denied,observeThumbnails(observer){thumbnailObserver=observer},
    async fetch(request) {
      const u = new URL(request.url); seen.push(`${request.method} ${u.origin}${u.pathname}`)
      const form = async () => new URLSearchParams(await request.clone().text())
      if (request.method !== 'GET' && !u.pathname.endsWith('/token') && !reads.has(u.pathname)) writes.push(`${request.method} ${u.origin}${u.pathname}`)
      if (u.pathname.endsWith('/token')) {
        const code=(await form()).get('code');assert.ok(['synthetic-cradle-code-1', 'synthetic-cradle-code-2','synthetic-cradle-code-reader'].includes(code))
        const body = { access_token: code==='synthetic-cradle-code-reader'?'synthetic-cradle-access-reader':'synthetic-cradle-access-1', refresh_token: 'synthetic-cradle-refresh-1', token_type: 'bearer', expires_in: 3600,...(u.hostname==='api.dropboxapi.com'?{account_id:code==='synthetic-cradle-code-reader'?'synthetic-cradle-namespace-reader':'synthetic-cradle-namespace-1'}:{}) }
        const scope = u.hostname === 'oauth2.googleapis.com' ? storeScopes['google-drive'] : u.hostname === 'login.microsoftonline.com' ? storeScopes.onedrive : u.hostname === 'api.dropboxapi.com' ? storeScopes.dropbox : null
        return Response.json(scope ? { ...body, scope: scope.join(' ') } : body)
      }
      if(u.pathname.endsWith('/revoke')||u.pathname==='/2/auth/token/revoke')return new Response(null,{status:200})
      if((u.pathname==='/drive/v3/files/root')||(u.pathname==='/v1.0/me/drive')||(u.pathname==='/2.0/users/me'))return Response.json({id:request.headers.get('authorization')==='Bearer synthetic-cradle-access-reader'?'synthetic-cradle-namespace-reader':'synthetic-cradle-namespace-1'})
      if(denied.has(request.headers.get('authorization')?.replace('Bearer ','')))return Response.json({error:'synthetic-cradle-access-denied'},{status:403})
      if (u.hostname.endsWith('.googleusercontent.com') || u.hostname.endsWith('.1drv.com')) { assert.ok(['Bearer synthetic-cradle-access-1','Bearer synthetic-cradle-access-reader'].includes(request.headers.get('authorization'))); return image() }
      assert.ok(['Bearer synthetic-cradle-access-1','Bearer synthetic-cradle-access-reader'].includes(request.headers.get('authorization')))
      if (u.hostname === 'www.googleapis.com' && u.pathname === '/drive/v3/files') {
        const q = u.searchParams.get('q') ?? '', match = /name contains '([^']*)'/.exec(q)?.[1]
        return Response.json({ files: files.filter(f => !match || f[0].includes(match)).map((f, i) => ({ id: named('synthetic-cradle-drive', i), name: f[0], mimeType: f[1], size: String(f[2]), modifiedTime: '2026-10-20T01:02:03.000Z', webViewLink: `https://drive.google.com/file/d/${named('synthetic-cradle-drive', i)}/view`, thumbnailLink: 'https://lh3.googleusercontent.com/synthetic-cradle=s220' })) })
      }
      if (u.hostname === 'www.googleapis.com' && u.pathname.startsWith('/drive/v3/files/')) return Response.json({ thumbnailLink: 'https://lh3.googleusercontent.com/synthetic-cradle=s220' })
      if (u.hostname === 'graph.microsoft.com') {
        if (/\/items\//.test(u.pathname)) return Response.json({ id: 'x', name: 'x', webUrl: 'https://synthetic-cradle.sharepoint.com/x', thumbnails: [{ small: { url: 'https://synthetic-cradle.files.1drv.com/small' } }] })
        const match = /search\(q='([^']*)'\)/.exec(decodeURIComponent(u.pathname))?.[1]
        return Response.json({ value: [{ id: 'synthetic-cradle-folder', name: 'Folder', webUrl: 'https://synthetic-cradle.sharepoint.com/f', folder: {} }, ...files.filter(f => !match || f[0].includes(match)).map((f, i) => ({ id: named('synthetic-cradle-onedrive', i), name: f[0], size: f[2], lastModifiedDateTime: '2026-10-20T01:02:03Z', webUrl: `https://synthetic-cradle.sharepoint.com/${f[0]}`, file: { mimeType: f[1] } }))] })
      }
      if (u.hostname === 'api.dropboxapi.com' || u.hostname === 'content.dropboxapi.com') {
        if (u.pathname === '/2/files/get_thumbnail_v2') { assert.match(request.headers.get('dropbox-api-arg'), /"id:synthetic-cradle-dropbox-0"/); return image() }
        const body = await request.json(), entries = files.map((f, i) => ({ '.tag': 'file', id: named('id:synthetic-cradle-dropbox', i), name: f[0], path_display: `/Synthetic Cradle/${f[0]}`, size: f[2], server_modified: '2026-10-20T01:02:03Z' }))
        return Response.json(u.pathname === '/2/files/search_v2' ? { matches: entries.filter(e => e.name.includes(body.query)).map(e => ({ metadata: { '.tag': 'metadata', metadata: e } })) } : { entries: [{ '.tag': 'folder', id: 'id:synthetic-cradle-folder', name: 'Folder' }, ...entries], has_more: false, cursor: 'synthetic-cradle-cursor' })
      }
      if (u.hostname === 'api.box.com') {
        if (u.pathname.endsWith('/thumbnail.png')) return image()
        const query = u.searchParams.get('query')
        return Response.json({ total_count: files.length, offset: 0, limit: 25, entries: [{ type: 'folder', id: 'synthetic-cradle-folder', name: 'Folder' }, ...files.filter(f => !query || f[0].includes(query)).map((f, i) => ({ type: 'file', id: named('synthetic-cradle-box', i), name: f[0], size: f[2], modified_at: '2026-10-20T01:02:03Z' }))] })
      }
      assert.fail('Unexpected provider request ' + request.url)
    },
  }
}
