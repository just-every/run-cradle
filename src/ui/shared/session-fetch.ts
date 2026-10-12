export class SessionFailure extends Error { constructor(readonly status: number, message: string) { super(message) } }
/** Session-bound CSRF tokens stay in memory and never enter URL, storage or model context. */
let csrf: string | null = null
let pending: Promise<string> | null = null
const revoked = () => { csrf = null; document.dispatchEvent(new Event('cradle:session-revoked')) }
async function token() {
  if (csrf) return csrf
  if (!pending) pending = fetch('/auth/csrf', { credentials: 'same-origin', headers: { Accept: 'application/json' } }).then(async response => {
    if (!response.ok) { if(response.status===401)revoked(); throw new SessionFailure(response.status, `Session verification returned ${response.status}. Sign in again if your session expired.`) }
    const body: unknown = await response.json()
    if (!body || typeof body !== 'object' || !('csrfToken' in body) || typeof body.csrfToken !== 'string') throw new Error('Session verification returned an invalid response.')
    csrf = body.csrfToken; return csrf
  }).finally(() => { pending = null })
  return pending
}
export async function sessionFetch(url: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase()
  const headers = new Headers(init?.headers)
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('x-csrf-token', await token())
  const response = await fetch(url, { ...init, credentials: 'same-origin', headers })
  if (response.status === 401 || response.status === 403) csrf = null
  if(response.status===401 || (response.ok && ['/auth/sign-out','/auth/signout'].includes(new URL(url,location.origin).pathname)))revoked()
  return response
}
