import { z } from 'zod';
import type { Money } from '../../contracts/primitives';
export type ModelPricing={revision:string;currency:string;scale:number;inputPerMillionMinor:string;cachedInputPerMillionMinor:string;outputPerMillionMinor:string};
/** Owner-approved pricing is an estimate, distinct from provider-reported billing. */
export function estimateModelCost(usage:{inputTokens:number;outputTokens:number;cachedInputTokens:number;reasoningTokens:number},pricing:ModelPricing):{estimatedCost:Money;pricingRevision:string}{
 for(const value of Object.values(usage))if(!Number.isSafeInteger(value)||value<0)throw new Error('Invalid measured token usage');
 if(usage.cachedInputTokens>usage.inputTokens||usage.reasoningTokens>usage.outputTokens)throw new Error('Inconsistent measured token usage');
 const rate=(s:string)=>{if(!/^(0|[1-9]\d*)$/.test(s))throw new Error('Pricing rates must be exact nonnegative minor-unit integers');return BigInt(s);};
 if(!pricing.revision||!/^\p{Lu}{3}$/u.test(pricing.currency)||!Number.isInteger(pricing.scale)||pricing.scale<0||pricing.scale>12)throw new Error('Invalid pricing profile');
 const numerator=BigInt(usage.inputTokens-usage.cachedInputTokens)*rate(pricing.inputPerMillionMinor)+BigInt(usage.cachedInputTokens)*rate(pricing.cachedInputPerMillionMinor)+BigInt(usage.outputTokens)*rate(pricing.outputPerMillionMinor);
 // Reasoning tokens are already included in output_tokens; do not charge twice.
 return {estimatedCost:{minor:((numerator+999_999n)/1_000_000n).toString(),currency:pricing.currency,scale:pricing.scale},pricingRevision:pricing.revision};
}

export const pricingPolicyInput=z.object({mode:z.literal('conservative_token_estimate'),version:z.number().int().positive(),model:z.string().min(1).max(128),acceptedResponseModels:z.array(z.string().min(1).max(128)).min(1).max(20),currency:z.string().regex(/^[A-Z]{3}$/),scale:z.number().int().min(0).max(6),inputPerMillionMinor:z.string().regex(/^(0|[1-9]\d*)$/),cachedInputPerMillionMinor:z.string().regex(/^(0|[1-9]\d*)$/),outputPerMillionMinor:z.string().regex(/^(0|[1-9]\d*)$/),reasoning:z.literal('included_in_output'),tools:z.literal('disabled'),provenance:z.string().min(1).max(2000),asOf:z.iso.datetime()}).strict();
export type ModelPricingPolicy=z.infer<typeof pricingPolicyInput>&{hash:string};
export function estimateApprovedUsage(value:unknown,policy:ModelPricingPolicy):{estimatedCost:Money;pricingRevision:string;pricingPolicyHash:string;provenance:string;asOf:string}|null {
 const v=z.object({model:z.string(),usage:z.object({inputTokens:z.number().int().nonnegative(),outputTokens:z.number().int().nonnegative(),cachedInputTokens:z.number().int().nonnegative(),reasoningTokens:z.number().int().nonnegative(),unsupportedCategories:z.boolean().optional()})}).safeParse(value);
 if(!v.success||v.data.usage.unsupportedCategories||!policy.acceptedResponseModels.includes(v.data.model))return null;
 try{return {...estimateModelCost(v.data.usage,{...policy,revision:String(policy.version)}),pricingPolicyHash:policy.hash,provenance:policy.provenance,asOf:policy.asOf};}catch{return null;}
}
