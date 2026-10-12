import { canonical, canonicalHash } from '../admission/canonical';
export type CursorPayload = {
    binding: string;
    revision: number;
    offset: number;
};
const enc = new TextEncoder();
function b64(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''); }
function un64(v: string): Uint8Array<ArrayBuffer> { return Uint8Array.from(atob(v.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0)); }
export function createCursorCodec(secret: string) {
    if (secret.length < 32)
        throw new Error('Cursor signing secret requires at least 32 characters');
    const key = crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    return {
        async encode(payload: CursorPayload) { const bytes = enc.encode(canonical(payload)), signature = await crypto.subtle.sign('HMAC', await key, bytes); return b64(bytes) + '.' + b64(new Uint8Array(signature)); },
        async decode(token: string): Promise<CursorPayload> { try {
            const [body, sig, ...rest] = token.split('.');
            if (!body || !sig || rest.length || !await crypto.subtle.verify('HMAC', await key, un64(sig), un64(body)))
                throw new Error('Invalid signature');
            const p = JSON.parse(new TextDecoder().decode(un64(body)));
            if (typeof p.binding !== 'string' || !Number.isSafeInteger(p.revision) || !Number.isSafeInteger(p.offset) || p.offset < 0)
                throw new Error('Invalid cursor');
            return p;
        }
        catch {
            throw new Error('Invalid or stale cursor');
        } },
        binding: canonicalHash
    };
}
