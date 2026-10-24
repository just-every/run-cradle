import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const files = [['synthetic-cradle-plan.png', 'image/png', 2048], ['synthetic-cradle-notes.pdf', 'application/pdf', 4096], ['synthetic-cradle-budget.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 8192]]
export const storeScopes = { 'google-drive': ['https://www.googleapis.com/auth/drive.readonly'], onedrive: ['Files.Read', 'offline_access'], dropbox: ['files.metadata.read', 'files.content.read'], box: ['root_readonly'] }
const reads = new Set(['/2/files/download','/2/files/get_metadata', '/2/files/list_folder', '/2/files/list_folder/continue', '/2/files/search_v2', '/2/files/get_thumbnail_v2','/revoke','/2/auth/token/revoke'])
/** Synthetic provider edge for the four stores. Records every request so a journey can prove nothing was written or shared. */
export function fileStoresProvider() {
  const seen = [], writes = [],denied=new Set()
  const changed = new Set()
  const payload = (provider, index) => Buffer.alloc(files[index][2], `synthetic-cradle-${provider}-${index}-${changed.has(`${provider}:${index}`) ? 'changed' : 'original'}`)
  const hash = (algorithm, data) => createHash(algorithm).update(data).digest()
  const hashes = (provider, index) => {
    const bytes=payload(provider,index), quickxor=Buffer.alloc(20)
    for(let i=0;i<bytes.length;i++)for(let bit=0;bit<8;bit++)if(bytes[i]&(1<<bit)){const position=(i*11+bit)%160;quickxor[position>>3]^=1<<(position%8)}
    const length=Buffer.alloc(8);length.writeBigUInt64LE(BigInt(bytes.length));for(let i=0;i<8;i++)quickxor[12+i]^=length[i]
    return {sha256:hash('sha256',bytes).toString('hex'),sha1:hash('sha1',bytes).toString('hex'),md5:hash('md5',bytes).toString('hex'),quickxor:quickxor.toString('base64'),dropbox:hash('sha256',hash('sha256',bytes)).toString('hex')}
  }
  const indexOf = itemId => Number(/-(\d+)$/.exec(itemId)?.[1])
  const drive = (f,i) => ({id:named('synthetic-cradle-drive',i),name:f[0],mimeType:f[1],size:String(f[2]),modifiedTime:'2026-10-20T01:02:03.000Z',webViewLink:`https://drive.google.com/file/d/${named('synthetic-cradle-drive',i)}/view`,thumbnailLink:'https://lh3.googleusercontent.com/synthetic-cradle=s220',sha256Checksum:hashes('google-drive',i).sha256,sha1Checksum:hashes('google-drive',i).sha1,md5Checksum:hashes('google-drive',i).md5,trashed:false})
  const graph = (f,i) => ({id:named('synthetic-cradle-onedrive',i),name:f[0],size:f[2],lastModifiedDateTime:'2026-10-20T01:02:03Z',webUrl:`https://synthetic-cradle.sharepoint.com/${f[0]}`,file:{mimeType:f[1],hashes:{quickXorHash:hashes('onedrive',i).quickxor}},thumbnails:[{small:{url:'https://synthetic-cradle.files.1drv.com/small'}}]})
  const dropbox = (f,i) => ({'.tag':'file',id:named('id:synthetic-cradle-dropbox',i),name:f[0],path_display:`/Synthetic Cradle/${f[0]}`,size:f[2],server_modified:'2026-10-20T01:02:03Z',content_hash:hashes('dropbox',i).dropbox})
  const box = (f,i) => ({type:'file',id:named('synthetic-cradle-box',i),name:f[0],size:f[2],modified_at:'2026-10-20T01:02:03Z',sha1:hashes('box',i).sha1,item_status:'active'})
  let thumbnailObserver
  const image = async () => {await thumbnailObserver?.();return new Response(png, { headers: { 'content-type': 'image/png' } })}
  const named = (prefix, i) => `${prefix}-${i}`
  return {
    seen, writes, png,payload,denied,changeDigest(provider,itemId){const i=indexOf(itemId);assert.ok(files[i]);changed.add(`${provider}:${i}`)},observeThumbnails(observer){thumbnailObserver=observer},
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
      if(u.pathname.startsWith('/synthetic-cradle-content-')&&(u.hostname==='synthetic-cradle.files.1drv.com'||u.hostname==='dl.boxcloud.com')){assert.equal(request.headers.get('authorization'),null,'Redirected downloads never receive the store bearer token');return new Response(payload(u.hostname==='dl.boxcloud.com'?'box':'onedrive',indexOf(u.pathname)))}
      if (u.hostname.endsWith('.googleusercontent.com') || u.hostname.endsWith('.1drv.com')) { assert.ok(['Bearer synthetic-cradle-access-1','Bearer synthetic-cradle-access-reader'].includes(request.headers.get('authorization'))); return image() }
      assert.ok(['Bearer synthetic-cradle-access-1','Bearer synthetic-cradle-access-reader'].includes(request.headers.get('authorization')))
      if (u.hostname === 'www.googleapis.com' && u.pathname === '/drive/v3/files') {
        const q = u.searchParams.get('q') ?? '', match = /name contains '([^']*)'/.exec(q)?.[1]
        return Response.json({ files: files.map(drive).filter(f => !match || f.name.includes(match)) })
      }
      if(u.hostname==='www.googleapis.com'&&u.searchParams.get('alt')==='media'){const i=indexOf(u.pathname);return new Response(payload('google-drive',i))}
      if (u.hostname === 'www.googleapis.com' && u.pathname.startsWith('/drive/v3/files/')) {const i=indexOf(u.pathname);return files[i]?Response.json(drive(files[i],i)):Response.json({error:'synthetic-cradle-not-found'},{status:404})}
      if (u.hostname === 'graph.microsoft.com') {
        if(u.pathname.endsWith('/content')){const i=indexOf(u.pathname.replace(/\/content$/,''));return new Response(null,{status:302,headers:{location:`https://synthetic-cradle.files.1drv.com/synthetic-cradle-content-${i}`}})}
        if (/\/items\//.test(u.pathname)) {const i=indexOf(u.pathname);return files[i]?Response.json(graph(files[i],i)):Response.json({error:'synthetic-cradle-not-found'},{status:404})}
        const match = /search\(q='([^']*)'\)/.exec(decodeURIComponent(u.pathname))?.[1]
        return Response.json({ value: [{ id: 'synthetic-cradle-folder', name: 'Folder', webUrl: 'https://synthetic-cradle.sharepoint.com/f', folder: {} }, ...files.map(graph).filter(f => !match || f.name.includes(match))] })
      }
      if (u.hostname === 'api.dropboxapi.com' || u.hostname === 'content.dropboxapi.com') {
        if(u.pathname==='/2/files/download'){const i=indexOf(JSON.parse(request.headers.get('dropbox-api-arg')).path);return new Response(payload('dropbox',i))}
        if (u.pathname === '/2/files/get_thumbnail_v2') { assert.match(request.headers.get('dropbox-api-arg'), /"id:synthetic-cradle-dropbox-0"/); return image() }
        const body = await request.json(), entries = files.map(dropbox)
        if(u.pathname==='/2/files/get_metadata'){const entry=entries.find(e=>e.id===body.path);return entry?Response.json(entry):Response.json({error:{'.tag':'path',path:{'.tag':'not_found'}}},{status:409})}
        return Response.json(u.pathname === '/2/files/search_v2' ? { matches: entries.filter(e => e.name.includes(body.query)).map(e => ({ metadata: { '.tag': 'metadata', metadata: e } })) } : { entries: [{ '.tag': 'folder', id: 'id:synthetic-cradle-folder', name: 'Folder' }, ...entries], has_more: false, cursor: 'synthetic-cradle-cursor' })
      }
      if (u.hostname === 'api.box.com') {
        if(u.pathname.endsWith('/content')){const i=indexOf(u.pathname.replace(/\/content$/,''));return new Response(null,{status:302,headers:{location:`https://dl.boxcloud.com/synthetic-cradle-content-${i}`}})}
        if (u.pathname.endsWith('/thumbnail.png')) return image()
        if(u.pathname.startsWith('/2.0/files/')){const i=indexOf(u.pathname);return files[i]?Response.json(box(files[i],i)):Response.json({error:'synthetic-cradle-not-found'},{status:404})}
        const query = u.searchParams.get('query')
        return Response.json({ total_count: files.length, offset: 0, limit: 25, entries: [{ type: 'folder', id: 'synthetic-cradle-folder', name: 'Folder' }, ...files.map(box).filter(f => !query || f.name.includes(query))] })
      }
      assert.fail('Unexpected provider request ' + request.url)
    },
  }
}
