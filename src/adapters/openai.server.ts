import { pricingPolicyInput,estimateApprovedUsage } from '../domains/execution/model-cost.server';
import { unbase64,sha256 } from './crypto.server';
import { assertStructuredSchema } from './model-schema.server';
import { z } from 'zod';
import type { CredentialPort, EffectInput, ProviderAdapter, ProviderResult } from './contracts';
import type { Json } from '../contracts/primitives';
import { ProviderTransport, refusal, unknown } from './transport.server';
export const modelInput = z.object({ pricing:pricingPolicyInput.extend({hash:z.string().regex(/^[a-f0-9]{64}$/)}).nullable().optional(),model: z.string().min(1).max(128), purpose: z.string().min(1).max(128), instructions: z.string().max(16000), context: z.string().max(500_000), schemaName: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), schema: z.record(z.string(), z.unknown()), maxOutputTokens: z.number().int().min(1).max(32000), attachments:z.array(z.object({fileId:z.string(),filename:z.string().min(1).max(200),sha256:z.string().regex(/^[a-f0-9]{64}$/),mediaType:z.enum(['image/png','image/jpeg','image/webp','application/pdf']),base64:z.string().max(14_000_000)}).strict()).max(10).optional(), authorizedSourceIds: z.array(z.string()).max(1000) }).strict();
export type OutputValidator = (output: unknown, sourceIds: readonly string[], schemaName: string) => Json;
export function openaiAdapter(credentials: CredentialPort, validate: OutputValidator, transport = new ProviderTransport()): ProviderAdapter {
  return { id: 'openai', version: 'responses.v1', async preflight(e){const input=modelInput.parse(e.input);assertStructuredSchema(input.schema);await credentials.resolve(e.connectionId,'dispatch',{attemptId:e.attemptId});}, async reconcile() { return { state: 'unknown', message: 'A lost store:false response cannot be retrieved by the original command key; possible usage remains reserved.' }; }, async execute(effect: EffectInput): Promise<ProviderResult> {
    const input = modelInput.parse(effect.input); assertStructuredSchema(input.schema); const cred = await credentials.resolve(effect.connectionId,'dispatch',{attemptId:effect.attemptId});
    try {
      const content:Record<string,unknown>[]=[{type:'input_text',text:input.context}];let attachmentBytes=0;for(const file of input.attachments??[]){const raw=unbase64(file.base64);attachmentBytes+=raw.length;if(attachmentBytes>10_000_000||await sha256(raw)!==file.sha256)throw new Error('Invalid approved model attachment');const data=`data:${file.mediaType};base64,${file.base64}`;content.push(file.mediaType==='application/pdf'?{type:'input_file',filename:file.filename,file_data:data}:{type:'input_image',image_url:data,detail:'auto'});}
      const r = await transport.request('openai.responses', { headers: { authorization: `Bearer ${cred.token}` }, deadline: effect.deadline, maxRequestBytes:16_000_000, body: { model: input.model, store: false, instructions: input.instructions, input:[{role:'user',content}], max_output_tokens: input.maxOutputTokens, text: { format: { type: 'json_schema', name: input.schemaName, strict: true, schema: input.schema } } } });
      if(r.status===429&&typeof r.body==='object'&&r.body!==null&&JSON.stringify(r.body).includes('insufficient_quota'))return {state:'refused',code:'budget_exhausted',message:'Provider account quota is exhausted; configuration must change.'};
      const failed = refusal(r); if (failed) return failed;
      const parsed = z.object({ id: z.string().min(1), model: z.string(), status: z.string(), usage: z.object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative(), input_tokens_details: z.object({ cached_tokens: z.number().int().nonnegative() }).optional(), output_tokens_details: z.object({ reasoning_tokens: z.number().int().nonnegative() }).optional() }).nullable(), output: z.array(z.object({ type: z.string(), content: z.array(z.object({ type: z.string(), text: z.string().optional(), refusal: z.string().optional() })).optional() })) }).safeParse(r.body);
      if (!parsed.success) return unknown();
      const response = parsed.data; const responseContent = response.output.flatMap(o => o.content ?? []);
      const usage = response.usage ? { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, cachedInputTokens: response.usage.input_tokens_details?.cached_tokens ?? null, reasoningTokens: response.usage.output_tokens_details?.reasoning_tokens ?? null,unsupportedCategories:response.output.some(o=>!['message','reasoning'].includes(o.type)) } : null;
      // Even a refused/invalid response can incur usage. Retain it for settlement.
      if (responseContent.some(c => c.type === 'refusal') || response.status !== 'completed' || !usage) return { state: 'partial', externalId: response.id, value: { model: response.model, usage, result: 'unsuccessful' }, message: 'Model refused, was incomplete, or omitted usage; no valid generated result.' };
      const texts = responseContent.filter(c => c.type === 'output_text'); if (texts.length !== 1 || !texts[0]?.text) return { state: 'partial', externalId: response.id, value: { usage, model: response.model, result: 'invalid' }, message: 'Model output was not a single structured result.' };
      let output: Json;
      try { output = validate(JSON.parse(texts[0].text), input.authorizedSourceIds, input.schemaName); } catch { return { state: 'partial', externalId: response.id, value: { usage, model: response.model, result: 'invalid' }, message: 'Structured output or cited source identity failed independent validation.' }; }
      return { state: 'confirmed', externalId: response.id, requestId: r.requestId, receiptHash: r.hash, value: { output, usage, model: response.model, requestedModel: input.model, costEstimate:input.pricing?estimateApprovedUsage({model:response.model,usage},input.pricing):null } };
    } catch { return unknown(); }
  } };
}
