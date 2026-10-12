import { z } from 'zod';
import type { CredentialPort } from './contracts';
import { ProviderTransport } from './transport.server';
import { parseMail } from './mime.server';
import type { SafeMailPart } from './mime.server';
import { sha256, unbase64 } from './crypto.server';
export const intakeScope = z.object({ labelIds: z.array(z.string().min(1).max(128)).min(1).max(20), after: z.iso.datetime(), before: z.iso.datetime(), maxMessages: z.number().int().min(1).max(500), maxMessageBytes: z.number().int().min(1).max(10_000_000) }).strict().refine(s => Date.parse(s.after) < Date.parse(s.before));
export interface MailIntakePort {
  assertAllowed(connectionId: string, messageId: string, labels: string[], receivedAt: string): Promise<void>;
  ingest(input: { connectionId: string; externalId: string; rawMime: Uint8Array; sha256: string; receivedAt: string; labels: string[]; ingestionVersion: 1; plainText:string; attachments:SafeMailPart[] }): Promise<void>;
  checkpoint(input: { connectionId: string; scopeHash: string; pageToken: string | null; observedAt: string }): Promise<void>;
}
/** Raw MIME is private source bytes. E parses bounded MIME/attachments; no external URL is fetched. */
export function gmailPoller(credentials: CredentialPort, intake: MailIntakePort, transport = new ProviderTransport()) {
  return async (connectionId: string, rawScope: unknown, pageToken: string | null, deadline: string,operation?:{jobId:string}) => {
    const scope = intakeScope.parse(rawScope); const cred = await credentials.resolve(connectionId, 'readback',operation);
    if (!cred.scopes.includes('https://www.googleapis.com/auth/gmail.readonly')) throw new Error('Gmail readonly consent is missing');
    const headers = { authorization: `Bearer ${cred.token}` }; const query = new URLSearchParams({ maxResults: String(Math.min(100, scope.maxMessages)), q: `after:${Math.floor(Date.parse(scope.after)/1000)} before:${Math.floor(Date.parse(scope.before)/1000)}` });
    for (const label of scope.labelIds) query.append('labelIds', label); if (pageToken) query.set('pageToken', pageToken);
    const listed = await transport.request('gmail.list', { headers, query, deadline });
    const list = z.object({ messages: z.array(z.object({ id: z.string().min(1) })).optional(), nextPageToken: z.string().optional() }).safeParse(listed.body);
    if (listed.status !== 200 || !list.success) throw new Error('Gmail listing unavailable');
    const ids = list.data.messages ?? []; if (ids.length > scope.maxMessages) throw new Error('Gmail batch exceeded declared bound');
    let accepted = 0;
    for (const message of ids) {
      const result = await transport.request('gmail.message', { ids: [message.id], query: new URLSearchParams({ format: 'raw' }), headers, deadline, maxBytes: Math.ceil(scope.maxMessageBytes * 1.5) + 10000 });
      const parsed = z.object({ id: z.string(), labelIds: z.array(z.string()), internalDate: z.string().regex(/^\d+$/), raw: z.string() }).safeParse(result.body);
      if (result.status !== 200 || !parsed.success || parsed.data.id !== message.id) throw new Error('Gmail source missing or invalid; checkpoint not advanced');
      const m = parsed.data; const at = Number(m.internalDate);
      if (!Number.isSafeInteger(at) || at < Date.parse(scope.after) || at >= Date.parse(scope.before) || !scope.labelIds.every(l => m.labelIds.includes(l))) throw new Error('Gmail message left approved intake scope');
      const rawMime = unbase64(m.raw); if (rawMime.length > scope.maxMessageBytes) throw new Error('Gmail source exceeds byte limit');
      const receivedAt = new Date(at).toISOString(); await intake.assertAllowed(connectionId, m.id, m.labelIds, receivedAt);
      const parsedMail=await parseMail(rawMime,{maxBytes:scope.maxMessageBytes,maxAttachments:20,maxParts:100,maxDepth:8});
      await intake.ingest({ ...parsedMail, connectionId, externalId: m.id, rawMime, sha256: await sha256(rawMime), receivedAt, labels: m.labelIds, ingestionVersion: 1 }); accepted++;
    }
    const next = list.data.nextPageToken ?? null;
    await intake.checkpoint({ connectionId, scopeHash: await sha256(JSON.stringify(scope)), pageToken: next, observedAt: new Date().toISOString() });
    return { accepted, nextPageToken: next, complete: next === null };
  };
}
