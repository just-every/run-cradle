import { z } from 'zod';
import type { CredentialPort, EffectInput, ProviderAdapter, ProviderResult } from './contracts';
import { ProviderTransport, refusal, unknown } from './transport.server';
const decimal = z.string().regex(/^-?\d+(?:\.\d{1,4})?$/).refine(v=>{const n=Number(v);return Number.isFinite(n)&&Math.abs(n)<=1_000_000_000;},'Amount exceeds exact provider transport range');
export const billInput = z.object({ tenantId: z.uuid(), contactId: z.uuid(), invoiceNumber: z.string().min(1).max(255), date: z.iso.date(), dueDate: z.iso.date(), currency: z.string().regex(/^[A-Z]{3}$/), lineAmountTypes: z.enum(['Exclusive', 'Inclusive', 'NoTax']), total: decimal, mappingVersion: z.number().int().positive(), lines: z.array(z.object({ description: z.string().min(1).max(4000), quantity: decimal, unitAmount: decimal, accountCode: z.string().min(1).max(32), taxType: z.string().min(1).max(64), lineAmount: decimal }).strict()).min(1).max(100) }).strict();
const billResponse = z.object({ InvoiceID: z.uuid(), Type: z.literal('ACCPAY'), Contact: z.object({ ContactID: z.uuid() }), InvoiceNumber: z.string(), CurrencyCode: z.string(), Status: z.string(), DateString: z.string().optional(), Date: z.string().optional(), DueDateString:z.string().optional(), DueDate:z.string().optional(), LineAmountTypes:z.string(), Total: z.number(), LineItems: z.array(z.object({ Description: z.string(), Quantity: z.number(), UnitAmount: z.number(), AccountCode: z.string(), TaxType: z.string(), LineAmount: z.number() })), HasErrors: z.boolean().optional(), ValidationErrors: z.array(z.unknown()).optional(), AmountDue: z.number().optional(), AmountPaid: z.number().optional(), AmountCredited: z.number().optional() });
export function xeroAdapter(credentials: CredentialPort, transport = new ProviderTransport(), now = Date.now): ProviderAdapter {
  function date(value:string|undefined){if(!value)return null;const ms=/^\/Date\((\d+)(?:[+-]\d+)?\)\/$/.exec(value);return ms?new Date(Number(ms[1])).toISOString().slice(0,10):value.slice(0,10);}
  function match(raw: unknown, expected: z.infer<typeof billInput>) { const result = billResponse.safeParse(raw); if (!result.success) return null; const b = result.data; if (date(b.DateString??b.Date)!==expected.date||date(b.DueDateString??b.DueDate)!==expected.dueDate||b.LineAmountTypes!==expected.lineAmountTypes||b.HasErrors || b.ValidationErrors?.length || b.Contact.ContactID !== expected.contactId || b.InvoiceNumber !== expected.invoiceNumber || b.CurrencyCode !== expected.currency || b.Total !== Number(expected.total) || b.LineItems.length !== expected.lines.length || b.LineItems.some((l,i) => { const e = expected.lines[i]!; return l.Description !== e.description || l.Quantity !== Number(e.quantity) || l.UnitAmount !== Number(e.unitAmount) || l.AccountCode !== e.accountCode || l.TaxType !== e.taxType || l.LineAmount !== Number(e.lineAmount); })) return null; return b; }
  async function read(e: EffectInput): Promise<ProviderResult> {
    const input = billInput.parse(e.input); const cred = await credentials.resolve(e.connectionId,'readback',{attemptId:e.attemptId}); if (cred.accountId !== input.tenantId) throw new Error('Xero tenant scope mismatch');
    try {
      const r = await transport.request(e.externalId ? 'xero.read' : 'xero.search', { ids: e.externalId ? [e.externalId] : [], query: e.externalId ? undefined : new URLSearchParams({ createdByMyApp: 'true', InvoiceNumbers: input.invoiceNumber, ContactIDs: input.contactId, page: '1' }), headers: { authorization: `Bearer ${cred.token}`, 'xero-tenant-id': input.tenantId }, deadline: e.deadline });
      const envelope = z.object({ Invoices: z.array(z.unknown()) }).safeParse(r.body); if (r.status !== 200 || !envelope.success) return unknown();
      // Search candidates are insufficient to adopt an unknown identity automatically.
      if (!e.externalId) return { state: 'unknown', message: `Accounting reconciliation found ${envelope.data.Invoices.length} candidate(s); independent identity evidence is required.` };
      if (envelope.data.Invoices.length !== 1) return unknown(); const bill = match(envelope.data.Invoices[0], input); if (!bill || bill.InvoiceID !== e.externalId) return unknown();
      return { state: 'confirmed', externalId: bill.InvoiceID, value: { handoff: 'accounting_record', status: bill.Status, amountDue: bill.AmountDue ?? null, amountPaid: bill.AmountPaid ?? null, amountCredited: bill.AmountCredited ?? null, paymentByCradle: false }, receiptHash: r.hash, requestId: r.requestId };
    } catch { return unknown(); }
  }
  return { id: 'xero', version: '1', canReplay(e,t){return t<Date.parse(e.firstPossibleEffectAt)+330_000;}, async preflight(e){const input=billInput.parse(e.input);const c=await credentials.resolve(e.connectionId,'dispatch',{attemptId:e.attemptId});if(c.accountId!==input.tenantId)throw new Error('Xero tenant scope mismatch');}, reconcile: read, async execute(e) {
    const input = billInput.parse(e.input); if (!e.idempotencyKey || e.idempotencyKey.length > 128) throw new Error('Invalid Xero key');
    if (now() >= Date.parse(e.firstPossibleEffectAt) + 330_000) return { state: 'unknown', message: 'Xero safe six-minute replay window expired; do not resend.' };
    const cred = await credentials.resolve(e.connectionId,'dispatch',{attemptId:e.attemptId}); if (cred.accountId !== input.tenantId) throw new Error('Xero tenant scope mismatch');
    try {
      const r = await transport.request('xero.create', { headers: { authorization: `Bearer ${cred.token}`, 'xero-tenant-id': input.tenantId, 'Idempotency-Key': e.idempotencyKey }, deadline: e.deadline, body: { Invoices: [{ Type: 'ACCPAY', Status: 'DRAFT', Contact: { ContactID: input.contactId }, InvoiceNumber: input.invoiceNumber, Date: input.date, DueDate: input.dueDate, CurrencyCode: input.currency, LineAmountTypes: input.lineAmountTypes, LineItems: input.lines.map(l => ({ Description: l.description, Quantity: Number(l.quantity), UnitAmount: Number(l.unitAmount), AccountCode: l.accountCode, TaxType: l.taxType, LineAmount: Number(l.lineAmount) })) }] } });
      const failure = refusal(r); if (failure) return failure;
      const envelope = z.object({ Invoices: z.array(z.unknown()).length(1) }).safeParse(r.body); if (!envelope.success) return unknown();
      const bill = match(envelope.data.Invoices[0], input); if (!bill || bill.Status !== 'DRAFT') return unknown();
      const result = await read({ ...e, externalId: bill.InvoiceID });
      return result.state === 'unknown' ? { ...result, externalId: bill.InvoiceID } : result;
    } catch { return unknown(); }
  } };
}
