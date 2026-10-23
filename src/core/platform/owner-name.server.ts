import { readInput } from '../../../vendor/base/modules/operator-auth/input.mjs'
import { requirePost } from '../../../vendor/base/modules/operator-auth/http.mjs'
import { localMailEnabled } from './local-auth.server'
import type { PlatformBindings } from './bindings'

/** Installation answers replace the bootstrap placeholder, never a chosen name. */
export function initialOwnerName<T>(env: PlatformBindings, requested: T): T | string {
  const configured = env.OWNER_NAME?.trim()
  return configured && (requested === undefined || requested === 'Owner') ? configured : requested
}

/** Base owns signed admission; supply its initial name through the existing input. */
export async function namedOwnerClaim(request: Request, env: PlatformBindings): Promise<Request> {
  if (request.method !== 'POST' || !env.OWNER_NAME?.trim()) return request
  requirePost(request, { origin: env.APP_ORIGIN ?? '', local: localMailEnabled(env) })
  const input = await readInput(request.clone())
  const name = initialOwnerName(env, input.displayName)
  if (name === input.displayName) return request
  const headers = new Headers(request.headers)
  headers.set('content-type', 'application/json')
  headers.delete('content-length')
  return new Request(request, { headers, body: JSON.stringify({ ...input, displayName: name }) })
}
