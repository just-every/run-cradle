import { z } from 'zod';
import type { AttachmentMember, StoreReference } from '../../contracts/primitives';

export const storeProviders = ['google-drive', 'onedrive', 'dropbox', 'box', 'chest'] as const;
export type StoreProvider = StoreReference['provider'];
const idSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
const suffix = (host: string, domain: string) => host === domain || host.endsWith('.' + domain);
/** The store's own link must open in that store; Cradle never renders or follows anything else. */
const linkHosts: Record<Exclude<StoreProvider, 'chest'>, (host: string) => boolean> = {
  'google-drive': host => ['drive.google.com', 'docs.google.com'].includes(host),
  onedrive: host => ['onedrive.live.com', '1drv.ms'].includes(host) || suffix(host, 'sharepoint.com'),
  dropbox: host => host === 'www.dropbox.com' || host === 'dropbox.com',
  box: host => suffix(host, 'box.com'),
};
export function storeLinkAllowed(provider: StoreProvider, link: string): boolean {
  let url: URL;
  try { url = new URL(link); } catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  return provider === 'chest' ? true : linkHosts[provider](url.hostname.toLowerCase());
}
export const storeReferenceSchema: z.ZodType<StoreReference> = z.object({
  provider: z.enum(storeProviders), itemId: z.string().min(1).max(512), name: z.string().min(1).max(500), mediaType: z.string().max(255),
  size: z.number().int().min(0).nullable(), modifiedAt: z.iso.datetime().nullable(), link: z.string().min(1).max(2048),
  connectionId: idSchema.nullable(), attachedBy: idSchema,
}).strict().refine(r => storeLinkAllowed(r.provider, r.link), 'Store link does not belong to the provider');
export const attachmentMemberSchema = z.union([z.object({ fileId: idSchema }).strict(), z.object({ reference: storeReferenceSchema }).strict()]);
export const isStoreReferenceMember = (value: unknown): value is { reference: StoreReference } => !!value && typeof value === 'object' && 'reference' in value;
const canonicalKeys = ['provider', 'itemId', 'name', 'mediaType', 'size', 'modifiedAt', 'link', 'connectionId', 'attachedBy'] as const;
/** The join-table value of a reference: canonical JSON, so a ULID file id and a reference never collide. */
export const referenceValue = (reference: StoreReference): string => JSON.stringify(Object.fromEntries(canonicalKeys.map(key => [key, reference[key]])));
export const isReferenceValue = (stored: string) => stored.startsWith('{');
export function attachmentMember(stored: string): AttachmentMember {
  return isReferenceValue(stored) ? { reference: storeReferenceSchema.parse(JSON.parse(stored)) } : { fileId: stored };
}
