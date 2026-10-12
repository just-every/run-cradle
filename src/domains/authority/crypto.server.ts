const encoder = new TextEncoder()
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
const decode = (value: string) => Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0))
export const randomSecret = () => base64(crypto.getRandomValues(new Uint8Array(32)))
export const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('')
const key = (secret: string) => crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
export const signToken = async (payload: object, secret: string) => {
  const body = base64(encoder.encode(JSON.stringify(payload)))
  const signature = await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(body))
  return `${body}.${base64(new Uint8Array(signature))}`
}
export const verifyToken = async (token: string, secret: string): Promise<unknown> => {
  if (token.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new Error('Invalid authentication token.')
  const [body, signature] = token.split('.') as [string, string]
  if (!await crypto.subtle.verify('HMAC', await key(secret), decode(signature), encoder.encode(body))) throw new Error('Invalid authentication token.')
  return JSON.parse(new TextDecoder().decode(decode(body))) as unknown
}
export const safeReturnTo = (value: string) => {
  if (value.length > 2048 || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(value) || /%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(value)) throw new Error('Invalid return path.')
  const parsed = new URL(value, 'https://return.invalid')
  if (parsed.origin !== 'https://return.invalid' || parsed.pathname.startsWith('/auth/')) throw new Error('Invalid return path.')
  return parsed.pathname + parsed.search + parsed.hash
}
