import https from 'node:https';
import dns from 'node:dns/promises';
import { isIP } from 'node:net';
import { hash } from './integrity.mjs';
import { MAX_ARTIFACT } from './bundle.mjs';
export function publicAddress(address) {
  if (isIP(address) === 4) {
    const [a,b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a === 198);
  }
  return isIP(address) === 6 && !/^(::|fc|fd|fe[89ab]|ff)/i.test(address) && !address.includes('.');
}
export async function download(ref, allowedOrigins, signal) {
  if (!ref || !/^[a-f0-9]{64}$/.test(ref.sha256) || typeof ref.id !== 'string') throw new Error('invalid_artifact_reference');
  const url = new URL(ref.downloadUrl);
  if (url.protocol !== 'https:' || url.username || url.password || !allowedOrigins.includes(url.origin)) throw new Error('artifact_origin_denied');
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw new Error('artifact_address_denied');
  const pinned = addresses[0];
  const bytes = await new Promise((resolve, reject) => {
    const request = https.get(url, { signal, timeout: 15_000, lookup: (_hostname, options, callback) => {
      if (options.all) callback(null, [pinned]); else callback(null, pinned.address, pinned.family);
    } }, response => {
      if (response.statusCode !== 200) { response.resume(); reject(new Error('artifact_download_failed')); return; }
      let size = 0; const chunks = [];
      response.on('data', chunk => { size += chunk.length; if (size > MAX_ARTIFACT) request.destroy(new Error('artifact_too_large')); else chunks.push(chunk); });
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error('artifact_download_timeout')));
    request.on('error', reject);
  });
  if (hash(bytes) !== ref.sha256) throw new Error('artifact_hash_mismatch');
  return bytes;
}
