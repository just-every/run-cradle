import { base64url, bytes, unbase64 } from '../../adapters/crypto.server';
export type Sealed = { keyVersion: string; iv: string; ciphertext: string };
export interface Keyring { currentVersion: string; key(version: string): Promise<CryptoKey> }
const aad = (workspaceId: string, connectionId: string, purpose: string, version: string) => bytes(JSON.stringify({ workspaceId, connectionId, purpose, version }));
export async function seal(keyring: Keyring, workspaceId: string, connectionId: string, purpose: string, plaintext: string): Promise<Sealed> {
  const keyVersion = keyring.currentVersion; const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(workspaceId, connectionId, purpose, keyVersion) }, await keyring.key(keyVersion), bytes(plaintext));
  return { keyVersion, iv: base64url(iv), ciphertext: base64url(new Uint8Array(ciphertext)) };
}
export async function open(keyring: Keyring, workspaceId: string, connectionId: string, purpose: string, sealed: Sealed): Promise<string> {
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unbase64(sealed.iv) as Uint8Array<ArrayBuffer>, additionalData: aad(workspaceId, connectionId, purpose, sealed.keyVersion) }, await keyring.key(sealed.keyVersion), unbase64(sealed.ciphertext) as Uint8Array<ArrayBuffer>);
  return new TextDecoder().decode(raw);
}
export function environmentKeyring(currentVersion: string, resolve: (version: string) => string | undefined): Keyring {
  return { currentVersion, async key(version) { const raw = resolve(version); if (!raw) throw new Error(`Missing connection encryption key version ${version}`); const bytes = unbase64(raw); if (bytes.length !== 32) throw new Error('Connection encryption key must be 256 bits'); return crypto.subtle.importKey('raw', bytes as Uint8Array<ArrayBuffer>, 'AES-GCM', false, ['encrypt', 'decrypt']); } };
}
