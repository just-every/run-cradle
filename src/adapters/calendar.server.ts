import { z } from 'zod';
import type { CredentialPort, EffectInput, ProviderAdapter, ProviderResult } from './contracts';
import { ProviderTransport, refusal, unknown } from './transport.server';
import { sha256 } from './crypto.server';
export const calendarInput = z.object({ calendarId: z.string().min(1).max(512), summary: z.string().min(1).max(500), start: z.iso.datetime(), end: z.iso.datetime(), timezone: z.string().min(1).max(80), agreedSlotEvidenceId: z.string().min(1), operation: z.enum(['reserve', 'cancel']), eventId: z.string().regex(/^[0-9a-v]{5,1024}$/).optional(), etag: z.string().max(512).optional() }).strict().refine(v => Date.parse(v.start) < Date.parse(v.end), 'End must follow start').refine(v => v.operation !== 'cancel' || !!v.eventId && !!v.etag, 'Cancellation requires original event and ETag');
export function calendarAdapter(credentials: CredentialPort, transport = new ProviderTransport()): ProviderAdapter {
  async function identity(e: EffectInput) { const input = calendarInput.parse(e.input); const eventId = input.eventId ?? await sha256(e.idempotencyKey); const credential = await credentials.resolve(e.connectionId,'readback',{attemptId:e.attemptId}); if (credential.accountId !== input.calendarId) throw new Error('Calendar scope mismatch'); return { input, eventId, credential }; }
  async function read(e: EffectInput): Promise<ProviderResult> {
    const { input, eventId, credential } = await identity(e);
    try {
      const r = await transport.request('calendar.get', { ids: [input.calendarId, eventId], headers: { authorization: `Bearer ${credential.token}` }, deadline: e.deadline });
      const parsed = z.object({ id: z.string(), status: z.string(), summary: z.string().optional(), etag: z.string(), start: z.object({ dateTime: z.string(), timeZone: z.string().optional() }).optional(), end: z.object({ dateTime: z.string(), timeZone: z.string().optional() }).optional(), extendedProperties: z.object({ private: z.record(z.string(), z.string()) }).optional() }).safeParse(r.body);
      if (r.status !== 200 || !parsed.success || parsed.data.id !== eventId) return unknown();
      const value = parsed.data;
      if (input.operation === 'cancel' && value.status === 'cancelled') return { state: 'confirmed', externalId: eventId, value: { reservation: 'cancelled', contractorAcceptance: false, etag: value.etag }, receiptHash: r.hash, requestId: r.requestId };
      if (value.status !== 'confirmed' || value.summary !== input.summary || Date.parse(value.start?.dateTime ?? '') !== Date.parse(input.start) || Date.parse(value.end?.dateTime ?? '') !== Date.parse(input.end) || value.start?.timeZone !== input.timezone || value.end?.timeZone !== input.timezone || value.extendedProperties?.private.cradleHash !== e.canonicalInputHash || value.extendedProperties.private.cradleCommand !== e.commandId) return unknown();
      return { state: 'confirmed', externalId: eventId, value: { reservation: 'confirmed', contractorAcceptance: false, etag: value.etag, calendarId: input.calendarId }, receiptHash: r.hash, requestId: r.requestId };
    } catch { return unknown(); }
  }
  return { id: 'google-calendar', version: '1', async preflight(e){const input=calendarInput.parse(e.input);new Intl.DateTimeFormat('en',{timeZone:input.timezone});const c=await credentials.resolve(e.connectionId,'dispatch',{attemptId:e.attemptId});if(c.accountId!==input.calendarId)throw new Error('Calendar scope mismatch');}, reconcile: read, async execute(e) {
    const input = calendarInput.parse(e.input); const eventId = input.eventId ?? await sha256(e.idempotencyKey); const credential = await credentials.resolve(e.connectionId,'dispatch',{attemptId:e.attemptId});
    if (credential.accountId !== input.calendarId) throw new Error('Calendar scope mismatch');
    try {
      const headers: Record<string,string> = { authorization: `Bearer ${credential.token}` }; if (input.operation === 'cancel') headers['If-Match'] = input.etag!;
      const r = await transport.request(input.operation === 'cancel' ? 'calendar.delete' : 'calendar.insert', { ids: [input.calendarId, eventId], headers, query: new URLSearchParams({ sendUpdates: 'none' }), ...(input.operation === 'reserve' ? { body: { id: eventId, summary: input.summary, start: { dateTime: input.start, timeZone: input.timezone }, end: { dateTime: input.end, timeZone: input.timezone }, extendedProperties: { private: { cradleHash: e.canonicalInputHash, cradleCommand: e.commandId } } } } : {}), deadline: e.deadline });
      if (input.operation === 'cancel' && r.status === 204) return { state: 'confirmed', externalId: eventId, value: { reservation: 'cancelled', contractorAcceptance: false }, receiptHash: r.hash, requestId: r.requestId };
      if (r.status === 409 || r.status >= 200 && r.status < 300) return read(e);
      return refusal(r) ?? unknown();
    } catch { return unknown(); }
  } };
}
