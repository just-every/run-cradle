import { z } from 'zod';
import type { CredentialPort } from './contracts';
import { ProviderTransport } from './transport.server';
import type { WireResponse } from './transport.server';
import type { FileStoreProvider } from '../domains/connections/oauth.server';

/** One chosen file's metadata; no bytes. `thumbnail` says the store offers an image on demand. */
export type StoreItem = { itemId: string; name: string; mediaType: string; size: number | null; modifiedAt: string | null; link: string; thumbnail: boolean };
export type StoreBrowse = { items: StoreItem[]; next: string | null };
export type StoreThumbnail = { contentType: string; base64: string };
export type FileStoreAdapter = {
  browse(connectionId: string, jobId: string, request: { query: string | null; cursor: string | null }): Promise<StoreBrowse>;
  thumbnail(connectionId: string, jobId: string, itemId: string): Promise<StoreThumbnail | null>;
};
const PAGE = 25;
const thumbnailTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const extensions: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', txt: 'text/plain', csv: 'text/csv', mp4: 'video/mp4', mp3: 'audio/mpeg', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
const byName = (name: string) => extensions[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
const isoOrNull = (value: string | undefined) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const sizeOrNull = (value: string | number | undefined) => value === undefined || value === '' ? null : Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
function ok(response: WireResponse, what: string) { if (response.status !== 200) throw new Error(`${what} was refused (HTTP ${response.status})`); return response.body; }
function image(response: WireResponse, forced?: string): StoreThumbnail | null {
  if (response.status !== 200 || !response.body || typeof response.body !== 'object') return null;
  const body = response.body as StoreThumbnail, contentType = forced ?? body.contentType;
  return thumbnailTypes.has(contentType) ? { contentType, base64: body.base64 } : null;
}

const driveFile = z.object({ id: z.string().min(1), name: z.string().min(1), mimeType: z.string(), size: z.string().optional(), modifiedTime: z.string().optional(), webViewLink: z.string().min(1), thumbnailLink: z.string().optional() });
const driveList = z.object({ files: z.array(driveFile).max(1000), nextPageToken: z.string().optional() });
const graphItem = z.object({ id: z.string().min(1), name: z.string().min(1), size: z.number().optional(), lastModifiedDateTime: z.string().optional(), webUrl: z.string().min(1), file: z.object({ mimeType: z.string().optional() }).optional(), folder: z.unknown().optional(), thumbnails: z.array(z.object({ small: z.object({ url: z.string() }).optional() })).optional() });
const graphList = z.object({ value: z.array(graphItem).max(1000), '@odata.nextLink': z.string().optional() });
const dropboxFile = z.object({ '.tag': z.string(), id: z.string().min(1), name: z.string().min(1), path_display: z.string().optional(), size: z.number().optional(), server_modified: z.string().optional() });
const dropboxList = z.object({ entries: z.array(dropboxFile).max(1000), cursor: z.string().optional(), has_more: z.boolean().optional() });
const dropboxSearch = z.object({ matches: z.array(z.object({ metadata: z.object({ metadata: dropboxFile }) })).max(1000) });
const boxFile = z.object({ type: z.string(), id: z.string().min(1), name: z.string().min(1), size: z.number().optional(), modified_at: z.string().optional(), extension: z.string().optional() });
const boxList = z.object({ entries: z.array(boxFile).max(1000), total_count: z.number().optional(), offset: z.number().optional(), limit: z.number().optional() });

export function fileStoreAdapter(provider: FileStoreProvider, credentials: CredentialPort, transport = new ProviderTransport()): FileStoreAdapter {
  const deadline = () => new Date(Date.now() + 30_000).toISOString();
  async function auth(connectionId: string, jobId: string) { return { authorization: `Bearer ${(await credentials.resolve(connectionId, 'readback', { jobId })).token}` }; }
  const adapters: Record<FileStoreProvider, FileStoreAdapter> = {
    'google-drive': {
      async browse(id, jobId, { query, cursor }) {
        const escaped = query?.replaceAll('\\', '\\\\').replaceAll("'", "\\'"), q = ["trashed=false", "mimeType!='application/vnd.google-apps.folder'", ...(escaped ? [`name contains '${escaped}'`] : [])].join(' and ');
        const params = new URLSearchParams({ pageSize: String(PAGE), q, orderBy: 'modifiedTime desc', fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,thumbnailLink)' });
        if (cursor) params.set('pageToken', cursor);
        const list = driveList.parse(ok(await transport.request('drive.files', { headers: await auth(id, jobId), query: params, deadline: deadline() }), 'Google Drive list'));
        return { items: list.files.map(f => ({ itemId: f.id, name: f.name, mediaType: f.mimeType, size: sizeOrNull(f.size), modifiedAt: isoOrNull(f.modifiedTime), link: f.webViewLink, thumbnail: !!f.thumbnailLink })), next: list.nextPageToken ?? null };
      },
      async thumbnail(id, jobId, itemId) {
        const headers = await auth(id, jobId), response=await transport.request('drive.file', { ids: [itemId], headers, query: new URLSearchParams({ fields: 'thumbnailLink' }), deadline: deadline() });if([403,404].includes(response.status))return null;const meta = z.object({ thumbnailLink: z.string().optional() }).parse(ok(response, 'Google Drive metadata'));
        return meta.thumbnailLink ? image(await transport.request('drive.thumbnail', { ids: [meta.thumbnailLink], headers, binary: true, maxBytes: 1_000_000, deadline: deadline() })) : null;
      },
    },
    onedrive: {
      async browse(id, jobId, { query, cursor }) {
        const params = new URLSearchParams({ '$top': String(PAGE), '$select': 'id,name,size,lastModifiedDateTime,webUrl,file,folder' });
        if (cursor) params.set('$skiptoken', cursor);
        const list = graphList.parse(ok(await transport.request(query ? 'graph.search' : 'graph.children', { ...(query ? { ids: [query] } : {}), headers: await auth(id, jobId), query: params, deadline: deadline() }), 'OneDrive list'));
        const next = list['@odata.nextLink'] ? new URL(list['@odata.nextLink']).searchParams.get('$skiptoken') : null;
        return { items: list.value.filter(f => !f.folder).map(f => ({ itemId: f.id, name: f.name, mediaType: f.file?.mimeType ?? byName(f.name), size: f.size ?? null, modifiedAt: isoOrNull(f.lastModifiedDateTime), link: f.webUrl, thumbnail: thumbnailTypes.has(f.file?.mimeType ?? byName(f.name)) })), next };
      },
      async thumbnail(id, jobId, itemId) {
        const headers = await auth(id, jobId),response=await transport.request('graph.item', { ids: [itemId], headers, query: new URLSearchParams({ '$expand': 'thumbnails' }), deadline: deadline() });if([403,404].includes(response.status))return null;const item = graphItem.parse(ok(response, 'OneDrive metadata')), url = item.thumbnails?.[0]?.small?.url;
        return url ? image(await transport.request('graph.thumbnail', { ids: [url], headers, binary: true, maxBytes: 1_000_000, deadline: deadline() })) : null;
      },
    },
    dropbox: {
      async browse(id, jobId, { query, cursor }) {
        const headers = await auth(id, jobId);
        const files = (entries: z.infer<typeof dropboxFile>[]) => entries.filter(e => e['.tag'] === 'file').map(e => ({ itemId: e.id, name: e.name, mediaType: byName(e.name), size: e.size ?? null, modifiedAt: isoOrNull(e.server_modified), link: `https://www.dropbox.com/home${(e.path_display ?? '').split('/').map(encodeURIComponent).join('/')}`, thumbnail: thumbnailTypes.has(byName(e.name)) }));
        if (query) return { items: files(dropboxSearch.parse(ok(await transport.request('dropbox.search', { headers, body: { query, options: { max_results: PAGE, file_status: 'active' } }, deadline: deadline() }), 'Dropbox search')).matches.map(m => m.metadata.metadata)), next: null };
        const list = dropboxList.parse(ok(await transport.request(cursor ? 'dropbox.continue' : 'dropbox.list', { headers, body: cursor ? { cursor } : { path: '', limit: PAGE }, deadline: deadline() }), 'Dropbox list'));
        return { items: files(list.entries), next: list.has_more ? list.cursor ?? null : null };
      },
      async thumbnail(id, jobId, itemId) {
        const headers = { ...await auth(id, jobId), 'Dropbox-API-Arg': JSON.stringify({ resource: { '.tag': 'path', path: `id:${itemId.replace(/^id:/, '')}` }, format: 'jpeg', size: 'w128h128' }) };
        return image(await transport.request('dropbox.thumbnail', { headers, binary: true, maxBytes: 1_000_000, deadline: deadline() }), 'image/jpeg');
      },
    },
    box: {
      async browse(id, jobId, { query, cursor }) {
        const params = new URLSearchParams({ limit: String(PAGE), fields: 'id,name,size,modified_at,extension,type', ...(query ? { query, type: 'file' } : {}), ...(cursor ? { offset: cursor } : {}) });
        const list = boxList.parse(ok(await transport.request(query ? 'box.search' : 'box.items', { headers: await auth(id, jobId), query: params, deadline: deadline() }), 'Box list'));
        const offset = (list.offset ?? 0) + list.entries.length, more = list.total_count !== undefined && offset < list.total_count;
        return { items: list.entries.filter(e => e.type === 'file').map(e => ({ itemId: e.id, name: e.name, mediaType: byName(e.name), size: e.size ?? null, modifiedAt: isoOrNull(e.modified_at), link: `https://app.box.com/file/${encodeURIComponent(e.id)}`, thumbnail: true })), next: more ? String(offset) : null };
      },
      async thumbnail(id, jobId, itemId) {
        return image(await transport.request('box.thumbnail', { ids: [itemId], headers: await auth(id, jobId), binary: true, maxBytes: 1_000_000, deadline: deadline() }), 'image/png');
      },
    },
  };
  return adapters[provider];
}
