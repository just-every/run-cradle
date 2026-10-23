import { z } from 'zod';
import type { StoreItem } from './file-stores.server';

const extensions: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', txt: 'text/plain', csv: 'text/csv', mp4: 'video/mp4', mp3: 'audio/mpeg', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
const byName = (name: string) => extensions[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
const thumbnailTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const isoOrNull = (value: string | undefined) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const sizeOrNull = (value: string | number | undefined) => value === undefined || value === '' ? null : Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const hex = (length: number) => z.string().regex(new RegExp(`^[a-fA-F0-9]{${length}}$`)).nullish();
const quickxor = z.string().regex(/^[A-Za-z0-9+/]{27}=$/).nullish();

/** Explicit selectors include every supported content digest, so missing means the provider gave none. */
export const driveFields = 'id,name,mimeType,size,modifiedTime,webViewLink,thumbnailLink,sha256Checksum,sha1Checksum,md5Checksum,trashed';
export const graphFields = 'id,name,size,lastModifiedDateTime,webUrl,file,folder,deleted';
export const boxFields = 'id,name,size,modified_at,extension,type,sha1,item_status';
export const driveFile = z.object({ id: z.string().min(1), name: z.string().min(1), mimeType: z.string(), size: z.string().optional(), modifiedTime: z.string().optional(), webViewLink: z.string().min(1), thumbnailLink: z.string().optional(), sha256Checksum: hex(64), sha1Checksum: hex(40), md5Checksum: hex(32), trashed: z.boolean().optional() });
export const driveList = z.object({ files: z.array(driveFile).max(1000), nextPageToken: z.string().optional() });
// Graph documents sha256Hash as unsupported; quickXorHash is the content hash available across home and work drives.
export const graphItem = z.object({ id: z.string().min(1), name: z.string().min(1), size: z.number().optional(), lastModifiedDateTime: z.string().optional(), webUrl: z.string().min(1), file: z.object({ mimeType: z.string().optional(), hashes: z.object({ quickXorHash: quickxor }).optional() }).optional(), folder: z.unknown().optional(), deleted: z.unknown().optional(), thumbnails: z.array(z.object({ small: z.object({ url: z.string() }).optional() })).optional() });
export const graphList = z.object({ value: z.array(graphItem).max(1000), '@odata.nextLink': z.string().optional() });
export const dropboxFile = z.object({ '.tag': z.string(), id: z.string().min(1), name: z.string().min(1), path_display: z.string().optional(), size: z.number().optional(), server_modified: z.string().optional(), content_hash: hex(64) });
export const dropboxList = z.object({ entries: z.array(dropboxFile).max(1000), cursor: z.string().optional(), has_more: z.boolean().optional() });
export const dropboxSearch = z.object({ matches: z.array(z.object({ metadata: z.object({ metadata: dropboxFile }) })).max(1000) });
export const boxFile = z.object({ type: z.string(), id: z.string().min(1), name: z.string().min(1), size: z.number().optional(), modified_at: z.string().optional(), extension: z.string().optional(), sha1: hex(40), item_status: z.enum(['active', 'trashed', 'deleted']).optional() });
export const boxList = z.object({ entries: z.array(boxFile).max(1000), total_count: z.number().optional(), offset: z.number().optional(), limit: z.number().optional() });

export function driveItem(f: z.infer<typeof driveFile>): StoreItem {
  const digest: StoreItem['digest'] = f.sha256Checksum ? { algorithm: 'sha256', value: f.sha256Checksum.toLowerCase() } : f.sha1Checksum ? { algorithm: 'sha1', value: f.sha1Checksum.toLowerCase() } : f.md5Checksum ? { algorithm: 'md5', value: f.md5Checksum.toLowerCase() } : null;
  return { itemId: f.id, name: f.name, mediaType: f.mimeType, size: sizeOrNull(f.size), modifiedAt: isoOrNull(f.modifiedTime), link: f.webViewLink, thumbnail: !!f.thumbnailLink, digest };
}
export function onedriveItem(f: z.infer<typeof graphItem>): StoreItem {
  const mediaType = f.file?.mimeType ?? byName(f.name), hash = f.file?.hashes?.quickXorHash;
  return { itemId: f.id, name: f.name, mediaType, size: sizeOrNull(f.size), modifiedAt: isoOrNull(f.lastModifiedDateTime), link: f.webUrl, thumbnail: thumbnailTypes.has(mediaType), digest: hash ? { algorithm: 'quickxor', value: hash } : null };
}
export function dropboxItem(f: z.infer<typeof dropboxFile>): StoreItem {
  const mediaType = byName(f.name);
  return { itemId: f.id, name: f.name, mediaType, size: sizeOrNull(f.size), modifiedAt: isoOrNull(f.server_modified), link: `https://www.dropbox.com/home${(f.path_display ?? '').split('/').map(encodeURIComponent).join('/')}`, thumbnail: thumbnailTypes.has(mediaType), digest: f.content_hash ? { algorithm: 'dropbox-content-hash', value: f.content_hash.toLowerCase() } : null };
}
export function boxItem(f: z.infer<typeof boxFile>): StoreItem {
  return { itemId: f.id, name: f.name, mediaType: byName(f.name), size: sizeOrNull(f.size), modifiedAt: isoOrNull(f.modified_at), link: `https://app.box.com/file/${encodeURIComponent(f.id)}`, thumbnail: true, digest: f.sha1 ? { algorithm: 'sha1', value: f.sha1.toLowerCase() } : null };
}
