import { createD1DevelopmentOutbox, createDevelopmentOutboxHandler } from '../../../vendor/base/modules/mail/src/development/index.mjs'
import { devGate, devNotFound } from '../../../vendor/base/modules/operator-auth/index.mjs'
import { localMailEnabled } from './local-auth.server'
import type { PlatformBindings } from './bindings'

/**
 * The outbox and the key exchange answer only a local runtime that holds RER_DEV_KEY.
 * A tunnel or local proxy makes remote requests look local, so the outbox also needs
 * the key gate's cookie (or the rer harness's key header).
 */
export async function developmentOutboxResponse(request: Request, env: PlatformBindings) {
  const url = new URL(request.url)
  if (url.pathname !== '/__dev/outbox' && url.pathname !== '/__dev/key') return null
  if (!localMailEnabled(env)) return devNotFound()
  const gate = devGate({ key: env.RER_DEV_KEY, origin: env.APP_ORIGIN ?? '', local: true })
  if (!gate) return devNotFound()
  if (url.pathname === '/__dev/key') return gate.exchange(request)
  const trusted = new URL(env.APP_ORIGIN!)
  if (url.origin !== trusted.origin || request.headers.get('host') !== trusted.host ||
    (request.headers.has('origin') && request.headers.get('origin') !== trusted.origin) ||
    request.headers.get('sec-fetch-site') === 'cross-site' || !await gate.admits(request)) return devNotFound()
  return await createDevelopmentOutboxHandler({ local: true, origin: trusted.origin, outbox: createD1DevelopmentOutbox({ db: env.DB }) })(request) ?? devNotFound()
}
