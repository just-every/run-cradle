export const bytes = (text: string) => new TextEncoder().encode(text);
export function base64(data: Uint8Array): string { let s = ''; for (const b of data) s += String.fromCharCode(b); return btoa(s); }
export function unbase64(value: string): Uint8Array { return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)); }
export function base64url(data: Uint8Array): string { return base64(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
export async function sha256(value: string | Uint8Array): Promise<string> { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? bytes(value) : value as Uint8Array<ArrayBuffer>)), n => n.toString(16).padStart(2, '0')).join(''); }
export function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical((value as Record<string, unknown>)[k])).join(',') + '}';
  throw new Error('Noncanonical input');
}
export const randomToken = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
