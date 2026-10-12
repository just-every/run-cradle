import { createHash, createHmac, timingSafeEqual, sign, verify } from 'node:crypto';
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}
export function mac(token, method, path, timestamp, nonce, body) {
  return createHmac('sha256', token).update([method, path, timestamp, nonce, hash(body)].join('\n')).digest('hex');
}
export function authenticate(headers, method, path, body, token, now = Date.now()) {
  const timestamp = headers['x-cradle-timestamp'], nonce = headers['x-cradle-nonce'], supplied = headers['x-cradle-signature'];
  if (!/^\d{13}$/.test(timestamp ?? '') || Math.abs(now - Number(timestamp)) > 60_000 || !/^[a-zA-Z0-9_-]{24,100}$/.test(nonce ?? '') || !/^[a-f0-9]{64}$/.test(supplied ?? '')) throw new Error('unauthorized_request');
  const expected = mac(token, method, path, timestamp, nonce, body);
  if (!timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) throw new Error('unauthorized_request');
  return { nonce, expiresAt: Number(timestamp) + 60_000 };
}
export function attest(payload, privateKey) {
  return { payload, signature: sign(null, Buffer.from(canonical(payload)), privateKey).toString('base64') };
}
export function verifyAttestation(envelope, publicKey) {
  return verify(null, Buffer.from(canonical(envelope.payload)), publicKey, Buffer.from(envelope.signature, 'base64'));
}
export function redact(text, secrets = []) {
  let result = String(text).replace(/(bearer\s+|(?:api[_-]?key|token|secret|password)\s*[=:]\s*)[^\s,;]+/gi, '$1[REDACTED]');
  for (const secret of secrets.filter(s => s && s.length >= 4)) result = result.split(secret).join('[REDACTED]');
  return result.slice(0, 65_536);
}
