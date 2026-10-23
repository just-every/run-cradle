import { z } from 'zod';
import { driveFile, driveList, graphItem, graphList, dropboxFile, dropboxList, dropboxSearch, boxFile, boxList, driveItem, onedriveItem, dropboxItem, boxItem, driveFields, graphFields, boxFields } from './file-stores-metadata.server';
import type { CredentialPort } from './contracts';
import { ProviderTransport } from './transport.server';
import type { WireResponse } from './transport.server';
import type { FileStoreProvider } from '../domains/connections/oauth.server';

/** One chosen file's metadata; no bytes. `thumbnail` says the store offers an image on demand. */
export type StoreItem = { itemId: string; name: string; mediaType: string; size: number | null; modifiedAt: string | null; link: string; thumbnail: boolean; digest: import('../domains/records/portable-store-references').PortableStoreReference['digest'] };
export type StoreBrowse = { items: StoreItem[]; next: string | null };
export type StoreThumbnail = { contentType: string; base64: string };
export type FileStoreAdapter = {
  browse(connectionId: string, jobId: string, request: { query: string | null; cursor: string | null }): Promise<StoreBrowse>;
  thumbnail(connectionId: string, jobId: string, itemId: string): Promise<StoreThumbnail | null>;
  metadata(connectionId: string, jobId: string, itemId: string): Promise<StoreItem | null>;
};
const PAGE = 25;
function checked(item: StoreItem, itemId: string) { if (item.itemId !== itemId) throw new Error('File store returned a different item'); return item; }
const thumbnailTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
function ok(response: WireResponse, what: string) { if (response.status !== 200) throw new Error(`${what} was refused (HTTP ${response.status})`); return response.body; }
function image(response: WireResponse, forced?: string): StoreThumbnail | null {
  if (response.status !== 200 || !response.body || typeof response.body !== 'object') return null;
  const body = response.body as StoreThumbnail, contentType = forced ?? body.contentType;
  return thumbnailTypes.has(contentType) ? { contentType, base64: body.base64 } : null;
}

export function fileStoreAdapter(provider: FileStoreProvider, credentials: CredentialPort, transport = new ProviderTransport()): FileStoreAdapter {
  const deadline = () => new Date(Date.now() + 30_000).toISOString();
  async function auth(connectionId: string, jobId: string) { return { authorization: `Bearer ${(await credentials.resolve(connectionId, 'readback', { jobId })).token}` }; }
  const adapters: Record<FileStoreProvider, FileStoreAdapter> = {
    'google-drive': {
      async browse(id, jobId, { query, cursor }) {
        const escaped = query?.replaceAll('\\', '\\\\').replaceAll("'", "\\'"), q = ["trashed=false", "mimeType!='application/vnd.google-apps.folder'", ...(escaped ? [`name contains '${escaped}'`] : [])].join(' and ');
        const params = new URLSearchParams({ pageSize: String(PAGE), q, orderBy: 'modifiedTime desc', fields: `nextPageToken,files(${driveFields})` });
        if (cursor) params.set('pageToken', cursor);
        const list = driveList.parse(ok(await transport.request('drive.files', { headers: await auth(id, jobId), query: params, deadline: deadline() }), 'Google Drive list'));
        return { items: list.files.map(driveItem), next: list.nextPageToken ?? null };
      },
      async metadata(id, jobId, itemId) {
        const response = await transport.request('drive.file', { ids: [itemId], headers: await auth(id, jobId), query: new URLSearchParams({ fields: driveFields, supportsAllDrives: 'true' }), deadline: deadline() });
        if ([403, 404].includes(response.status)) return null;
        const file = driveFile.parse(ok(response, 'Google Drive metadata'));
        if (file.trashed || file.mimeType === 'application/vnd.google-apps.folder') return null;
        return checked(driveItem(file), itemId);
      },
      async thumbnail(id, jobId, itemId) {
        const headers = await auth(id, jobId), response=await transport.request('drive.file', { ids: [itemId], headers, query: new URLSearchParams({ fields: 'thumbnailLink' }), deadline: deadline() });if([403,404].includes(response.status))return null;const meta = z.object({ thumbnailLink: z.string().optional() }).parse(ok(response, 'Google Drive metadata'));
        return meta.thumbnailLink ? image(await transport.request('drive.thumbnail', { ids: [meta.thumbnailLink], headers, binary: true, maxBytes: 1_000_000, deadline: deadline() })) : null;
      },
    },
    onedrive: {
      async browse(id, jobId, { query, cursor }) {
        const params = new URLSearchParams({ '$top': String(PAGE), '$select': graphFields });
        if (cursor) params.set('$skiptoken', cursor);
        const list = graphList.parse(ok(await transport.request(query ? 'graph.search' : 'graph.children', { ...(query ? { ids: [query] } : {}), headers: await auth(id, jobId), query: params, deadline: deadline() }), 'OneDrive list'));
        const next = list['@odata.nextLink'] ? new URL(list['@odata.nextLink']).searchParams.get('$skiptoken') : null;
        return { items: list.value.filter(f => !f.folder && !f.deleted).map(onedriveItem), next };
      },
      async metadata(id, jobId, itemId) {
        const response = await transport.request('graph.item', { ids: [itemId], headers: await auth(id, jobId), query: new URLSearchParams({ '$select': graphFields }), deadline: deadline() });
        if ([403, 404].includes(response.status)) return null;
        const file = graphItem.parse(ok(response, 'OneDrive metadata'));
        if (file.folder || file.deleted) return null;
        return checked(onedriveItem(file), itemId);
      },
      async thumbnail(id, jobId, itemId) {
        const headers = await auth(id, jobId),response=await transport.request('graph.item', { ids: [itemId], headers, query: new URLSearchParams({ '$expand': 'thumbnails' }), deadline: deadline() });if([403,404].includes(response.status))return null;const item = graphItem.parse(ok(response, 'OneDrive metadata')), url = item.thumbnails?.[0]?.small?.url;
        return url ? image(await transport.request('graph.thumbnail', { ids: [url], headers, binary: true, maxBytes: 1_000_000, deadline: deadline() })) : null;
      },
    },
    dropbox: {
      async browse(id, jobId, { query, cursor }) {
        const headers = await auth(id, jobId);
        const files = (entries: z.infer<typeof dropboxFile>[]) => entries.filter(e => e['.tag'] === 'file').map(dropboxItem);
        if (query) return { items: files(dropboxSearch.parse(ok(await transport.request('dropbox.search', { headers, body: { query, options: { max_results: PAGE, file_status: 'active' } }, deadline: deadline() }), 'Dropbox search')).matches.map(m => m.metadata.metadata)), next: null };
        const list = dropboxList.parse(ok(await transport.request(cursor ? 'dropbox.continue' : 'dropbox.list', { headers, body: cursor ? { cursor } : { path: '', limit: PAGE }, deadline: deadline() }), 'Dropbox list'));
        return { items: files(list.entries), next: list.has_more ? list.cursor ?? null : null };
      },
      async metadata(id, jobId, itemId) {
        const stableId = `id:${itemId.replace(/^id:/, '')}`;
        const response = await transport.request('dropbox.metadata', { headers: await auth(id, jobId), body: { path: stableId, include_deleted: false }, deadline: deadline() });
        if ([403, 404].includes(response.status)) return null;
        if (response.status === 409) {
          const error = z.object({ error: z.object({ '.tag': z.literal('path'), path: z.object({ '.tag': z.enum(['not_found', 'no_permission']) }) }) }).safeParse(response.body);
          if (error.success) return null;
        }
        const file = dropboxFile.parse(ok(response, 'Dropbox metadata'));
        if (file['.tag'] !== 'file') return null;
        return checked(dropboxItem(file), stableId);
      },
      async thumbnail(id, jobId, itemId) {
        const headers = { ...await auth(id, jobId), 'Dropbox-API-Arg': JSON.stringify({ resource: { '.tag': 'path', path: `id:${itemId.replace(/^id:/, '')}` }, format: 'jpeg', size: 'w128h128' }) };
        return image(await transport.request('dropbox.thumbnail', { headers, binary: true, maxBytes: 1_000_000, deadline: deadline() }), 'image/jpeg');
      },
    },
    box: {
      async browse(id, jobId, { query, cursor }) {
        const params = new URLSearchParams({ limit: String(PAGE), fields: boxFields, ...(query ? { query, type: 'file' } : {}), ...(cursor ? { offset: cursor } : {}) });
        const list = boxList.parse(ok(await transport.request(query ? 'box.search' : 'box.items', { headers: await auth(id, jobId), query: params, deadline: deadline() }), 'Box list'));
        const offset = (list.offset ?? 0) + list.entries.length, more = list.total_count !== undefined && offset < list.total_count;
        return { items: list.entries.filter(e => e.type === 'file' && (!e.item_status || e.item_status === 'active')).map(boxItem), next: more ? String(offset) : null };
      },
      async metadata(id, jobId, itemId) {
        const response = await transport.request('box.file', { ids: [itemId], headers: await auth(id, jobId), query: new URLSearchParams({ fields: boxFields }), deadline: deadline() });
        if ([403, 404].includes(response.status)) return null;
        const file = boxFile.parse(ok(response, 'Box metadata'));
        if (file.type !== 'file' || file.item_status && file.item_status !== 'active') return null;
        return checked(boxItem(file), itemId);
      },
      async thumbnail(id, jobId, itemId) {
        return image(await transport.request('box.thumbnail', { ids: [itemId], headers: await auth(id, jobId), binary: true, maxBytes: 1_000_000, deadline: deadline() }), 'image/png');
      },
    },
  };
  return adapters[provider];
}
