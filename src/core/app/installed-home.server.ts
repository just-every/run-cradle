import { lobbyResponse } from '../../base/lobby'
import { claimedWhen, setupStateResponse } from '../../base/setup-state'
import { identity } from '../../identity'
import type { AppEnv } from './types'

// The installation is claimed once the owner confirms first-run setup at /setup (features/setup/server.ts).
const claimed = claimedWhen('SELECT 1 FROM cradle_first_run WHERE singleton = 1 AND completed_at IS NOT NULL')

/**
 * The installed instance's public front door: `GET /setup/state` and the shared Lobby at `/`, both read from the
 * first-run record. The Lobby names the persisted workspace, or the configured name when that read is unavailable,
 * as the other public screens do. Null for every other path.
 */
export async function installedHomeResponse(request: Request, bindings: AppEnv['Bindings']): Promise<Response | null> {
  const env = { DB: bindings.DB, AUTH_ORIGIN: bindings.APP_ORIGIN ?? '' }
  const state = await setupStateResponse(request, env, claimed)
  if (state) return state
  if (new URL(request.url).pathname !== '/') return null
  const workspace = await bindings.DB.prepare("SELECT name FROM workspace WHERE id='workspace'").first<{ name: string }>().catch(() => null)
  return lobbyResponse(request, env, { ...identity, deployment: workspace?.name ?? identity.deployment }, claimed)
}
