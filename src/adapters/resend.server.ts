import { z } from 'zod';
import type { CredentialPort, EffectInput, ProviderAdapter, ProviderResult } from './contracts';
import { ProviderTransport, refusal, unknown } from './transport.server';
export const mailInput = z.object({ from: z.email().max(320), to: z.email().max(320), subject: z.string().min(1).max(998).refine(s => !/[\r\n]/.test(s)), text: z.string().min(1).max(100_000), expiresAt: z.iso.datetime().nullable() }).strict();
export function resendAdapter(credentials: CredentialPort, transport = new ProviderTransport(), now = Date.now): ProviderAdapter {
  async function send(effect: EffectInput): Promise<ProviderResult> {
    const input = mailInput.parse(effect.input);
    if (effect.idempotencyKey.length > 256 || !effect.idempotencyKey) throw new Error('Invalid Resend key');
    if (now() >= Date.parse(effect.firstPossibleEffectAt) + 86_340_000 || (input.expiresAt && now() >= Date.parse(input.expiresAt))) return { state: 'unknown', message: 'Safe mail replay window expired. Original delivery needs evidence.' };
    const credential = await credentials.resolve(effect.connectionId,'dispatch',{attemptId:effect.attemptId});
    if (credential.accountId !== input.from) throw new Error('Mail sender is outside the configured connection');
    try {
      const r = await transport.request('resend.send', { headers: { authorization: `Bearer ${credential.token}`, 'Idempotency-Key': effect.idempotencyKey }, body: { from: input.from, to: [input.to], subject: input.subject, text: input.text }, deadline: effect.deadline });
      const failure = refusal(r); if (failure) return failure;
      const parsed = z.object({ id: z.string().min(1).max(256) }).safeParse(r.body);
      return parsed.success ? { state: 'confirmed', externalId: parsed.data.id, value: { acceptance: 'provider_accepted', delivered: false }, receiptHash: r.hash, requestId: r.requestId } : unknown();
    } catch { return unknown(); }
  }
  return { id: 'resend', version: '1', canReplay(e,t){const input=mailInput.parse(e.input);return t<Date.parse(e.firstPossibleEffectAt)+86_340_000&&(!input.expiresAt||t<Date.parse(input.expiresAt));}, async preflight(e){const input=mailInput.parse(e.input);const c=await credentials.resolve(e.connectionId,'dispatch',{attemptId:e.attemptId});if(c.accountId!==input.from)throw new Error('Mail sender is outside the configured connection');}, execute: send, async reconcile(effect) {
    // Reconciliation is read-only. Replay is a separately authorized execution.
    if (!effect.externalId) return { state: 'unknown', message: 'No provider email ID. Authorized identical replay is possible only within the original 24-hour window.' };
    const credential = await credentials.resolve(effect.connectionId,'readback',{attemptId:effect.attemptId});
    try {
      const r = await transport.request('resend.read', { ids: [effect.externalId], headers: { authorization: `Bearer ${credential.token}` }, deadline: effect.deadline });
      const parsed = z.object({ id: z.string(), from: z.string(), to: z.array(z.string()), subject: z.string(), last_event: z.string().optional() }).safeParse(r.body);
      const expected = mailInput.parse(effect.input);
      if (r.status !== 200 || !parsed.success || parsed.data.id !== effect.externalId || parsed.data.from !== expected.from || parsed.data.to.length !== 1 || parsed.data.to[0] !== expected.to || parsed.data.subject !== expected.subject) return unknown();
      return { state: 'confirmed', externalId: effect.externalId, value: { acceptance: 'provider_accepted', lastEvent: parsed.data.last_event ?? null }, receiptHash: r.hash, requestId: r.requestId };
    } catch { return unknown(); }
  } };
}
