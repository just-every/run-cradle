import { demoBindings } from '../../demo/bindings.server'
import type { PlatformBindings } from './bindings'
import { isLoopbackHostname } from '../shared/loopback'

/** Local mail is selected by configuration, never request Host/forwarded headers. */
export function localMailEnabled(env: PlatformBindings): boolean {
  if (env.AUTH_LOCAL !== 'true' || env.RER_VERSION || env.RER_DEPLOY_SOURCE) return false
  try {
    const url = new URL(env.APP_ORIGIN ?? '')
    return url.origin === env.APP_ORIGIN && url.protocol === 'http:' && isLoopbackHostname(url.hostname)
  } catch { return false }
}

/** The managed command chooses a local origin; hosted bindings remain authoritative. */
export function localRuntimeBindings(env: PlatformBindings): PlatformBindings {
  env = demoBindings(env)
  if (!localMailEnabled(env) || !env.RER_DEV_ORIGIN) return env
  try {
    const origin = new URL(env.RER_DEV_ORIGIN)
    if (origin.origin !== env.RER_DEV_ORIGIN || origin.protocol !== 'http:' || !isLoopbackHostname(origin.hostname)) return env
    return { ...env, APP_ORIGIN: origin.origin, AUTH_ORIGIN: origin.origin }
  } catch { return env }
}

/** Demo mail is silently suppressed by Base on local and hosted origins. */
export const capturedMailEnabled = (env: PlatformBindings) => env.RER_DEMO === '1' || localMailEnabled(env)
