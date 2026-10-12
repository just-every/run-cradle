/** Exact arithmetic; strings at every JSON boundary, never floating-point money. */
export type Rational = { n: bigint; d: bigint };
const gcd=(a:bigint,b:bigint):bigint=>b===0n?(a<0n?-a:a):gcd(b,a%b);
export function q(value:string):Rational {
  if(!/^-?\d+(?:\/\d+|\.\d+)?$/.test(value)||value.length>160) throw new Error('invalid_exact_number');
  let n:bigint,d:bigint;
  if(value.includes('/')) {const parts=value.split('/');n=BigInt(parts[0]);d=BigInt(parts[1]);}
  else {const [whole,fraction='']=value.split('.');d=10n**BigInt(fraction.length);n=BigInt(whole)*d+(whole.startsWith('-')?-1n:1n)*BigInt(fraction||'0');}
  if(d<=0n) throw new Error('invalid_denominator');const g=gcd(n,d);return {n:n/g,d:d/g};
}
export const add=(a:Rational,b:Rational)=>q(`${a.n*b.d+b.n*a.d}/${a.d*b.d}`);
export const sub=(a:Rational,b:Rational)=>q(`${a.n*b.d-b.n*a.d}/${a.d*b.d}`);
export const mul=(a:Rational,b:Rational)=>q(`${a.n*b.n}/${a.d*b.d}`);
export const cmp=(a:Rational,b:Rational)=>a.n*b.d<b.n*a.d?-1:a.n*b.d>b.n*a.d?1:0;
export const fmt=(a:Rational)=>a.d===1n?String(a.n):`${a.n}/${a.d}`;
export const sum=(values:string[])=>values.reduce((a,v)=>add(a,q(v)),q('0'));
export function canonical(value:unknown):string {if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(',')}}`;}
export async function digest(value:unknown){const bytes=new TextEncoder().encode(canonical(value));return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');}
