import type { DevPersona } from '../../../vendor/base/modules/operator-auth/dev/index.mjs'

/**
 * Local dev personas for Cradle's real Base roles: an operator administrator and
 * an ordinary member. Each is a real operator at <as>@dev.localhost, created only
 * by local dev sign-in and suspended in exports. Only src/server.dev.ts loads this.
 */
export function devPersonas(): DevPersona[] {
  return [
    { as: 'admin', role: 'admin', displayName: 'Dev admin' },
    { as: 'member', role: 'member', displayName: 'Dev member' },
  ]
}
