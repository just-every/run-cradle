import { z } from 'zod';
import { portableStoreSchema,storeDigestSchema,canonicalStoreJson } from './portable-store-references';
import type { AttachmentMember, StoreReference } from '../../contracts/primitives';

import {storeProviders,storeLinkAllowed} from './store-reference-links';
export {storeProviders,storeLinkAllowed} from './store-reference-links';
export type {StoreProvider} from './store-reference-links';
const idSchema=z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
export const storeReferenceSchema: z.ZodType<StoreReference> = z.object({
  provider: z.enum(storeProviders), itemId: z.string().min(1).max(512), name: z.string().min(1).max(500), mediaType: z.string().max(255),
  size: z.number().int().min(0).nullable(), modifiedAt: z.iso.datetime().nullable(), link: z.string().min(1).max(2048),
  connectionId: idSchema.nullable(), attachedBy: z.string().min(1).max(500),
  account:z.string().min(1).max(512).nullable().optional(),digest:storeDigestSchema.nullable().optional(),attachedAt:z.iso.datetime().optional(),portable:portableStoreSchema.optional(),resolution:z.literal('unresolved').optional(),
}).strict().refine(r => r.resolution==='unresolved'&&r.portable ? r.connectionId===null&&r.link===(r.portable.link??'') : storeLinkAllowed(r.provider, r.link), 'Store link does not belong to the provider');
export const attachmentMemberSchema = z.union([z.object({ fileId: idSchema }).strict(), z.object({ reference: storeReferenceSchema }).strict()]);
export const isStoreReferenceMember = (value: unknown): value is { reference: StoreReference } => !!value && typeof value === 'object' && 'reference' in value;
const canonicalKeys = ['provider', 'itemId', 'name', 'mediaType', 'size', 'modifiedAt', 'link', 'connectionId', 'attachedBy'] as const;
/** The join-table value of a reference: canonical JSON, so a ULID file id and a reference never collide. */
export const referenceValue = (reference: StoreReference): string => JSON.stringify({...Object.fromEntries(canonicalKeys.map(key => [key, reference[key]])),...Object.fromEntries(['account','digest','attachedAt','portable','resolution'].filter(key=>Object.hasOwn(reference,key)).map(key=>[key,key==='portable'||key==='digest'?JSON.parse(canonicalStoreJson(reference[key as keyof StoreReference])):reference[key as keyof StoreReference]]))});
export const isReferenceValue = (stored: string) => stored.startsWith('{');
export function attachmentMember(stored: string): AttachmentMember {
  return isReferenceValue(stored) ? { reference: storeReferenceSchema.parse(JSON.parse(stored)) } : { fileId: stored };
}
