import type { Money } from '../../contracts/primitives';
import { q, mul, cmp } from './exact';
export type SourcedRate={from:string;to:string;rate:string;sourceId:string;sourceVersion:number;sourceHash:string;knownAt:string;validUntil:string;rounding:'floor'|'ceil'|'half_up'};
export function convertMoney(input:Money,targetScale:number,rate:SourcedRate,cutoff:string):Money {
 if(!/^\d+$/.test(input.minor)||!Number.isInteger(input.scale)||input.scale<0||input.scale>6||!Number.isInteger(targetScale)||targetScale<0||targetScale>6||rate.from!==input.currency||!rate.sourceId||!Number.isInteger(rate.sourceVersion)||rate.sourceVersion<1||!/^[a-f0-9]{64}$/.test(rate.sourceHash)||Date.parse(rate.knownAt)>Date.parse(cutoff)||Date.parse(rate.validUntil)<=Date.parse(cutoff)||cmp(q(rate.rate),q('0'))<=0)throw new Error('invalid_or_unsourced_conversion');
 const exact=mul(mul(q(input.minor),q(rate.rate)),q(`${10n**BigInt(targetScale)}/${10n**BigInt(input.scale)}`));let rounded=exact.n/exact.d;const remainder=exact.n%exact.d;
 if(rate.rounding==='ceil'&&remainder>0n||rate.rounding==='half_up'&&remainder*2n>=exact.d)rounded++;
 return{minor:String(rounded),currency:rate.to,scale:targetScale};
}
