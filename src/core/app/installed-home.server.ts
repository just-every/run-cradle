import { lobbyResponse } from '../../base/lobby'
import { admitted, claimedWhen, setupStateResponse } from '../../base/setup-state'
import { identity } from '../../identity'
import type { AppEnv } from './types'

// Owner claim and workspace details are separate: rer deploy has already
// claimed the owner before that person first signs in to complete /setup.
const claimed = claimedWhen('SELECT 1 FROM oa_bootstrap WHERE singleton = 1')

/**
 * The installed instance's public front door: `GET /setup/state` and the shared Lobby at `/`, both read from the
 * durable Base owner claim. The Lobby names the persisted workspace, or the configured name when that read is unavailable,
 * as the other public screens do. An open session never sees the Lobby's sign-in prompt: `/` sends it to the workspace (VE18).
 * Null for every other path.
 */
export async function installedHomeResponse(request: Request, bindings: AppEnv['Bindings'], session: (request: Request) => Promise<unknown>): Promise<Response | null> {
  const env = { DB: bindings.DB, AUTH_ORIGIN: bindings.APP_ORIGIN ?? '' }
  const state = await setupStateResponse(request, env, claimed)
  if (state) return state
  if (new URL(request.url).pathname !== '/') return null
  if ((request.method === 'GET' || request.method === 'HEAD') && admitted(request, env.AUTH_ORIGIN) && request.headers.has('cookie') && await session(request)) {
    return new Response(null, { status: 302, headers: { location: '/app', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' } })
  }
  const workspace = await bindings.DB.prepare("SELECT name FROM workspace WHERE id='workspace'").first<{ name: string }>().catch(() => null)
  return lobbyResponse(request, env, { ...identity, deployment: workspace?.name ?? identity.deployment }, claimed)
}
