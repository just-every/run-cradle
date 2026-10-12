import { Webhook } from 'svix';
import { bytes, unbase64, sha256 } from '../../adapters/crypto.server';
async function verifyHmac(raw:Uint8Array,signature:string,key:Uint8Array){try{const k=await crypto.subtle.importKey('raw',key as Uint8Array<ArrayBuffer>,{name:'HMAC',hash:'SHA-256'},false,['verify']);return crypto.subtle.verify('HMAC',k,unbase64(signature) as Uint8Array<ArrayBuffer>,raw as Uint8Array<ArrayBuffer>);}catch{return false;}}
export async function verifyResendWebhook(raw:Uint8Array,headers:Headers,secret:string,now=Date.now()):Promise<{eventId:string;hash:string}>{
 const id=headers.get('svix-id'),timestamp=headers.get('svix-timestamp'),signature=headers.get('svix-signature');if(!id||!timestamp||!signature||!/^\d+$/.test(timestamp)||Math.abs(now/1000-Number(timestamp))>300||raw.length>1_000_000)throw new Error('Invalid webhook signature');
 const body=new TextDecoder('utf-8',{fatal:true}).decode(raw);
 new Webhook(secret).verify(body,{'svix-id':id,'svix-timestamp':timestamp,'svix-signature':signature});
 return {eventId:id,hash:await sha256(raw)};
}
export async function verifyXeroWebhook(raw:Uint8Array,headers:Headers,secret:string):Promise<{eventId:string;hash:string}>{if(raw.length>1_000_000||!await verifyHmac(raw,headers.get('x-xero-signature')??'',bytes(secret)))throw new Error('Invalid webhook signature');const hash=await sha256(raw);return {eventId:hash,hash};}
